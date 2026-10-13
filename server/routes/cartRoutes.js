const express = require('express');
const mongoose = require('mongoose');
const crypto = require('node:crypto');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const CheckoutOperation = require('../models/CheckoutOperation');
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

function validIdempotencyKey(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128
    && /^[A-Za-z0-9._~-]+$/.test(value);
}

function cartFingerprint(cart) {
  const quantities = new Map();
  for (const item of cart?.items || []) {
    const productId = String(item.productId?._id || item.productId).toLowerCase();
    quantities.set(productId, (quantities.get(productId) || 0) + item.quantity);
  }
  const intent = [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right));
  return crypto.createHash('sha256').update(JSON.stringify(intent)).digest('hex');
}

async function findOperation(userId, key) {
  return CheckoutOperation.findOne({ userId, key }).populate('orderId').lean();
}

function operationResponse(operation, replayed, res) {
  if (!operation?.orderId) return res.status(404).json({ status: 'error', message: 'Checkout result not found.' });
  return res.status(replayed ? 200 : 201).json({ status: 'success', replayed, order: operation.orderId });
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

router.get('/checkout/:key', async (req, res) => {
  const { key } = req.params;
  if (!validIdempotencyKey(key)) {
    return res.status(400).json({ status: 'error', message: 'A valid checkout key is required.' });
  }
  try {
    const operation = await findOperation(req.auth.userId, key);
    if (!operation) return res.status(404).json({ status: 'error', message: 'Checkout result not found.' });
    return operationResponse(operation, true, res);
  } catch {
    return res.status(503).json({ status: 'error', message: 'Checkout status could not be confirmed. Try checking again.' });
  }
});

router.post('/checkout', async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!validIdempotencyKey(key)) {
    return res.status(400).json({ status: 'error', message: 'Idempotency-Key must be 16 to 128 letters, numbers, dots, underscores, tildes, or hyphens.' });
  }

  let fingerprint;
  try {
    const observedCart = await Cart.findOne({ userId: req.auth.userId }).lean();
    fingerprint = cartFingerprint(observedCart);
    const prior = await findOperation(req.auth.userId, key);
    if (prior) {
      if (observedCart?.items?.length && fingerprint !== prior.fingerprint) {
        return res.status(409).json({ status: 'error', code: 'IDEMPOTENCY_KEY_REUSED', message: 'This checkout key was already used for a different cart. Review your cart before starting another checkout.' });
      }
      return operationResponse(prior, true, res);
    }
    if (!observedCart?.items?.length) {
      return res.status(409).json({ status: 'error', message: 'Cart is empty.' });
    }
  } catch {
    return res.status(503).json({ status: 'error', message: 'Checkout could not be prepared. Check the cart status before retrying.' });
  }

  let session;
  try {
    session = await mongoose.startSession();
    let completedOperation;
    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ userId: req.auth.userId }).session(session);
      if (!cart?.items.length) throw new CheckoutError(409, 'Cart is empty.');
      if (cartFingerprint(cart) !== fingerprint) {
        throw new CheckoutError(409, 'Cart changed while checkout was starting. Review it and use a new checkout attempt.');
      }

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
      const [operation] = await CheckoutOperation.create([{
        userId: req.auth.userId,
        key,
        fingerprint,
        orderId: order._id
      }], { session });
      const clearResult = await Cart.updateOne(
        { _id: cart._id, userId: req.auth.userId },
        { $set: { items: [] } },
        { session }
      );
      if (clearResult.matchedCount !== 1) throw new Error('Cart changed during checkout.');
      completedOperation = { ...operation.toObject(), orderId: order };
    });
    return res.status(201).json({ status: 'success', replayed: false, order: completedOperation.orderId });
  } catch (error) {
    // A unique-key race or uncertain commit may have completed in another transaction.
    // Read only the user-scoped operation; never turn an unverified error into success.
    try {
      const committed = await findOperation(req.auth.userId, key);
      if (committed) {
        if (fingerprint !== committed.fingerprint) {
          return res.status(409).json({ status: 'error', code: 'IDEMPOTENCY_KEY_REUSED', message: 'This checkout key was already used for a different cart.' });
        }
        return operationResponse(committed, true, res);
      }
    } catch {
      // Preserve the ambiguous 503 below when reconciliation is unavailable.
    }
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
