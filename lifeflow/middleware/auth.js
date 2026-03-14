const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'lifeflow-secret-change-in-production';

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'トークンが無効です' });
  }
}

function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      // ignore invalid token
    }
  }
  next();
}

module.exports = { authRequired, authOptional, JWT_SECRET };
