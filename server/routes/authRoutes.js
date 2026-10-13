const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getJwtSecret, getJwtExpiresIn, signUserToken } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

function validateCredentials(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || name.length > 100) return { error: 'Name is required and must be at most 100 characters.' };
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'A valid email address is required.' };
  }
  const passwordBytes = Buffer.byteLength(password, 'utf8');
  if (passwordBytes < 8 || passwordBytes > 72) {
    return { error: 'Password must be between 8 and 72 UTF-8 bytes.' };
  }
  return { name, email, password };
}

function authConfigurationAvailable() {
  return Boolean(getJwtSecret() && getJwtExpiresIn());
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role
  };
}

router.post('/register', async (req, res) => {
  const values = validateCredentials(req.body || {});
  if (values.error) return res.status(400).json({ status: 'error', message: values.error });
  if (!authConfigurationAvailable()) {
    return res.status(503).json({ status: 'error', message: 'Authentication is not configured.' });
  }

  try {
    const passwordHash = await bcrypt.hash(values.password, SALT_ROUNDS);
    // Role is intentionally omitted so a client cannot register as an admin.
    const user = await User.create({
      name: values.name,
      email: values.email,
      passwordHash
    });
    const token = signUserToken(user);
    if (!token) return res.status(503).json({ status: 'error', message: 'Authentication is not configured.' });
    return res.status(201).json({ status: 'success', token, user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ status: 'error', message: 'Registration data is invalid.' });
    }
    return res.status(500).json({ status: 'error', message: 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
  }
  if (!authConfigurationAvailable()) {
    return res.status(503).json({ status: 'error', message: 'Authentication is not configured.' });
  }

  try {
    const user = await User.findOne({ email });
    const passwordMatches = user?.isActive !== false && user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!user || !passwordMatches) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }
    const token = signUserToken(user);
    if (!token) return res.status(503).json({ status: 'error', message: 'Authentication is not configured.' });
    return res.status(200).json({ status: 'success', token, user: publicUser(user) });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Login failed.' });
  }
});

module.exports = router;
