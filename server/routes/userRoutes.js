// User endpoints serve self-service account actions and admin customer management.
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const { authenticate, loadCurrentUser, requireAdmin } = require('../middleware/auth');

const router = express.Router();
// Require a valid token and reload the current user for every endpoint by default.
router.use(authenticate, loadCurrentUser);

// Project the current account into the profile response shape.
function profile(user) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

// Return customer fields approved for administrator views.
function adminCustomer(user) {
  return {
    id: user._id.toString(), name: user.name, email: user.email,
    role: user.role, isActive: user.isActive !== false,
    ...(user.createdAt ? { createdAt: user.createdAt } : {}),
    ...(user.updatedAt ? { updatedAt: user.updatedAt } : {})
  };
}

// Validate editable customer fields; creation additionally requires a password.
function validCustomerFields(body, { create = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const allowed = create ? ['name', 'email', 'password'] : ['name', 'email'];
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !allowed.includes(key))) return null;

  const values = {};
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) return null;
    values.name = body.name.trim();
  } else if (create) return null;

  if (Object.hasOwn(body, 'email')) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    values.email = email;
  } else if (create) return null;

  if (create) {
    const password = typeof body.password === 'string' ? body.password : '';
    const length = Buffer.byteLength(password, 'utf8');
    if (length < 8 || length > 72) return null;
    values.password = password;
  }
  return values;
}

// Accept only a correctly formatted MongoDB ObjectId string.
function validObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value);
}

// Convert common database validation failures into safe HTTP responses.
function duplicateOrValidationError(error, res, fallback) {
  if (error?.code === 11000) return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
  if (error?.name === 'ValidationError') return res.status(400).json({ status: 'error', message: 'Customer data is invalid.' });
  return res.status(500).json({ status: 'error', message: fallback });
}

// Return the authenticated user's own public profile.
router.get('/me', (req, res) => res.status(200).json(profile(req.currentUser)));

// List only the signed-in user's orders with bounded pagination.
router.get('/me/orders', async (req, res) => {
  const pageText = req.query.page ?? '1';
  const limitText = req.query.limit ?? '10';
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) {
    return res.status(400).json({ status: 'error', message: 'Page and limit must be positive integers.' });
  }
  // Validate numeric pagination before calculating an offset or querying MongoDB.
  const page = Number(pageText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50
    || page > Math.floor(Number.MAX_SAFE_INTEGER / limit)) {
    return res.status(400).json({ status: 'error', message: 'Page must be positive and limit must be between 1 and 50.' });
  }
  try {
    // Scope both result and count queries to this account's customer ID.
    const filter = { customerId: req.currentUser._id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ orderDate: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter)
    ]);
    return res.status(200).json({ orders, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Your orders could not be loaded.' });
  }
});

// Update the account's display name; no other profile field is accepted.
router.patch('/me', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'name')
    || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    return res.status(400).json({ status: 'error', message: 'Only a non-empty profile name of at most 100 characters can be updated.' });
  }
  try {
    req.currentUser.name = body.name.trim();
    await req.currentUser.save();
    return res.status(200).json(profile(req.currentUser));
  } catch (error) {
    if (error?.name === 'ValidationError') return res.status(400).json({ status: 'error', message: 'Profile data is invalid.' });
    return res.status(500).json({ status: 'error', message: 'Profile could not be updated.' });
  }
});

// Close a customer account by disabling and anonymizing it while preserving references.
router.delete('/me', async (req, res) => {
  if (req.currentUser.role === 'admin') {
    return res.status(409).json({ status: 'error', message: 'Administrator accounts cannot be closed through self-service.' });
  }

  try {
    // Keep order references intact while replacing identifying fields and credentials.
    const id = req.currentUser._id.toString();
    req.currentUser.name = 'Deleted account';
    req.currentUser.email = `deleted-${id}@urbankart.invalid`;
    req.currentUser.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    req.currentUser.isActive = false;
    await req.currentUser.save();
    return res.status(200).json({
      status: 'success',
      message: 'Account closed. Existing order records retain an anonymized customer reference.'
    });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Account could not be closed.' });
  }
});

// Administrative CRUD is deliberately limited to customer accounts. Roles cannot
// be supplied or changed here; administrator provisioning remains out of band.
router.get('/', requireAdmin, async (req, res) => {
  // Validate the admin list's page and bounded page size.
  const pageText = req.query.page ?? '1';
  const limitText = req.query.limit ?? '25';
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) {
    return res.status(400).json({ status: 'error', message: 'Page and limit must be positive integers.' });
  }
  const page = Number(pageText);
  const limit = Number(limitText);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ status: 'error', message: 'Page must be positive and limit must be between 1 and 100.' });
  }

  try {
    // Restrict this admin interface to customer accounts and return safe fields only.
    const filter = { role: 'customer' };
    const [users, total] = await Promise.all([
      User.find(filter).select('name email role isActive createdAt updatedAt')
        .sort({ createdAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    return res.status(200).json({ users: users.map(adminCustomer), page, limit, total });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Customers could not be listed.' });
  }
});

// Create a customer account without allowing role or active status to be supplied.
router.post('/', requireAdmin, async (req, res) => {
  const values = validCustomerFields(req.body, { create: true });
  if (!values) return res.status(400).json({ status: 'error', message: 'Provide a valid name, email, and password. Role and status cannot be set here.' });
  try {
    // Hash the password and explicitly assign the customer role.
    const user = await User.create({
      name: values.name,
      email: values.email,
      passwordHash: await bcrypt.hash(values.password, 12),
      role: 'customer'
    });
    return res.status(201).json({ user: adminCustomer(user) });
  } catch (error) {
    return duplicateOrValidationError(error, res, 'Customer could not be created.');
  }
});

// Read one customer account by ID, excluding administrator accounts.
router.get('/:id', requireAdmin, async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Customer ID is invalid.' });
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'customer' })
      .select('name email role isActive createdAt updatedAt').lean();
    if (!user) return res.status(404).json({ status: 'error', message: 'Customer not found.' });
    return res.status(200).json({ user: adminCustomer(user) });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Customer could not be read.' });
  }
});

// Update an active customer's name and/or email after validating the request.
router.patch('/:id', requireAdmin, async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Customer ID is invalid.' });
  const values = validCustomerFields(req.body);
  if (!values) return res.status(400).json({ status: 'error', message: 'Only a valid name and/or email can be updated.' });
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'customer', isActive: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'Active customer not found.' });
    if (Object.hasOwn(values, 'name')) user.name = values.name;
    if (Object.hasOwn(values, 'email')) user.email = values.email;
    await user.save();
    return res.status(200).json({ user: adminCustomer(user) });
  } catch (error) {
    return duplicateOrValidationError(error, res, 'Customer could not be updated.');
  }
});

// Close a customer account through the admin interface using the same anonymization.
router.delete('/:id', requireAdmin, async (req, res) => {
  if (!validObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Customer ID is invalid.' });
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'customer', isActive: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'Active customer not found.' });
    const id = user._id.toString();
    user.name = 'Deleted account';
    user.email = `deleted-${id}@urbankart.invalid`;
    user.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    user.isActive = false;
    await user.save();
    return res.status(200).json({
      status: 'success',
      message: 'Customer account closed. Existing order records retain an anonymized customer reference.'
    });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Customer account could not be closed.' });
  }
});

// Export the configured router for the main application.
module.exports = router;
