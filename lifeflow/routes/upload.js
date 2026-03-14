const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authRequired } = require('../middleware/auth');
const db = require('../database');

const router = express.Router();

// 常にbase64変換を使用（Render等のephemeral filesystemでも画像が消えないようにするため）
const USE_BASE64 = true;
const uploadDir = '/tmp/lifeflow-uploads';

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('画像ファイルのみアップロードできます（JPG/PNG/GIF/WebP）'));
  }
});

// 汎用画像アップロード（エントリー画像用）
router.post('/image', authRequired, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '画像ファイルを選択してください' });

  const data = fs.readFileSync(req.file.path);
  const mime = req.file.mimetype || 'image/jpeg';
  const url = `data:${mime};base64,${data.toString('base64')}`;
  fs.unlinkSync(req.file.path);
  res.json({ url });
});

// アバターアップロード（プロフィール用）— アップロード後に avatar_url を DB に反映
router.post('/avatar', authRequired, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '画像ファイルを選択してください' });

  const data = fs.readFileSync(req.file.path);
  const mime = req.file.mimetype || 'image/jpeg';
  const url = `data:${mime};base64,${data.toString('base64')}`;
  fs.unlinkSync(req.file.path);

  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
  res.json({ url });
});

module.exports = router;
