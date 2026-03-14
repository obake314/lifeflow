const express = require('express');
const db = require('../database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Follow a user
router.post('/users/:username/follow', authRequired, (req, res) => {
  const target = db.prepare('SELECT id, username FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (target.id === req.user.id) return res.status(400).json({ error: '自分自身はフォローできません' });

  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, target.id);
  res.json({ following: true, username: target.username });
});

// Unfollow a user
router.delete('/users/:username/follow', authRequired, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, target.id);
  res.json({ following: false });
});

// Get followers of a user
router.get('/users/:username/followers', (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const followers = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio, f.created_at as followed_at
    FROM users u
    JOIN follows f ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(target.id);
  res.json(followers);
});

// Get users that a user is following
router.get('/users/:username/following', (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const following = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio, f.created_at as followed_at
    FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(target.id);
  res.json(following);
});

// Get user profile with follow status
router.get('/users/:username', (req, res) => {
  const { viewerId } = req.query;
  const user = db.prepare('SELECT id, username, bio, avatar_url, is_official, created_at FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const followerCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(user.id).c;
  const entryCount = db.prepare('SELECT COUNT(*) as c FROM timeline_entries WHERE user_id = ?').get(user.id).c;

  let isFollowing = false;
  if (viewerId) {
    isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, user.id);
  }

  res.json({ ...user, followerCount, followingCount, entryCount, isFollowing });
});

// Search users
router.get('/users', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const users = db.prepare(`
    SELECT id, username, bio, avatar_url, is_official FROM users
    WHERE username LIKE ? OR bio LIKE ?
    ORDER BY is_official DESC, username ASC
    LIMIT 20
  `).all(`%${q}%`, `%${q}%`);
  res.json(users);
});

module.exports = router;
