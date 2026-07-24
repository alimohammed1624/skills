// Authentication middleware
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function validateSession(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = verifyToken(token);
    // Fixed: Check session expiry against server time, not client time
    const now = Date.now();
    if (decoded.exp < now) {
      return res.status(401).json({ error: 'Token expired' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = { validateSession };
