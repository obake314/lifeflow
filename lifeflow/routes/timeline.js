const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

// Helper: check if viewer can see an entry
function canView(entry, viewerId) {
  if (entry.visibility === 'public') return true;
  if (!viewerId) return false;
  if (entry.user_id === viewerId) return true;
  if (entry.visibility === 'users') return true;
  if (entry.visibility === 'followers') {
    const isFollower = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, entry.user_id);
    return !!isFollower;
  }
  if (entry.visibility === 'specific') {
    const allowed = db.prepare('SELECT 1 FROM entry_specific_viewers WHERE entry_id = ? AND user_id = ?').get(entry.id, viewerId);
    return !!allowed;
  }
  return false;
}

// Helper: attach tags to entries
function attachTags(entries) {
  return entries.map(e => {
    const tags = db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN entry_tags et ON et.tag_id = t.id
      WHERE et.entry_id = ?
    `).all(e.id);
    return { ...e, tags };
  });
}

// Get all tags
router.get('/tags', (req, res) => {
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  res.json(tags);
});

// Create tag
router.post('/tags', authRequired, (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'タグ名を入力してください' });
  const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(name);
  if (existing) return res.json(existing);
  const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color || '#6b7280');
  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(tag);
});

// Get entries for a user (with visibility filtering)
router.get('/users/:username/entries', authOptional, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const viewerId = req.user?.id || null;
  const entries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.user_id = ?
    ORDER BY te.entry_date DESC, te.created_at DESC
  `).all(target.id);

  const visible = entries.filter(e => canView(e, viewerId));
  res.json(attachTags(visible));
});

// Get feed
router.get('/feed', authOptional, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let entries;
  if (req.user) {
    // ログイン済み: 自分 + フォロー中のユーザーのエントリーのみ表示
    entries = db.prepare(`
      SELECT te.*, u.username, u.avatar_url
      FROM timeline_entries te
      JOIN users u ON u.id = te.user_id
      WHERE (
        te.user_id = ?
        OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = te.user_id)
      )
      AND (
           te.visibility = 'public'
        OR te.visibility = 'users'
        OR (te.visibility = 'followers' AND EXISTS (
              SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = te.user_id
            ))
        OR te.user_id = ?
      )
      ORDER BY te.entry_date DESC, te.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, Number(limit), Number(offset));
  } else {
    entries = db.prepare(`
      SELECT te.*, u.username, u.avatar_url
      FROM timeline_entries te
      JOIN users u ON u.id = te.user_id
      WHERE te.visibility = 'public'
      ORDER BY te.entry_date DESC, te.created_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(limit), Number(offset));
  }

  res.json(attachTags(entries));
});

// Get single entry
router.get('/entries/:id', authOptional, (req, res) => {
  const entry = db.prepare(`
    SELECT te.*, u.username, u.avatar_url
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.id = ?
  `).get(req.params.id);

  if (!entry) return res.status(404).json({ error: 'エントリーが見つかりません' });
  if (!canView(entry, req.user?.id)) return res.status(403).json({ error: 'このエントリーを閲覧する権限がありません' });

  const tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ?
  `).all(entry.id);

  const specificViewers = db.prepare(`
    SELECT u.id, u.username FROM users u
    JOIN entry_specific_viewers esv ON esv.user_id = u.id
    WHERE esv.entry_id = ?
  `).all(entry.id);

  res.json({ ...entry, tags, specificViewers });
});

// Create entry
router.post('/entries', authRequired, (req, res) => {
  const { title, detail, image_url, entry_date, visibility, tag_ids, specific_viewer_ids } = req.body;
  if (!title || !entry_date) {
    return res.status(400).json({ error: 'タイトルと日付は必須です' });
  }
  const validVisibility = ['public', 'users', 'followers', 'specific'];
  if (visibility && !validVisibility.includes(visibility)) {
    return res.status(400).json({ error: '公開範囲が不正です' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO timeline_entries (id, user_id, title, detail, image_url, entry_date, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, title, detail || '', image_url || '', entry_date, visibility || 'public');

  // Attach tags
  if (Array.isArray(tag_ids) && tag_ids.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
    tag_ids.forEach(tid => insertTag.run(id, tid));
  }

  // Attach specific viewers
  if (visibility === 'specific' && Array.isArray(specific_viewer_ids) && specific_viewer_ids.length > 0) {
    const insertViewer = db.prepare('INSERT OR IGNORE INTO entry_specific_viewers (entry_id, user_id) VALUES (?, ?)');
    specific_viewer_ids.forEach(uid => insertViewer.run(id, uid));
  }

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(id);
  const tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ?
  `).all(id);

  res.status(201).json({ ...entry, tags });
});

// Update entry
router.put('/entries/:id', authRequired, (req, res) => {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'エントリーが見つかりません' });
  if (entry.user_id !== req.user.id) return res.status(403).json({ error: '編集権限がありません' });

  const { title, detail, image_url, entry_date, visibility, tag_ids, specific_viewer_ids } = req.body;

  db.prepare(`
    UPDATE timeline_entries
    SET title = ?, detail = ?, image_url = ?, entry_date = ?, visibility = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title || entry.title,
    detail !== undefined ? detail : entry.detail,
    image_url !== undefined ? image_url : entry.image_url,
    entry_date || entry.entry_date,
    visibility || entry.visibility,
    req.params.id
  );

  // Update tags
  if (Array.isArray(tag_ids)) {
    db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(req.params.id);
    const insertTag = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
    tag_ids.forEach(tid => insertTag.run(req.params.id, tid));
  }

  // Update specific viewers
  db.prepare('DELETE FROM entry_specific_viewers WHERE entry_id = ?').run(req.params.id);
  if ((visibility || entry.visibility) === 'specific' && Array.isArray(specific_viewer_ids)) {
    const insertViewer = db.prepare('INSERT OR IGNORE INTO entry_specific_viewers (entry_id, user_id) VALUES (?, ?)');
    specific_viewer_ids.forEach(uid => insertViewer.run(req.params.id, uid));
  }

  const updated = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id);
  const tags = db.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ?
  `).all(req.params.id);

  res.json({ ...updated, tags });
});

// Delete entry
router.delete('/entries/:id', authRequired, (req, res) => {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'エントリーが見つかりません' });
  if (entry.user_id !== req.user.id) return res.status(403).json({ error: '削除権限がありません' });

  db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(req.params.id);
  res.json({ message: '削除しました' });
});

// Compare two timelines (must follow the target)
router.get('/compare/:username', authRequired, (req, res) => {
  const target = db.prepare('SELECT id, username, avatar_url, bio FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (target.id === req.user.id) return res.status(400).json({ error: '自分自身とは比較できません' });

  const isFollowing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, target.id);
  if (!isFollowing) return res.status(403).json({ error: 'フォローしているユーザーとのみ比較できます' });

  // Own entries
  const myEntries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.user_id = ?
    ORDER BY te.entry_date ASC
  `).all(req.user.id);

  // Target's visible entries
  const theirEntries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.user_id = ?
    ORDER BY te.entry_date ASC
  `).all(target.id).filter(e => canView(e, req.user.id));

  res.json({
    me: { id: req.user.id, username: req.user.username },
    them: target,
    myEntries: attachTags(myEntries),
    theirEntries: attachTags(theirEntries)
  });
});

// Compare-all: 自分 + フォロー中全員のタイムラインを一括取得
router.get('/compare-all', authRequired, (req, res) => {
  const me = db.prepare('SELECT id, username, avatar_url, bio FROM users WHERE id = ?').get(req.user.id);

  const myEntries = db.prepare(`
    SELECT te.* FROM timeline_entries te
    WHERE te.user_id = ?
    ORDER BY te.entry_date ASC
  `).all(req.user.id);

  const following = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio, u.is_official
    FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY u.is_official DESC, u.username ASC
  `).all(req.user.id);

  const followingWithEntries = following.map(user => {
    const entries = db.prepare(`
      SELECT te.* FROM timeline_entries te
      WHERE te.user_id = ?
      ORDER BY te.entry_date ASC
    `).all(user.id).filter(e => canView(e, req.user.id));
    return { ...user, entries: attachTags(entries) };
  });

  res.json({
    me: { ...me, entries: attachTags(myEntries) },
    following: followingWithEntries
  });
});

module.exports = router;
