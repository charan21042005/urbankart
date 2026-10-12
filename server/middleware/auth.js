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

async function requireAdmin(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  }

  try {
    // The database is the source of truth so deleted/demoted accounts lose
    // mutation access as soon as this check observes the account change.
    const user = await User.findById(req.auth.userId).select('role');
    if (user?.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Administrator access required.' });
    }
    return next();
  } catch {
    // Fail closed when current authorization state cannot be verified.
    return res.status(503).json({ status: 'error', message: 'Authorization is temporarily unavailable.' });
  }
}

module.exports = { getJwtSecret, getJwtExpiresIn, signUserToken, authenticate, requireAdmin };
