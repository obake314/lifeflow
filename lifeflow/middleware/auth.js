const jwt = require('jsonwebtoken');
const db  = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'lifeflow-secret-change-in-production';

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    // JWTが有効でもDBにユーザーが存在しない場合（DB再作成など）は401
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'セッションが無効です。再ログインしてください。' });
    req.user = payload;
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
