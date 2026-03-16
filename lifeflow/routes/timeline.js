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

// Get entries for a user (with visibility filtering + shared entries)
router.get('/users/:username/entries', authOptional, (req, res) => {
  const target = db.prepare('SELECT id, birthdate, show_age FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const viewerId = req.user?.id || null;

  // 自分のエントリー
  const ownEntries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url,
           ? AS owner_birthdate, ? AS owner_show_age,
           NULL AS shared_from_username
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.user_id = ?
    ORDER BY te.entry_date DESC, te.created_at DESC
  `).all(target.birthdate || '', target.show_age ?? 1, target.id).filter(e => canView(e, viewerId));

  // 共有されたエントリー（承認済み）
  const sharedEntries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url,
           ? AS owner_birthdate, ? AS owner_show_age,
           from_u.username AS shared_from_username
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    JOIN entry_shares es ON es.entry_id = te.id
    JOIN users from_u ON from_u.id = es.from_user_id
    WHERE es.to_user_id = ? AND es.status = 'accepted'
    ORDER BY te.entry_date DESC
  `).all(target.birthdate || '', target.show_age ?? 1, target.id).filter(e => canView(e, viewerId));

  const all = [...ownEntries, ...sharedEntries]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  res.json(attachTags(all));
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
  const { title, detail, image_url, entry_date, end_date, visibility, tag_ids, specific_viewer_ids } = req.body;
  if (!title || !entry_date) {
    return res.status(400).json({ error: 'タイトルと日付は必須です' });
  }
  const validVisibility = ['public', 'users', 'followers', 'specific'];
  if (visibility && !validVisibility.includes(visibility)) {
    return res.status(400).json({ error: '公開範囲が不正です' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO timeline_entries (id, user_id, title, detail, image_url, entry_date, end_date, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, title, detail || '', image_url || '', entry_date, end_date || null, visibility || 'public');

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

  const { title, detail, image_url, entry_date, end_date, visibility, tag_ids, specific_viewer_ids } = req.body;

  db.prepare(`
    UPDATE timeline_entries
    SET title = ?, detail = ?, image_url = ?, entry_date = ?, end_date = ?, visibility = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title || entry.title,
    detail !== undefined ? detail : entry.detail,
    image_url !== undefined ? image_url : entry.image_url,
    entry_date || entry.entry_date,
    end_date !== undefined ? (end_date || null) : entry.end_date,
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
    ORDER BY te.entry_date DESC
  `).all(req.user.id);

  // Target's visible entries
  const theirEntries = db.prepare(`
    SELECT te.*, u.username, u.avatar_url
    FROM timeline_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.user_id = ?
    ORDER BY te.entry_date DESC
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
  const me = db.prepare('SELECT id, username, avatar_url, bio, birthdate, show_age FROM users WHERE id = ?').get(req.user.id);

  const myOwn = db.prepare(`
    SELECT te.*, NULL AS shared_from_username
    FROM timeline_entries te
    WHERE te.user_id = ?
    ORDER BY te.entry_date DESC
  `).all(req.user.id);

  const myShared = db.prepare(`
    SELECT te.*, from_u.username AS shared_from_username
    FROM timeline_entries te
    JOIN entry_shares es ON es.entry_id = te.id
    JOIN users from_u ON from_u.id = es.from_user_id
    WHERE es.to_user_id = ? AND es.status = 'accepted'
    ORDER BY te.entry_date DESC
  `).all(req.user.id).filter(e => canView(e, req.user.id));

  const myEntries = [...myOwn, ...myShared]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));

  const following = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.bio, u.is_official, u.birthdate, u.show_age
    FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY u.is_official DESC, u.username ASC
  `).all(req.user.id);

  const followingWithEntries = following.map(user => {
    const entries = db.prepare(`
      SELECT te.*, NULL AS shared_from_username
      FROM timeline_entries te
      WHERE te.user_id = ?
      ORDER BY te.entry_date DESC
    `).all(user.id).filter(e => canView(e, req.user.id));
    return { ...user, entries: attachTags(entries) };
  });

  res.json({
    me: { ...me, entries: attachTags(myEntries) },
    following: followingWithEntries
  });
});

// ===== 共有イベント =====

// 共有リクエストを送る
router.post('/entries/:id/share', authRequired, (req, res) => {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'エントリーが見つかりません' });
  if (entry.user_id !== req.user.id) return res.status(403).json({ error: '自分のエントリーのみ共有できます' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'ユーザー名を指定してください' });

  const toUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!toUser) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (toUser.id === req.user.id) return res.status(400).json({ error: '自分自身には共有できません' });

  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  try {
    db.prepare('INSERT INTO entry_shares (id, entry_id, from_user_id, to_user_id) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, toUser.id);
    res.json({ message: '共有リクエストを送りました' });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'すでに共有リクエスト済みです' });
    throw e;
  }
});

// 自分宛の共有リクエスト一覧
router.get('/shares/pending', authRequired, (req, res) => {
  const shares = db.prepare(`
    SELECT es.id, es.status, es.created_at,
           te.id AS entry_id, te.title, te.entry_date,
           from_u.username AS from_username, from_u.avatar_url AS from_avatar_url
    FROM entry_shares es
    JOIN timeline_entries te ON te.id = es.entry_id
    JOIN users from_u ON from_u.id = es.from_user_id
    WHERE es.to_user_id = ? AND es.status = 'pending'
    ORDER BY es.created_at DESC
  `).all(req.user.id);
  res.json(shares);
});

// 共有リクエストに応答（accept/reject）
router.put('/shares/:id/respond', authRequired, (req, res) => {
  const share = db.prepare('SELECT * FROM entry_shares WHERE id = ?').get(req.params.id);
  if (!share) return res.status(404).json({ error: '共有リクエストが見つかりません' });
  if (share.to_user_id !== req.user.id) return res.status(403).json({ error: '権限がありません' });

  const { accept } = req.body;
  const status = accept ? 'accepted' : 'rejected';
  db.prepare('UPDATE entry_shares SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ status });
});

module.exports = router;
