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
  else if (hash === 'search')           navigate('search');
  else                                  navigate('feed');
}

function renderNav() {
  const u  = window._currentUser;
  const el = document.getElementById('navActions');
  if (u) {
    el.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="openEntryForm()">+ 追加</button>
      <button class="nav-icon-btn" onclick="navigate('search')" title="ユーザー検索">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="nav-user-menu" id="navUserMenu">
        <button class="btn btn-ghost btn-sm nav-user-btn" onclick="toggleNavMenu(event)">
          ${avatar(u, 'avatar-xs')} <span class="nav-username">${escHtml(u.username)}</span> <span class="nav-caret">▾</span>
        </button>
        <div class="nav-dropdown hidden" id="navDropdown">
          <div class="nav-dropdown-item" onclick="navigate('profile','${escHtml(u.username)}');closeNavMenu()">プロフィール</div>
          <div class="nav-dropdown-item" onclick="navigate('compare');closeNavMenu()">タイムライン比較</div>
          <div class="nav-dropdown-item" onclick="navigate('search');closeNavMenu()">ユーザー検索</div>
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
document.addEventListener('click', () => {
  closeNavMenu();
  document.getElementById('ef-tags-menu')?.classList.add('hidden');
});

function setupSearch() {}

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
  else if (page === 'search')    { location.hash = 'search'; renderSearch(param || ''); }
}

// ===== ページ =====

window._feedData           = null;
window._feedHiddenTags     = new Set();
window._feedHiddenFollowers = new Set();

async function renderFeed() {
  if (!window._currentUser) { renderLanding(); return; }

  setMain(`<div style="padding:0">${loading()}</div>`);

  try {
    const data = await API.compareAll();
    window._feedData            = data;
    window._feedHiddenTags      = new Set();
    window._feedHiddenFollowers = new Set();
    _renderFeedView();
  } catch (e) {
    setMain(`<div class="container"><div class="empty"><div class="empty-icon"></div><p>${escHtml(e.message)}</p></div></div>`);
  }
}

// ===== フィード絞り込みモーダル =====
function openFeedTagModal() {
  const { me } = window._feedData;
  const hiddenTags = window._feedHiddenTags;
  const tags = [...new Map(me.entries.flatMap(e => e.tags||[]).map(t => [t.id, t])).values()];
  if (!tags.length) return;
  showModal(`
    <button class="modal-close" onclick="closeModal()">&#10005;</button>
    <h3 style="margin-bottom:12px">タグで絞り込み</h3>
    ${tags.map(t => `
      <label class="filter-modal-item">
        <input type="checkbox" ${!hiddenTags.has(t.id) ? 'checked' : ''}
          onchange="_feedToggleTag(${t.id})">
        <span class="tag-dot" style="background:${t.color}"></span>
        <span>${escHtml(t.name)}</span>
      </label>`).join('')}
    <button class="btn btn-primary" style="margin-top:14px;width:100%" onclick="closeModal();_renderFeedView()">閉じる</button>
  `);
}

function openFeedFollowerModal() {
  const { following } = window._feedData;
  const hidden = window._feedHiddenFollowers;
  if (!following.length) return;
  showModal(`
    <button class="modal-close" onclick="closeModal()">&#10005;</button>
    <h3 style="margin-bottom:12px">フォロワーで絞り込み</h3>
    ${following.map(u => `
      <label class="filter-modal-item">
        <input type="checkbox" ${!hidden.has(String(u.id)) ? 'checked' : ''}
          onchange="_feedToggleFollower('${u.id}')">
        ${avatar(u, 'avatar-xs')}
        <span>${escHtml(u.username)}</span>
        ${u.is_official ? '<span class="official-badge" style="font-size:9px">公式</span>' : ''}
      </label>`).join('')}
    <button class="btn btn-primary" style="margin-top:14px;width:100%" onclick="closeModal()">閉じる</button>
  `);
}

function _feedToggleTag(tagId) {
  const id = Number(tagId);
  if (window._feedHiddenTags.has(id)) window._feedHiddenTags.delete(id);
  else window._feedHiddenTags.add(id);
}

function _feedToggleFollower(userId) {
  const id = String(userId);
  const wasHidden = window._feedHiddenFollowers.has(id);
  if (wasHidden) window._feedHiddenFollowers.delete(id);
  else           window._feedHiddenFollowers.add(id);

  // DOMを直接更新（再描画なし）
  document.querySelectorAll(`.cmp-entry[data-uid="${id}"]`).forEach(el => {
    el.style.display = wasHidden ? '' : 'none';
  });

  // フィルターボタンのバッジを更新
  const total  = window._feedData.following.length;
  const hidden = window._feedHiddenFollowers.size;
  const btn = document.getElementById('feedFolFilterBtn');
  if (btn) {
    btn.classList.toggle('is-active', hidden > 0);
    const badge = btn.querySelector('.feed-filter-badge');
    if (badge) badge.textContent = hidden ? `${total - hidden}/${total}` : '';
  }
}

// フォロワー史用スリムカード（ユーザー名・タイトル・画像のみ）
function _cmpFollowerCardSlim(entry, user) {
  const cls = user.is_official ? 'cmp-entry cmp-entry--official' : 'cmp-entry';
  return `<div class="${cls}" data-uid="${user.id}" onclick="showEntryDetail('${entry.id}')">
    <div class="cmp-entry-body">
      <div class="cmp-entry-author">${avatar(user, 'avatar-xs')} <span>${escHtml(user.username)}</span></div>
      <div class="cmp-title">${escHtml(entry.title)}</div>
    </div>
    ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" class="cmp-entry-thumb" alt="">` : ''}
  </div>`;
}

function _renderFeedView() {
  const { me, following } = window._feedData;
  const hiddenTags      = window._feedHiddenTags;
  const hiddenFollowers = window._feedHiddenFollowers;

  const normalFollowing = following;

  const myAllTags = [...new Map(me.entries.flatMap(e => e.tags||[]).map(t => [t.id, t])).values()];

  const myEntries = hiddenTags.size === 0
    ? me.entries
    : me.entries.filter(e => !(e.tags||[]).some(t => hiddenTags.has(t.id)));

  // 公式アカウントは1980年以前のエントリーを除外
  const followerEntries = normalFollowing
    .filter(u => !hiddenFollowers.has(String(u.id)))
    .flatMap(u => u.entries
      .filter(e => !u.is_official || e.entry_date >= '1980-01-01')
      .map(e => ({ ...e, _user: u })));

  const getYear = e => e.entry_date.slice(0, 4);
  const allYears = [...new Set([
    ...myEntries.map(getYear),
    ...followerEntries.map(getYear)
  ])].sort().reverse();

  const myByYear  = {};
  myEntries.forEach(e => { const y = getYear(e); (myByYear[y]  ??= []).push(e); });
  const folByYear = {};
  followerEntries.forEach(e => { const y = getYear(e); (folByYear[y] ??= []).push(e); });

  const filterIcon = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1" y1="3" x2="11" y2="3"/><line x1="3" y1="6" x2="9" y2="6"/><line x1="5" y1="9" x2="7" y2="9"/></svg>`;
  const tagActive  = hiddenTags.size > 0;
  const folActive  = hiddenFollowers.size > 0;

  const rows = allYears.map(year => `
    <div class="feed-year-sep">${year}</div>
    <div class="feed-year-row">
      <div class="feed-year-mine">${(myByYear[year]||[]).map(_cmpEntryCard).join('')}</div>
      <div class="feed-year-fol">${(folByYear[year]||[]).map(e => _cmpFollowerCardSlim(e, e._user)).join('')}</div>
    </div>`).join('');

  setMain(`
    <div class="compare-page feed-page">
      <div class="feed-scroll">
        <div class="feed-head">
          <div class="feed-head-mine">
            ${avatar(me, 'avatar-xs')}
            <span>自分史</span>
            ${myAllTags.length ? `<button class="feed-filter-btn${tagActive ? ' is-active' : ''}" onclick="openFeedTagModal()">${filterIcon}${tagActive ? `<span>${myAllTags.length - hiddenTags.size}/${myAllTags.length}</span>` : ''}</button>` : ''}
          </div>
          <div class="feed-head-fol">
            <span>フォロワー史</span>
            ${normalFollowing.length ? `<button id="feedFolFilterBtn" class="feed-filter-btn feed-filter-btn-light${folActive ? ' is-active' : ''}" onclick="openFeedFollowerModal()">${filterIcon}<span class="feed-filter-badge">${folActive ? `${normalFollowing.length - hiddenFollowers.size}/${normalFollowing.length}` : ''}</span></button>` : ''}
          </div>
        </div>
        ${rows || '<p style="padding:32px;text-align:center;color:var(--text-3)">エントリーがありません</p>'}
      </div>
    </div>`);
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

  const normalFollowing   = following.filter(u => !u.is_official);
  const officialFollowing = following.filter(u =>  u.is_official);

  const myAllTags = [...new Map(me.entries.flatMap(e => e.tags||[]).map(t => [t.id, t])).values()];

  // ---- コントロールパネル ----
  const myToggle = `<button class="col-toggle ${visibleCols.has('me') ? 'active' : ''}"
    onclick="_toggleCol('me')">${avatar(me, 'avatar-xs')} あなたの記録</button>`;

  const catChips = myAllTags.map(t => {
    const isHidden = myHiddenTags.has(t.id);
    return `<button class="cat-chip ${isHidden ? 'chip-off' : 'chip-on'}"
      onclick="_toggleMyTag(${t.id})" style="--chip-color:${t.color}">
      ${isHidden ? '✕' : '✓'} ${escHtml(t.name)}</button>`;
  }).join('');

  const normalToggles = normalFollowing.map(u =>
    `<button class="col-toggle ${visibleCols.has(u.id) ? 'active' : ''}"
      onclick="_toggleCol('${u.id}')">
      ${avatar(u, 'avatar-xs')} ${escHtml(u.username)}</button>`
  ).join('');

  const officialToggles = officialFollowing.map(u =>
    `<button class="col-toggle ${visibleCols.has(u.id) ? 'active' : ''} official"
      onclick="_toggleCol('${u.id}')">
      ${avatar(u, 'avatar-xs')} ${escHtml(u.username)}
      <span class="official-badge">公式</span></button>`
  ).join('');

  // ---- カラム1: 自分 ----
  const myFiltered = myHiddenTags.size === 0
    ? me.entries
    : me.entries.filter(e => !(e.tags||[]).some(t => myHiddenTags.has(t.id)));

  const myCol = visibleCols.has('me') ? `
    <div class="compare-col col-mine col-flex">
      <div class="compare-col-header">
        ${avatar(me, 'avatar-xs')}
        <span class="col-header-name">あなたの記録</span>
      </div>
      ${myAllTags.length ? `<div class="col-category-filter">${catChips}</div>` : ''}
      <div class="compare-col-entries">
        ${myFiltered.length ? myFiltered.map(_cmpEntryCard).join('') : '<div class="col-empty">エントリーなし</div>'}
      </div>
    </div>` : '';

  // ---- カラム2: フォロー中（一般）を時系列で統合 ----
  const normalEntries = normalFollowing
    .filter(u => visibleCols.has(u.id))
    .flatMap(u => u.entries.map(e => ({ ...e, _user: u })))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const normalActiveCount = normalFollowing.filter(u => visibleCols.has(u.id)).length;

  const normalCol = normalFollowing.length ? `
    <div class="compare-col col-flex">
      <div class="compare-col-header col-header-normal">
        <span class="col-header-name" style="color:var(--text)">フォロー中</span>
        <span class="col-header-count">${normalActiveCount}人</span>
      </div>
      <div class="compare-col-entries">
        ${normalEntries.length
          ? normalEntries.map(e => _cmpEntryCardWithUser(e, e._user)).join('')
          : '<div class="col-empty">エントリーなし</div>'}
      </div>
    </div>` : '';

  // ---- カラム3: 公式アカウント（歴史）を時系列で統合 ----
  const officialEntries = officialFollowing
    .filter(u => visibleCols.has(u.id))
    .flatMap(u => u.entries.map(e => ({ ...e, _user: u })))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const officialActiveCount = officialFollowing.filter(u => visibleCols.has(u.id)).length;

  const officialCol = officialFollowing.length ? `
    <div class="compare-col col-official col-flex">
      <div class="compare-col-header">
        <span class="col-header-name">公式・歴史</span>
        <span class="official-badge">公式</span>
        <span class="col-header-count" style="color:rgba(255,255,255,.5)">${officialActiveCount}件</span>
      </div>
      <div class="compare-col-entries">
        ${officialEntries.length
          ? officialEntries.map(e => _cmpEntryCardWithUser(e, e._user)).join('')
          : '<div class="col-empty">エントリーなし</div>'}
      </div>
    </div>` : '';

  const totalCols = (visibleCols.has('me') ? 1 : 0)
    + (normalFollowing.length ? 1 : 0)
    + (officialFollowing.length ? 1 : 0);

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
        ${normalFollowing.length ? `<div class="compare-control-row">
          <span class="control-section-label">フォロー中</span>
          ${normalToggles}
        </div>` : ''}
        ${officialFollowing.length ? `<div class="compare-control-row">
          <span class="control-section-label">公式</span>
          ${officialToggles}
        </div>` : ''}
      </div>
      <div class="compare-columns-wrap">
        ${myCol}
        ${normalCol}
        ${officialCol}
        ${!totalCols ? '<div style="margin:auto;color:var(--text-3);font-size:14px;padding:48px">タイムラインを選択してください</div>' : ''}
      </div>
    </div>`;
}

// エントリーカード（ユーザー情報付き：統合カラム用）
function _cmpEntryCardWithUser(entry, user) {
  const tagsHtml = (entry.tags||[]).map(t =>
    `<span class="cmp-tag" style="background:${t.color}14;color:${t.color};border-color:${t.color}30">${escHtml(t.name)}</span>`
  ).join('');
  return `<div class="cmp-entry" onclick="showEntryDetail('${entry.id}')">
    <div class="cmp-entry-body">
      <div class="cmp-entry-author">${avatar(user, 'avatar-xs')} <span>${escHtml(user.username)}</span></div>
      <div class="cmp-date">${formatDate(entry.entry_date)}</div>
      <div class="cmp-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<div class="cmp-detail">${escHtml(entry.detail.slice(0, 60))}${entry.detail.length > 60 ? '...' : ''}</div>` : ''}
      ${tagsHtml ? `<div class="cmp-tags">${tagsHtml}</div>` : ''}
    </div>
    ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" class="cmp-entry-thumb" alt="">` : ''}
  </div>`;
}

function _cmpEntryCard(entry) {
  const tagsHtml = (entry.tags||[]).map(t =>
    `<span class="cmp-tag" style="background:${t.color}14;color:${t.color};border-color:${t.color}30">${escHtml(t.name)}</span>`
  ).join('');
  return `<div class="cmp-entry" onclick="showEntryDetail('${entry.id}')">
    <div class="cmp-entry-body">
      <div class="cmp-date">${formatDate(entry.entry_date)}</div>
      <div class="cmp-title">${escHtml(entry.title)}</div>
      ${entry.detail ? `<div class="cmp-detail">${escHtml(entry.detail.slice(0, 60))}${entry.detail.length > 60 ? '...' : ''}</div>` : ''}
      ${tagsHtml ? `<div class="cmp-tags">${tagsHtml}</div>` : ''}
    </div>
    ${entry.image_url ? `<img src="${escHtml(entry.image_url)}" class="cmp-entry-thumb" alt="">` : ''}
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

async function renderSearch(q = '') {
  setMain(`<div class="container">
    <div class="page-header">
      <h1 class="page-title">ユーザー検索</h1>
    </div>
    <div class="form-group" style="margin-bottom:16px">
      <input type="search" id="searchPageInput" placeholder="ユーザー名で検索..."
        value="${escHtml(q)}"
        oninput="_debounceSearchPage()"
        onkeydown="if(event.key==='Enter')_execSearchPage()">
    </div>
    <div id="searchPageResults"></div>
  </div>`);
  if (q) _execSearchPage();
}

let _searchPageTimer;
function _debounceSearchPage() {
  clearTimeout(_searchPageTimer);
  _searchPageTimer = setTimeout(_execSearchPage, 300);
}

async function _execSearchPage() {
  const input = document.getElementById('searchPageInput');
  const el    = document.getElementById('searchPageResults');
  if (!input || !el) return;
  const q = input.value.trim();
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = loading();
  try {
    const users = await API.searchUsers(q);
    if (!users.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon"></div><p>ユーザーが見つかりません</p></div>';
      return;
    }
    el.innerHTML = `<ul class="user-list">${users.map(u => userListItem(u)).join('')}</ul>`;
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>${escHtml(e.message)}</p></div>`;
  }
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
