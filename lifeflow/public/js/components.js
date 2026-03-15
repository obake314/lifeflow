// Shared UI components

const VISIBILITY_LABELS = {
  public:    '公開',
  users:     'ユーザーのみ',
  followers: 'フォロワーのみ',
  specific:  '特定のフォロワー'
};

function avatar(user, size = '') {
  const cls = `avatar ${size}`;
  const letter = (user.username || '?')[0].toUpperCase();
  if (user.avatar_url) {
    return `<div class="${cls}"><img src="${escHtml(user.avatar_url)}" alt="" onerror="this.parentElement.innerHTML='${letter}'"></div>`;
  }
  return `<div class="${cls}">${letter}</div>`;
}

function tagHtml(tag) {
  const c = tag.color || '#264478';
  return `<span class="tag" style="background:${c}14;color:${c};border-color:${c}30" data-tag-id="${tag.id}">`
    + `<span class="tag-dot" style="background:${c}"></span>${escHtml(tag.name)}</span>`;
}

function visibilityBadge(v) {
  return `<span class="visibility-badge">${VISIBILITY_LABELS[v] || v}</span>`;
}

function entryCard(entry, isMine = false) {
  const dateStr  = formatDate(entry.entry_date);
  const tagsHtml = (entry.tags || []).map(tagHtml).join('');

  return `<div class="entry-card" data-id="${entry.id}" onclick="showEntryDetail('${entry.id}')">
    ${entry.image_url ? `<img class="entry-image" src="${escHtml(entry.image_url)}" alt="" loading="lazy">` : ''}
    <div class="entry-body">
      <div class="entry-meta">
        <span class="entry-date">${dateStr}</span>
        ${visibilityBadge(entry.visibility)}
      </div>
      <div class="entry-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<div class="entry-detail">${escHtml(entry.detail)}</div>` : ''}
      ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
    </div>
    <div class="entry-footer">
      ${entry.username
        ? `<span class="entry-author" onclick="event.stopPropagation();navigate('profile','${escHtml(entry.username)}')">${avatar({username:entry.username,avatar_url:entry.avatar_url}, 'avatar-xs')} ${escHtml(entry.username)}</span>`
        : '<span></span>'}
      ${isMine ? `<div class="entry-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-secondary" onclick="editEntry('${entry.id}')">編集</button>
        <button class="btn btn-sm btn-danger" onclick="deleteEntry('${entry.id}')">削除</button>
      </div>` : ''}
    </div>
  </div>`;
}

function compareEntryCard(entry) {
  return `<div class="compare-entry" onclick="showEntryDetail('${entry.id}')">
    ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" style="width:100%;height:90px;object-fit:cover;border-radius:4px;margin-bottom:8px" loading="lazy">` : ''}
    <div class="compare-date">${formatDate(entry.entry_date)}</div>
    <div class="compare-title">${escHtml(entry.title)}</div>
    ${entry.detail ? `<div class="compare-detail">${escHtml(entry.detail.slice(0, 80))}${entry.detail.length > 80 ? '...' : ''}</div>` : ''}
    <div class="tags" style="margin-top:6px">${(entry.tags||[]).map(tagHtml).join('')}</div>
  </div>`;
}

function tagDropdownHtml(tags, selectedIds = []) {
  const selectedNames = tags.filter(t => selectedIds.includes(t.id)).map(t => escHtml(t.name));
  const label = selectedNames.length ? selectedNames.join(', ') : 'タグを選択...';
  const items = tags.map(t => {
    const checked = selectedIds.includes(t.id);
    return `<label class="tag-dd-item" data-tag-id="${t.id}">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="_updateTagDdLabel()">
      <span class="tag-dot" style="background:${t.color}"></span>
      ${escHtml(t.name)}
    </label>`;
  }).join('');
  return `<div class="tag-dropdown">
    <button type="button" class="tag-dd-btn" onclick="_toggleTagDd(event)">
      <span id="ef-tags-label">${label}</span><span class="tag-dd-caret">▾</span>
    </button>
    <div class="tag-dd-menu hidden" id="ef-tags-menu">${items || '<span class="tag-dd-empty">タグがありません</span>'}</div>
  </div>`;
}

function _toggleTagDd(e) {
  e.stopPropagation();
  document.getElementById('ef-tags-menu')?.classList.toggle('hidden');
}

function _updateTagDdLabel() {
  const checked = [...document.querySelectorAll('#ef-tags-menu .tag-dd-item input:checked')];
  const all = [...document.querySelectorAll('#ef-tags-menu .tag-dd-item')];
  const names = checked.map(el => el.closest('.tag-dd-item').querySelector('.tag-dot').nextSibling.textContent.trim());
  document.getElementById('ef-tags-label').textContent = names.length ? names.join(', ') : 'タグを選択...';
}

function userListItem(user, actionHtml = '') {
  return `<li class="user-list-item">
    ${avatar(user)}
    <div class="user-list-info">
      <div class="user-list-name" style="cursor:pointer" onclick="navigate('profile','${escHtml(user.username)}')">${escHtml(user.username)}</div>
      ${user.bio ? `<div class="user-list-bio">${escHtml(user.bio)}</div>` : ''}
    </div>
    ${actionHtml}
  </li>`;
}

// ===== ユーティリティ =====
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modalBox').innerHTML = '';
  document.body.style.overflow = '';
}

function loading() {
  return `<div class="loading"><div class="spinner"></div></div>`;
}

function setMain(html) {
  document.getElementById('main').innerHTML = html;
}

// ===== エントリーフォーム =====
async function openEntryForm(entry = null) {
  const tags = await API.getTags();
  const selectedTagIds = (entry?.tags || []).map(t => t.id);

  const visibilityOptions = Object.entries(VISIBILITY_LABELS).map(([v, l]) =>
    `<option value="${v}" ${(entry?.visibility ?? 'public') === v ? 'selected' : ''}>${l}</option>`
  ).join('');

  const dateVal = entry?.entry_date ? entry.entry_date.slice(0, 10) : new Date().toISOString().slice(0, 10);

  showModal(`
    <button class="modal-close" onclick="closeModal()">&#10005;</button>
    <h3 style="margin-bottom:12px">${entry ? 'エントリーを編集' : '新しいエントリー'}</h3>
    <div class="form-row">
      <label>日付</label>
      <input type="date" id="ef-date" value="${dateVal}">
    </div>
    <div class="form-row">
      <label>タイトル</label>
      <input type="text" id="ef-title" placeholder="例：初めての就職" value="${escHtml(entry?.title || '')}">
    </div>
    <div class="form-row">
      <label>詳細</label>
      <textarea id="ef-detail" rows="5" placeholder="このとき何があったか...">${escHtml(entry?.detail || '')}</textarea>
    </div>
    <div class="form-row">
      <label>画像</label>
      <div>
        <input type="file" id="ef-imageFile" accept="image/*" onchange="previewImage(this)" style="font-size:12px;max-width:100%">
        <input type="hidden" id="ef-imageUrl" value="${escHtml(entry?.image_url || '')}">
        <img id="ef-imagePreview" class="image-preview ${entry?.image_url ? 'show' : ''}" src="${escHtml(entry?.image_url || '')}" alt="">
      </div>
    </div>
    <div class="form-row">
      <label>タグ</label>
      ${tagDropdownHtml(tags, selectedTagIds)}
    </div>
    <div class="form-row">
      <label>公開</label>
      <select id="ef-visibility" onchange="handleVisibilityChange(this.value)">${visibilityOptions}</select>
    </div>
    <div class="specific-viewers-section ${entry?.visibility === 'specific' ? 'show' : ''}" id="ef-specificSection">
      <div class="form-row">
        <label>閲覧者</label>
        <input type="text" id="ef-specificViewers" placeholder="alice, bob" value="${(entry?.specificViewers||[]).map(u=>u.username).join(', ')}">
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" onclick="submitEntryForm('${entry?.id || ''}')">
        ${entry ? '保存' : '追加'}
      </button>
    </div>
  `);

}

function handleVisibilityChange(v) {
  document.getElementById('ef-specificSection')?.classList.toggle('show', v === 'specific');
}

function previewImage(input) {
  if (!input.files?.[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('ef-imagePreview');
    if (prev) { prev.src = e.target.result; prev.classList.add('show'); }
  };
  reader.readAsDataURL(input.files[0]);
}

function previewImageUrl(url) {
  const prev = document.getElementById('ef-imagePreview');
  if (!prev) return;
  if (url) { prev.src = url; prev.classList.add('show'); }
  else prev.classList.remove('show');
}

async function submitEntryForm(existingId) {
  const title      = document.getElementById('ef-title')?.value.trim();
  const entry_date = document.getElementById('ef-date')?.value;
  if (!title || !entry_date) { toast('タイトルと日付は必須です', 'error'); return; }

  let image_url = document.getElementById('ef-imageUrl')?.value.trim() || '';
  const imageFile = document.getElementById('ef-imageFile')?.files?.[0];
  if (imageFile) {
    try { image_url = await API.uploadImage(imageFile); }
    catch (e) { toast('画像のアップロードに失敗しました: ' + e.message, 'error'); return; }
  }

  const tag_ids    = [...document.querySelectorAll('#ef-tags-menu .tag-dd-item input:checked')].map(el => Number(el.closest('.tag-dd-item').dataset.tagId));
  const visibility = document.getElementById('ef-visibility')?.value || 'public';

  let specific_viewer_ids = [];
  if (visibility === 'specific') {
    const names = (document.getElementById('ef-specificViewers')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    try {
      const resolved = await Promise.all(names.map(n => API.getProfile(n).then(u => u.id).catch(() => null)));
      specific_viewer_ids = resolved.filter(Boolean);
    } catch {}
  }

  const payload = {
    title,
    detail: document.getElementById('ef-detail')?.value.trim() || '',
    image_url, entry_date, visibility, tag_ids, specific_viewer_ids
  };

  try {
    if (existingId) { await API.updateEntry(existingId, payload); toast('更新しました', 'success'); }
    else            { await API.createEntry(payload);             toast('追加しました', 'success'); }
    closeModal();
    const { page, username } = window._state;
    if (page === 'profile') navigate('profile', username);
    else navigate('feed');
  } catch (e) { toast(e.message, 'error'); }
}

async function editEntry(id) {
  try { await openEntryForm(await API.getEntry(id)); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteEntry(id) {
  if (!confirm('このエントリーを削除しますか？')) return;
  try {
    await API.deleteEntry(id);
    toast('削除しました', 'success');
    const { page, username } = window._state;
    if (page === 'profile') navigate('profile', username);
    else navigate('feed');
  } catch (e) { toast(e.message, 'error'); }
}

async function showEntryDetail(id) {
  try {
    const entry  = await API.getEntry(id);
    const isMine = window._currentUser?.id === entry.user_id;
    showModal(`
      <button class="modal-close" onclick="closeModal()">&#10005;</button>
      ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" style="width:100%;height:200px;object-fit:cover;border-radius:6px;margin-bottom:16px">` : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="entry-date">${formatDate(entry.entry_date)}</span>
        ${visibilityBadge(entry.visibility)}
      </div>
      <h3 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:var(--navy-900);margin-bottom:12px">${escHtml(entry.title)}</h3>
      ${entry.detail ? `<p style="color:var(--text-2);line-height:1.7;font-size:14px;white-space:pre-wrap">${escHtml(entry.detail)}</p>` : ''}
      <div class="tags" style="margin-top:12px">${(entry.tags||[]).map(tagHtml).join('')}</div>
      ${isMine ? `<div class="divider"></div><div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="closeModal();editEntry('${entry.id}')">編集</button>
        <button class="btn btn-danger btn-sm" onclick="closeModal();deleteEntry('${entry.id}')">削除</button>
      </div>` : ''}
    `);
  } catch (e) { toast(e.message, 'error'); }
}
