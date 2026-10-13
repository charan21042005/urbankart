const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return null;
  return secret;
}

function getJwtExpiresIn() {
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const match = expiresIn.match(/^([1-9]\d*)(s|m|h|d)$/);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  return expiresIn;
}

function signUserToken(user) {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpiresIn();
  if (!secret || !expiresIn) return null;
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    secret,
    { expiresIn, issuer: 'urbankart-api', audience: 'urbankart-client' }
  );
}

function authenticate(req, res, next) {
  const secret = getJwtSecret();
  if (!secret) {
    return res.status(503).json({ status: 'error', message: 'Authentication is not configured.' });
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(match[1], secret, {
      issuer: 'urbankart-api',
      audience: 'urbankart-client'
    });
    if (!payload || typeof payload.sub !== 'string') throw new Error('Invalid token subject');
    req.auth = { userId: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid or expired token.' });
  }
}

async function loadCurrentUser(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  try {
    const user = await User.findById(req.auth.userId).select('name email role isActive');
    if (!user || user.isActive === false) {
      return res.status(401).json({ status: 'error', message: 'Account is unavailable.' });
    }
    req.currentUser = user;
    return next();
  } catch {
    return res.status(503).json({ status: 'error', message: 'Account verification is temporarily unavailable.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.currentUser?.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Administrator access required.' });
  }
  return next();
}

module.exports = { getJwtSecret, getJwtExpiresIn, signUserToken, authenticate, loadCurrentUser, requireAdmin };
