// State
window._currentUser = null;
window._state = { page: 'feed', username: null };

// 初期化
async function init() {
  const token = localStorage.getItem('lf_token');
  if (token) {
    try { window._currentUser = await API.me(); }
    catch { localStorage.removeItem('lf_token'); }
  }
  renderNav();
  setupSearch();

  const hash = location.hash.slice(1);
  if      (hash.startsWith('profile/')) navigate('profile', hash.slice(8));
  else if (hash === 'compare')          navigate('compare');
  else if (hash === 'login')            navigate('login');
  else if (hash === 'register')         navigate('register');
  else                                  navigate('feed');
}

function renderNav() {
  const u  = window._currentUser;
  const el = document.getElementById('navActions');
  if (u) {
    el.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="openEntryForm()">+ 追加</button>
      <div class="nav-user-menu" id="navUserMenu">
        <button class="btn btn-ghost btn-sm nav-user-btn" onclick="toggleNavMenu(event)">
          ${avatar(u, 'avatar-xs')} <span class="nav-username">${escHtml(u.username)}</span> <span class="nav-caret">▾</span>
        </button>
        <div class="nav-dropdown hidden" id="navDropdown">
          <div class="nav-dropdown-item" onclick="navigate('profile','${escHtml(u.username)}');closeNavMenu()">プロフィール</div>
          <div class="nav-dropdown-item" onclick="navigate('compare');closeNavMenu()">タイムライン比較</div>
          <div class="nav-dropdown-divider"></div>
          <div class="nav-dropdown-item nav-dropdown-danger" onclick="logout()">ログアウト</div>
        </div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="navigate('login')">ログイン</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('register')">登録</button>
    `;
  }
}

function toggleNavMenu(e) {
  e.stopPropagation();
  document.getElementById('navDropdown')?.classList.toggle('hidden');
}
function closeNavMenu() {
  document.getElementById('navDropdown')?.classList.add('hidden');
}

function setupSearch() {
  const input    = document.getElementById('searchInput');
  const dropdown = document.getElementById('searchResults');
  let debounce;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q) { dropdown.classList.add('hidden'); return; }
    debounce = setTimeout(async () => {
      try {
        const users = await API.searchUsers(q);
        if (!users.length) { dropdown.classList.add('hidden'); return; }
        dropdown.innerHTML = users.map(u =>
          `<div class="search-item" onclick="navigate('profile','${escHtml(u.username)}');closeSearch()">
            ${avatar(u, 'avatar-xs')}
            <span style="font-weight:600">${escHtml(u.username)}</span>
            ${u.is_official ? '<span class="official-badge" style="font-size:9px">公式</span>' : ''}
            ${u.bio ? `<span style="color:var(--text-3);font-size:12px">${escHtml(u.bio.slice(0,30))}</span>` : ''}
          </div>`
        ).join('');
        dropdown.classList.remove('hidden');
      } catch {}
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-search')) closeSearch();
    if (!e.target.closest('.nav-user-menu')) closeNavMenu();
  });
}

function closeSearch() {
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('searchInput').value = '';
}

function logout() {
  localStorage.removeItem('lf_token');
  window._currentUser = null;
  renderNav();
  navigate('feed');
  toast('ログアウトしました', 'info');
}

// ===== ルーター =====
function navigate(page, param) {
  window._state = { page, username: param };

  if      (page === 'feed')      { location.hash = ''; renderFeed(); }
  else if (page === 'profile')   { location.hash = `profile/${param}`; renderProfile(param); }
  else if (page === 'compare')   { location.hash = 'compare'; renderCompare(); }
  else if (page === 'login')     { location.hash = 'login';    renderLogin(); }
  else if (page === 'register')  { location.hash = 'register'; renderRegister(); }
  else if (page === 'following') { renderFollowList(param, 'following'); }
  else if (page === 'followers') { renderFollowList(param, 'followers'); }
}

// ===== ページ =====

async function renderFeed() {
  if (!window._currentUser) { renderLanding(); return; }

  setMain(`<div class="container">
    <div class="page-header">
      <h1 class="page-title">タイムラインフィード</h1>
      <button class="btn btn-primary btn-sm" onclick="openEntryForm()">+ エントリーを追加</button>
    </div>
    <div id="tagFilterRow" class="tag-filter-row"></div>
    <div id="feedEntries">${loading()}</div>
  </div>`);

  try {
    const [entries, tags] = await Promise.all([API.getFeed(), API.getTags()]);
    window._allFeedEntries = entries;
    window._allTags = tags;

    const filterRow = document.getElementById('tagFilterRow');
    filterRow.innerHTML =
      `<button class="tag-filter-btn active" data-tag="all" onclick="filterFeed('all')">すべて</button>`
      + tags.map(t =>
        `<button class="tag-filter-btn" data-tag="${t.id}" onclick="filterFeed(${t.id})">`
        + `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${t.color};margin-right:5px"></span>${escHtml(t.name)}</button>`
      ).join('');

    renderFeedEntries(entries);
  } catch (e) {
    document.getElementById('feedEntries').innerHTML =
      `<div class="empty"><div class="empty-icon"></div><p>${escHtml(e.message)}</p></div>`;
  }
}

function filterFeed(tagId) {
  document.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.tag == tagId));
  const entries = window._allFeedEntries || [];
  renderFeedEntries(tagId === 'all' ? entries : entries.filter(e => (e.tags||[]).some(t => t.id == tagId)));
}

function renderFeedEntries(entries) {
  const el = document.getElementById('feedEntries');
  if (!el) return;
  const u = window._currentUser;
  if (!entries.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon"></div><h3>まだエントリーがありません</h3><p>フォローするか、最初のエントリーを追加してみましょう。</p></div>`;
    return;
  }
  el.innerHTML = `<div class="timeline">${entries.map(e =>
    `<div class="timeline-entry">${entryCard(e, e.user_id === u?.id)}</div>`
  ).join('')}</div>`;
}

function renderLanding() {
  setMain(`<div class="landing">
    <h1>あなたの人生を、<br><span>記録する。</span></h1>
    <p class="landing-sub">人生の歩みを年表にして残し、<br>大切な人と、歴史と、比べてみよう。</p>
    <div class="landing-actions">
      <button class="btn btn-primary btn-lg" onclick="navigate('register')">はじめる</button>
      <button class="btn btn-outline btn-lg" onclick="navigate('login')">ログイン</button>
    </div>
    <div class="landing-features">
      <div class="feature-card">
        <div class="feature-line"></div>
        <div class="feature-title">年表を作る</div>
        <div class="feature-desc">タイトル・詳細・画像で出来事を記録できます。</div>
      </div>
      <div class="feature-card">
        <div class="feature-line"></div>
        <div class="feature-title">タグで整理</div>
        <div class="feature-desc">仕事・家族・趣味など、カテゴリ別に管理。</div>
      </div>
      <div class="feature-card">
        <div class="feature-line"></div>
        <div class="feature-title">公開範囲</div>
        <div class="feature-desc">エントリーごとに公開・非公開を設定できます。</div>
      </div>
      <div class="feature-card">
        <div class="feature-line"></div>
        <div class="feature-title">比較タイムライン</div>
        <div class="feature-desc">日本史・アメリカ史など、歴史と自分史を並べて見られます。</div>
      </div>
    </div>
  </div>`);
}

async function renderProfile(username) {
  setMain(`<div class="container">${loading()}</div>`);
  try {
    const me = window._currentUser;
    const [profile, entries] = await Promise.all([
      API.getProfile(username, me?.id),
      API.getUserEntries(username)
    ]);

    const isSelf      = !!(me && (me.id === profile.id || me.username === username));
    const isFollowing = profile.isFollowing;

    const followBtn = !isSelf && me
      ? `<button class="btn btn-sm ${isFollowing ? 'btn-secondary' : 'btn-primary'}" id="followBtn" onclick="toggleFollow('${escHtml(username)}', ${isFollowing})">
           ${isFollowing ? 'フォロー中' : 'フォローする'}
         </button>` : '';

    const compareBtn = !isSelf && me && isFollowing
      ? `<button class="btn btn-sm btn-outline" onclick="navigate('compare')">比較する</button>` : '';

    const editBtn = isSelf
      ? `<button class="btn btn-sm btn-secondary" onclick="openProfileEdit()">プロフィール編集</button>` : '';

    setMain(`<div class="container">
      <div class="profile-header">
        <div class="profile-top">
          ${avatar(profile)}
          <div class="profile-info">
            <div class="profile-username">${escHtml(profile.username)} ${profile.is_official ? '<span class="official-badge">公式</span>' : ''}</div>
            ${profile.bio ? `<div class="profile-bio">${escHtml(profile.bio)}</div>` : ''}
            <div class="profile-stats">
              <div class="stat" onclick="navigate('followers','${escHtml(username)}')">
                <div class="stat-count">${profile.followerCount}</div>
                <div class="stat-label">フォロワー</div>
              </div>
              <div class="stat" onclick="navigate('following','${escHtml(username)}')">
                <div class="stat-count">${profile.followingCount}</div>
                <div class="stat-label">フォロー中</div>
              </div>
              <div class="stat">
                <div class="stat-count">${profile.entryCount}</div>
                <div class="stat-label">エントリー</div>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
            ${followBtn}${compareBtn}${editBtn}
          </div>
        </div>
      </div>

      <div id="profileTagFilterRow" class="tag-filter-row"></div>

      ${entries.length === 0
        ? `<div class="empty"><div class="empty-icon"></div><h3>まだエントリーがありません</h3>
           ${isSelf ? `<button class="btn btn-primary btn-sm" onclick="openEntryForm()" style="margin-top:12px">最初のエントリーを追加</button>` : ''}</div>`
        : `<div class="timeline" id="profileTimeline">${entries.map(e => `<div class="timeline-entry">${entryCard(e, isSelf)}</div>`).join('')}</div>`
      }
      ${isSelf && entries.length > 0 ? `<div style="margin-top:24px;text-align:center"><button class="btn btn-primary btn-sm" onclick="openEntryForm()">+ エントリーを追加</button></div>` : ''}
    </div>`);

    if (entries.length > 0) {
      const allTags   = [...new Map(entries.flatMap(e => e.tags||[]).map(t => [t.id, t])).values()];
      window._profileEntries = entries;
      const filterRow = document.getElementById('profileTagFilterRow');
      if (filterRow && allTags.length > 0) {
        filterRow.innerHTML = `<button class="tag-filter-btn active" data-tag="all" onclick="filterProfile('all')">すべて</button>`
          + allTags.map(t =>
            `<button class="tag-filter-btn" data-tag="${t.id}" onclick="filterProfile(${t.id})">`
            + `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${t.color};margin-right:5px"></span>${escHtml(t.name)}</button>`
          ).join('');
      }
    }
  } catch (e) {
    setMain(`<div class="container"><div class="empty"><div class="empty-icon"></div><p>${escHtml(e.message)}</p></div></div>`);
  }
}

function filterProfile(tagId) {
  document.querySelectorAll('#profileTagFilterRow .tag-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.tag == tagId));
  const entries = window._profileEntries || [];
  const isSelf  = window._currentUser?.username === window._state.username;
  const filtered = tagId === 'all' ? entries : entries.filter(e => (e.tags||[]).some(t => t.id == tagId));
  const el = document.getElementById('profileTimeline');
  if (el) el.innerHTML = filtered.map(e => `<div class="timeline-entry">${entryCard(e, isSelf)}</div>`).join('');
}

async function toggleFollow(username, currentlyFollowing) {
  try {
    if (currentlyFollowing) { await API.unfollow(username); toast(`${username} のフォローを解除しました`, 'info'); }
    else                    { await API.follow(username);   toast(`${username} をフォローしました`, 'success'); }
    navigate('profile', username);
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Compare-all: 全フォローユーザーとの比較ビュー =====

// 状態: 表示中のカラムIDセット & 自分カラムのカテゴリフィルター
// myHiddenTags: 除外モード — 空 = すべて表示、IDが入ったら非表示
window._cmpState = { visibleCols: new Set(), myHiddenTags: new Set() };
window._cmpData  = null;

async function renderCompare() {
  setMain(`<div style="padding:0">${loading()}</div>`);
  try {
    const data = await API.compareAll();
    window._cmpData = data;
    window._cmpState.visibleCols  = new Set(['me', ...data.following.map(u => u.id)]);
    window._cmpState.myHiddenTags = new Set(); // 空 = すべて表示
    _renderCompareView();
  } catch (e) {
    setMain(`<div class="container"><div class="empty"><div class="empty-icon"></div><p>${escHtml(e.message)}</p></div></div>`);
  }
}

function _renderCompareView() {
  const { me, following } = window._cmpData;
  const { visibleCols, myHiddenTags } = window._cmpState;

  const myAllTags = [...new Map(me.entries.flatMap(e => e.tags||[]).map(t => [t.id, t])).values()];

  // コントロールパネル
  const myToggle = `<button class="col-toggle ${visibleCols.has('me') ? 'active' : ''}"
    onclick="_toggleCol('me')">
    ${avatar(me, 'avatar-xs')} あなたの記録
  </button>`;

  const followingToggles = following.map(u =>
    `<button class="col-toggle ${visibleCols.has(u.id) ? 'active' : ''} ${u.is_official ? 'official' : ''}"
      onclick="_toggleCol('${u.id}')">
      ${avatar(u, 'avatar-xs')} ${escHtml(u.username)}
      ${u.is_official ? '<span class="official-badge">公式</span>' : ''}
    </button>`
  ).join('');

  // カテゴリフィルター（除外モード）
  // チップはデフォルトで「表示中（ON）」、クリックで「非表示（OFF）」
  const catChips = myAllTags.map(t => {
    const isHidden = myHiddenTags.has(t.id);
    return `<button class="cat-chip ${isHidden ? 'chip-off' : 'chip-on'}"
      onclick="_toggleMyTag(${t.id})"
      style="--chip-color:${t.color}">
      ${isHidden ? '✕' : '✓'} ${escHtml(t.name)}
    </button>`;
  }).join('');

  // 除外フィルター適用: 非表示タグがひとつでも含まれるエントリーを隠す
  const myFiltered = myHiddenTags.size === 0
    ? me.entries
    : me.entries.filter(e => !(e.tags||[]).some(t => myHiddenTags.has(t.id)));

  const myCol = visibleCols.has('me') ? `
    <div class="compare-col col-mine">
      <div class="compare-col-header">
        ${avatar(me, 'avatar-xs')}
        <span class="col-header-name">あなたの記録</span>
      </div>
      ${myAllTags.length ? `<div class="col-category-filter">${catChips}</div>` : ''}
      <div class="compare-col-entries">
        ${myFiltered.length
          ? myFiltered.map(_cmpEntryCard).join('')
          : '<div class="col-empty">エントリーなし</div>'}
      </div>
    </div>` : '';

  const followingCols = following
    .filter(u => visibleCols.has(u.id))
    .map(u => `
      <div class="compare-col ${u.is_official ? 'col-official' : ''}">
        <div class="compare-col-header">
          ${avatar(u, 'avatar-xs')}
          <span class="col-header-name">${escHtml(u.username)}</span>
          ${u.is_official ? '<span class="official-badge">公式</span>' : ''}
        </div>
        <div class="compare-col-entries">
          ${u.entries.length
            ? u.entries.map(_cmpEntryCard).join('')
            : '<div class="col-empty">エントリーなし</div>'}
        </div>
      </div>`
    ).join('');

  document.getElementById('main').innerHTML = `
    <div class="compare-page">
      <div class="compare-controls">
        <div class="compare-control-row">
          <span class="control-section-label">あなた</span>
          ${myToggle}
        </div>
        ${myAllTags.length && visibleCols.has('me') ? `<div class="compare-control-row">
          <span class="control-section-label">カテゴリ</span>
          <span style="font-size:11px;color:var(--text-3);white-space:nowrap">クリックで非表示 →</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${catChips}</div>
        </div>` : ''}
        ${following.length ? `<div class="compare-control-row">
          <span class="control-section-label">比較中</span>
          ${followingToggles}
        </div>` : ''}
      </div>
      <div class="compare-columns-wrap">
        ${myCol}
        ${followingCols}
        ${!visibleCols.size ? '<div style="margin:auto;color:var(--text-3);font-size:14px;padding:48px">タイムラインを選択してください</div>' : ''}
      </div>
    </div>`;
}

function _cmpEntryCard(entry) {
  const tagsHtml = (entry.tags||[]).map(t =>
    `<span class="cmp-tag" style="background:${t.color}14;color:${t.color};border-color:${t.color}30">${escHtml(t.name)}</span>`
  ).join('');
  return `<div class="cmp-entry" onclick="showEntryDetail('${entry.id}')">
    ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" style="width:100%;height:70px;object-fit:cover;border-radius:4px;margin-bottom:6px">` : ''}
    <div class="cmp-date">${formatDate(entry.entry_date)}</div>
    <div class="cmp-title">${escHtml(entry.title)}</div>
    ${entry.detail ? `<div class="cmp-detail">${escHtml(entry.detail.slice(0, 60))}${entry.detail.length > 60 ? '...' : ''}</div>` : ''}
    ${tagsHtml ? `<div class="cmp-tags">${tagsHtml}</div>` : ''}
  </div>`;
}

function _toggleCol(id) {
  const s = window._cmpState.visibleCols;
  if (s.has(id)) s.delete(id); else s.add(id);
  _renderCompareView();
}

function _toggleMyTag(tagId) {
  const s = window._cmpState.myHiddenTags;
  if (s.has(tagId)) s.delete(tagId); else s.add(tagId);
  _renderCompareView();
}

async function renderFollowList(username, type) {
  setMain(`<div class="container">${loading()}</div>`);
  try {
    const users = type === 'following' ? await API.getFollowing(username) : await API.getFollowers(username);
    const title = type === 'following' ? 'フォロー中' : 'フォロワー';
    setMain(`<div class="container">
      <div class="page-header">
        <h1 class="page-title">${escHtml(username)} &mdash; ${title}</h1>
        <button class="btn btn-secondary btn-sm" onclick="navigate('profile','${escHtml(username)}')">戻る</button>
      </div>
      ${!users.length ? '<div class="empty"><div class="empty-icon"></div><p>まだいません</p></div>' : ''}
      <ul class="user-list">${users.map(u => userListItem(u)).join('')}</ul>
    </div>`);
  } catch (e) {
    setMain(`<div class="container"><div class="empty"><p>${escHtml(e.message)}</p></div></div>`);
  }
}

function renderLogin() {
  setMain(`<div class="auth-page"><div class="auth-card">
    <h2>ログイン</h2>
    <p class="auth-sub">LifeFlowへようこそ</p>
    <div class="demo-banner">
      <span>デモアカウントで試してみる</span>
      <button class="btn btn-primary btn-sm" onclick="loginAsDemo()">デモでログイン</button>
    </div>
    <div class="form-group">
      <label>メールアドレス</label>
      <input type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label>パスワード</label>
      <input type="password" id="loginPass" placeholder="パスワード" autocomplete="current-password"
             onkeydown="if(event.key==='Enter')doLogin()">
    </div>
    <div id="loginError" class="form-error"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="doLogin()">ログイン</button>
    <p style="text-align:center;margin-top:18px;font-size:12px;color:var(--text-3)">
      アカウントをお持ちでない方は <a href="#" onclick="navigate('register')" style="color:var(--primary);font-weight:600">新規登録</a>
    </p>
  </div></div>`);
}

async function loginAsDemo() {
  document.getElementById('loginEmail').value = 'demo@lifeflow.app';
  document.getElementById('loginPass').value  = 'demo1234';
  await doLogin();
}

async function doLogin() {
  const email    = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPass')?.value;
  const errEl    = document.getElementById('loginError');
  try {
    const res = await API.login({ email, password });
    localStorage.setItem('lf_token', res.token);
    window._currentUser = res.user;
    renderNav();
    navigate('feed');
    toast('ログインしました', 'success');
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function renderRegister() {
  setMain(`<div class="auth-page"><div class="auth-card">
    <h2>新規登録</h2>
    <p class="auth-sub">人生の年表を作り始めよう</p>
    <div class="form-group">
      <label>ユーザー名（3〜30文字）</label>
      <input type="text" id="regUser" placeholder="username" autocomplete="username">
    </div>
    <div class="form-group">
      <label>メールアドレス</label>
      <input type="email" id="regEmail" placeholder="you@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label>パスワード（6文字以上）</label>
      <input type="password" id="regPass" placeholder="パスワード" autocomplete="new-password"
             onkeydown="if(event.key==='Enter')doRegister()">
    </div>
    <div id="regError" class="form-error"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="doRegister()">登録する</button>
    <p style="text-align:center;margin-top:18px;font-size:12px;color:var(--text-3)">
      すでにアカウントをお持ちの方は <a href="#" onclick="navigate('login')" style="color:var(--primary);font-weight:600">ログイン</a>
    </p>
  </div></div>`);
}

async function doRegister() {
  const username = document.getElementById('regUser')?.value.trim();
  const email    = document.getElementById('regEmail')?.value.trim();
  const password = document.getElementById('regPass')?.value;
  const errEl    = document.getElementById('regError');
  try {
    const res = await API.register({ username, email, password });
    localStorage.setItem('lf_token', res.token);
    window._currentUser = res.user;
    renderNav();
    navigate('feed');
    toast('登録が完了しました', 'success');
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function openProfileEdit() {
  const u = window._currentUser;
  const avatarSrc = u?.avatar_url || '';
  showModal(`
    <button class="modal-close" onclick="closeModal()">&#10005;</button>
    <h3>プロフィール編集</h3>
    <div class="form-group">
      <label>アバター画像</label>
      <div class="avatar-upload-row">
        <img id="pe-avatar-preview"
          src="${escHtml(avatarSrc)}"
          onerror="this.src=''"
          class="avatar${avatarSrc ? '' : ' avatar-placeholder'}"
          style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--surface-3)">
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-secondary btn-sm" type="button"
            onclick="document.getElementById('pe-avatar-file').click()">
            画像を選択
          </button>
          <span id="pe-avatar-status" style="font-size:11px;color:var(--text-3)">JPG/PNG/GIF/WebP・5MBまで</span>
        </div>
      </div>
      <input type="file" id="pe-avatar-file" accept="image/*" style="display:none"
        onchange="handleAvatarFileChange(this)">
      <input type="hidden" id="pe-avatar-url" value="${escHtml(avatarSrc)}">
    </div>
    <div class="form-group">
      <label>自己紹介</label>
      <textarea id="pe-bio" placeholder="自己紹介を入力...">${escHtml(u?.bio || '')}</textarea>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
      <button class="btn btn-primary" id="pe-save-btn" onclick="saveProfile()">保存する</button>
    </div>
  `);
}

async function handleAvatarFileChange(input) {
  const file = input.files?.[0];
  if (!file) return;
  const status = document.getElementById('pe-avatar-status');
  const saveBtn = document.getElementById('pe-save-btn');
  status.textContent = 'アップロード中...';
  saveBtn.disabled = true;
  try {
    const url = await API.uploadAvatar(file);
    document.getElementById('pe-avatar-url').value = url;
    document.getElementById('pe-avatar-preview').src = url;
    status.textContent = 'アップロード完了';
    // _currentUser の avatar_url も即反映（ナビのアバターを更新）
    if (window._currentUser) window._currentUser.avatar_url = url;
    renderNav();
  } catch (e) {
    status.textContent = e.message;
  } finally {
    saveBtn.disabled = false;
  }
}

async function saveProfile() {
  const bio        = document.getElementById('pe-bio')?.value.trim();
  const avatar_url = document.getElementById('pe-avatar-url')?.value.trim();
  try {
    const updated = await API.updateProfile({ bio, avatar_url });
    window._currentUser = { ...window._currentUser, ...updated };
    renderNav();
    closeModal();
    toast('プロフィールを更新しました', 'success');
    navigate('profile', updated.username);
  } catch (e) { toast(e.message, 'error'); }
}

init();
