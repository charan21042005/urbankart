const express = require('express');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { authenticate, loadCurrentUser } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, loadCurrentUser);
const MAX_QUANTITY = 2_147_483_647;

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY;
}

function sameId(left, right) {
  return String(left) === String(right);
}

function findCartProduct(cart, productId) {
  return cart.items.find((item) => sameId(item.productId?._id || item.productId, productId));
}

function validateProductId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

class CheckoutError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

router.get('/', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.auth.userId }).populate(
      'items.productId', 'name price stock category'
    );
    return res.status(200).json(cart || { userId: req.auth.userId, items: [] });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve cart.' });
  }
});

router.post('/items', async (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!validateProductId(productId) || !isPositiveInteger(quantity)) {
    return res.status(400).json({ status: 'error', message: 'A valid product ID and positive integer quantity are required.' });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    let cart = await Cart.findOne({ userId: req.auth.userId });
    if (!cart) cart = new Cart({ userId: req.auth.userId, items: [] });

    const existingItem = findCartProduct(cart, product._id);
    const requestedTotal = (existingItem?.quantity || 0) + quantity;
    if (product.stock < requestedTotal) {
      return res.status(409).json({ status: 'error', message: 'Requested quantity is not currently available.' });
    }
    if (existingItem) existingItem.quantity = requestedTotal;
    else cart.items.push({ productId: product._id, quantity });
    await cart.save();
    return res.status(existingItem ? 200 : 201).json(cart);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to update cart.' });
  }
});

router.patch('/items/:productId', async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body || {};
  if (!validateProductId(productId) || !isPositiveInteger(quantity)) {
    return res.status(400).json({ status: 'error', message: 'A valid product ID and positive integer quantity are required.' });
  }

  try {
    const [product, cart] = await Promise.all([
      Product.findById(productId),
      Cart.findOne({ userId: req.auth.userId })
    ]);
    if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
    if (!cart) return res.status(404).json({ status: 'error', message: 'Cart item not found.' });
    const item = findCartProduct(cart, product._id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Cart item not found.' });
    if (quantity > product.stock) {
      return res.status(409).json({ status: 'error', message: 'Requested quantity is not currently available.' });
    }
    item.quantity = quantity;
    await cart.save();
    return res.status(200).json(cart);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to update cart.' });
  }
});

router.delete('/items/:productId', async (req, res) => {
  const { productId } = req.params;
  if (!validateProductId(productId)) {
    return res.status(400).json({ status: 'error', message: 'Product ID is invalid.' });
  }

  try {
    const cart = await Cart.findOne({ userId: req.auth.userId });
    if (!cart) return res.status(404).json({ status: 'error', message: 'Cart item not found.' });
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((item) => !sameId(item.productId?._id || item.productId, productId));
    if (cart.items.length === originalLength) {
      return res.status(404).json({ status: 'error', message: 'Cart item not found.' });
    }
    await cart.save();
    return res.status(200).json(cart);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to update cart.' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.auth.userId });
    if (!cart) return res.status(200).json({ userId: req.auth.userId, items: [] });
    cart.items = [];
    await cart.save();
    return res.status(200).json(cart);
  } catch {
    return res.status(500).json({ status: 'error', message: 'Failed to clear cart.' });
  }
});

router.post('/checkout', async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    let createdOrder;
    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ userId: req.auth.userId }).session(session);
      if (!cart?.items.length) throw new CheckoutError(409, 'Cart is empty.');

      const snapshots = [];
      let totalAmount = 0;
      for (const item of cart.items) {
        const product = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { returnDocument: 'after', session }
        );
        if (!product) {
          throw new CheckoutError(409, 'A cart product is unavailable or has insufficient stock.');
        }
        snapshots.push({
          productId: product._id,
          nameAtPurchase: product.name,
          priceAtPurchase: product.price,
          qty: item.quantity
        });
        totalAmount += product.price * item.quantity;
      }

      const [order] = await Order.create([{
        customerId: req.auth.userId,
        items: snapshots,
        totalAmount: Number(totalAmount.toFixed(2))
      }], { session });
      const clearResult = await Cart.updateOne(
        { _id: cart._id, userId: req.auth.userId },
        { $set: { items: [] } },
        { session }
      );
      if (clearResult.matchedCount !== 1) throw new Error('Cart changed during checkout.');
      createdOrder = order;
    });
    return res.status(201).json({ status: 'success', order: createdOrder });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return res.status(error.status).json({ status: 'error', message: error.message });
    }
    return res.status(503).json({
      status: 'error',
      message: 'Checkout could not be completed or confirmed. Verify the cart and orders before retrying.'
    });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
