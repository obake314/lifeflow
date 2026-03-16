const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: '全項目を入力してください' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'ユーザー名は3〜30文字で入力してください' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'ユーザー名またはメールアドレスが既に使用されています' });
  }

  const { birthdate } = req.body;
  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, email, password_hash, birthdate) VALUES (?, ?, ?, ?, ?)').run(id, username, email, password_hash, birthdate || '');

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, email, birthdate: birthdate || '', show_age: 1 } });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'メールアドレスとパスワードを入力してください' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, bio: user.bio, avatar_url: user.avatar_url } });
});

// Get current user
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, username, email, bio, avatar_url, birthdate, show_age, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  res.json(user);
});

// Update profile
router.put('/me', authRequired, (req, res) => {
  const { bio, avatar_url, birthdate, show_age } = req.body;
  db.prepare('UPDATE users SET bio = ?, avatar_url = ?, birthdate = ?, show_age = ? WHERE id = ?').run(
    bio || '', avatar_url || '', birthdate || '', show_age != null ? (show_age ? 1 : 0) : 1, req.user.id
  );
  const user = db.prepare('SELECT id, username, email, bio, avatar_url, birthdate, show_age, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Forgot password — generate reset token (displayed on screen; email in production)
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'メールアドレスを入力してください' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) {
    // 存在を明かさない（セキュリティ対策）
    return res.json({ message: 'ok' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1時間有効
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  res.json({ token });
});

// Reset password — validate token, update password
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: '全項目を入力してください' });
  if (password.length < 6) return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  const reset = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!reset || new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ error: 'リセットリンクが無効か期限切れです。再度お試しください。' });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, reset.user_id);
  db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);

  res.json({ message: 'パスワードをリセットしました' });
});

module.exports = router;
