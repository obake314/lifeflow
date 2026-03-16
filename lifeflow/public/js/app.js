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
  if      (hash.startsWith('profile/'))        navigate('profile', hash.slice(8));
  else if (hash === 'compare')                 navigate('compare');
  else if (hash === 'login')                   navigate('login');
  else if (hash === 'register')                navigate('register');
  else if (hash === 'search')                  navigate('search');
  else if (hash === 'forgot-password')         navigate('forgot-password');
  else if (hash.startsWith('reset-password/')) navigate('reset-password', hash.slice('reset-password/'.length));
  else                                         navigate('feed');
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
  else if (page === 'login')          { location.hash = 'login';                    renderLogin(); }
  else if (page === 'register')       { location.hash = 'register';                 renderRegister(); }
  else if (page === 'forgot-password'){ location.hash = 'forgot-password';          renderForgotPassword(); }
  else if (page === 'reset-password') { location.hash = `reset-password/${param}`;  renderResetPassword(param); }
  else if (page === 'following') { renderFollowList(param, 'following'); }
  else if (page === 'followers') { renderFollowList(param, 'followers'); }
  else if (page === 'search')    { location.hash = 'search'; window._searchFollowingSet = null; renderSearch(param || ''); }
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
  const age = ageAt(user.birthdate, entry.entry_date);
  const ageStr = (age !== null && user.show_age) ? ` <span class="entry-age" style="font-size:10px">${age}歳</span>` : '';
  return `<div class="${cls}" data-uid="${user.id}" onclick="showEntryDetail('${entry.id}')">
    <div class="cmp-entry-body">
      <div class="cmp-entry-author">${avatar(user, 'avatar-xs')} <span>${escHtml(user.username)}</span>${ageStr}</div>
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
      <div class="feed-year-mine">${(myByYear[year]||[]).map(e => _cmpEntryCard(e, me)).join('')}</div>
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
        <div class="feature-title">年表を作る</div>
        <div class="feature-desc">タイトル・詳細・画像で出来事を記録できます。</div>
      </div>
      <div class="feature-card">
        <div class="feature-title">タグで整理</div>
        <div class="feature-desc">仕事・家族・趣味など、カテゴリ別に管理。</div>
      </div>
      <div class="feature-card">
        <div class="feature-title">公開範囲</div>
        <div class="feature-desc">エントリーごとに公開・非公開を設定できます。</div>
      </div>
      <div class="feature-card">
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
      ? `<button class="btn btn-sm btn-secondary" onclick="openProfileEdit()">プロフィール編集</button>
         <button class="btn btn-sm btn-ghost" onclick="_openExportModal()">エクスポート</button>` : '';

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

    // 自分のプロフィールなら pending 共有リクエストを表示
    if (isSelf) _loadPendingShares();
  } catch (e) {
    setMain(`<div class="container"><div class="empty"><div class="empty-icon"></div><p>${escHtml(e.message)}</p></div></div>`);
  }
}

async function _loadPendingShares() {
  try {
    const shares = await API.getPendingShares();
    if (!shares.length) return;
    const container = document.querySelector('.container');
    if (!container) return;
    const section = document.createElement('div');
    section.className = 'pending-shares';
    section.innerHTML = `
      <div class="pending-shares-title">共有リクエスト（${shares.length}件）</div>
      ${shares.map(s => `
        <div class="pending-share-item" id="pshare-${s.id}">
          <div class="pending-share-info">
            <span class="pending-share-from">@${escHtml(s.from_username)}</span>
            <span class="pending-share-entry">「${escHtml(s.title)}」(${s.entry_date?.slice(0,4)})</span>
          </div>
          <div class="pending-share-actions">
            <button class="btn btn-sm btn-primary" onclick="_respondShare('${s.id}', true)">承認</button>
            <button class="btn btn-sm btn-ghost" onclick="_respondShare('${s.id}', false)">拒否</button>
          </div>
        </div>`).join('')}`;
    // タグフィルター行の前に挿入
    const tagRow = container.querySelector('#profileTagFilterRow');
    tagRow ? container.insertBefore(section, tagRow) : container.appendChild(section);
  } catch {}
}

async function _respondShare(shareId, accept) {
  try {
    await API.respondShare(shareId, accept);
    document.getElementById(`pshare-${shareId}`)?.remove();
    const section = document.querySelector('.pending-shares');
    if (section && !section.querySelector('.pending-share-item')) section.remove();
    toast(accept ? '共有を承認しました' : '共有を拒否しました', accept ? 'success' : 'info');
    if (accept) navigate('profile', window._currentUser.username);
  } catch (e) { toast(e.message, 'error'); }
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

function _cmpEntryCard(entry, user) {
  const tagsHtml = (entry.tags||[]).map(t =>
    `<span class="cmp-tag" style="background:${t.color}14;color:${t.color};border-color:${t.color}30">${escHtml(t.name)}</span>`
  ).join('');
  const age = ageAt(user?.birthdate, entry.entry_date);
  const ageStr = (age !== null && user?.show_age) ? `<span class="entry-age" style="font-size:10px">${age}歳</span>` : '';
  const sharedBadge = entry.shared_from_username
    ? `<span class="shared-badge">共有 @${escHtml(entry.shared_from_username)}</span>` : '';
  return `<div class="cmp-entry" onclick="showEntryDetail('${entry.id}')">
    <div class="cmp-entry-body">
      <div class="cmp-date">${formatDate(entry.entry_date)}${ageStr}${sharedBadge}</div>
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

// ===== 検索ページ =====
window._searchTab = 'all'; // 'all' | 'user' | 'official'
window._searchFollowingSet = null; // Set of usernames

async function renderSearch(q = '') {
  setMain(`
    <div class="search-page">
      <div class="search-header">
        <div class="search-input-wrap">
          <svg class="search-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" id="searchPageInput" class="search-input"
            placeholder="名前で検索..."
            value="${escHtml(q)}"
            oninput="_debounceSearchPage()"
            onkeydown="if(event.key==='Enter')_execSearchPage()">
        </div>
        <div class="search-tabs">
          <button class="search-tab${window._searchTab==='all'?' is-active':''}" onclick="_setSearchTab('all')">すべて</button>
          <button class="search-tab${window._searchTab==='user'?' is-active':''}" onclick="_setSearchTab('user')">ユーザー</button>
          <button class="search-tab${window._searchTab==='official'?' is-active':''}" onclick="_setSearchTab('official')">公式</button>
        </div>
      </div>
      <div id="searchPageResults"></div>
    </div>`);

  // フォロー中ユーザーセットをロード（未ロード時のみ）
  if (!window._searchFollowingSet) {
    const me = window._currentUser;
    if (me) {
      try {
        const following = await API.getFollowing(me.username);
        window._searchFollowingSet = new Set(following.map(u => u.username));
      } catch { window._searchFollowingSet = new Set(); }
    } else {
      window._searchFollowingSet = new Set();
    }
  }

  if (q) {
    _execSearchPage();
  } else {
    _showSearchRecommendations();
  }
}

function _setSearchTab(tab) {
  window._searchTab = tab;
  // タブボタンのスタイル更新
  document.querySelectorAll('.search-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.textContent === {all:'すべて',user:'ユーザー',official:'公式'}[tab]);
  });
  const q = document.getElementById('searchPageInput')?.value.trim();
  if (q) _execSearchPage(); else _showSearchRecommendations();
}

// 公式アカウントのおすすめ表示（クエリ空時）
async function _showSearchRecommendations() {
  const el = document.getElementById('searchPageResults');
  if (!el) return;
  el.innerHTML = loading();
  try {
    const users = await API.searchUsers('');
    const officials = users.filter(u => u.is_official);
    if (!officials.length) {
      el.innerHTML = '<div class="search-section-label">おすすめ公式アカウント</div><div class="search-empty">公式アカウントはまだありません</div>';
      return;
    }
    el.innerHTML = `
      <div class="search-section-label">おすすめ公式アカウント</div>
      <div class="search-results">${officials.map(u => _searchUserCard(u)).join('')}</div>`;
  } catch {
    el.innerHTML = '<div class="search-empty">読み込みに失敗しました</div>';
  }
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
  if (!q) { _showSearchRecommendations(); return; }
  el.innerHTML = loading();
  try {
    let users = await API.searchUsers(q);
    const tab = window._searchTab;
    if (tab === 'official') users = users.filter(u => u.is_official);
    else if (tab === 'user') users = users.filter(u => !u.is_official);
    if (!users.length) {
      el.innerHTML = '<div class="search-empty">見つかりませんでした</div>';
      return;
    }
    el.innerHTML = `<div class="search-results">${users.map(u => _searchUserCard(u)).join('')}</div>`;
  } catch (e) {
    el.innerHTML = `<div class="search-empty">${escHtml(e.message)}</div>`;
  }
}

function _searchUserCard(user) {
  const isOfficial = !!user.is_official;
  const isFollowing = window._searchFollowingSet?.has(user.username);
  const isSelf = window._currentUser?.username === user.username;
  const avatarCls = isOfficial ? 'avatar avatar-official' : 'avatar';
  const letter = (user.username || '?')[0].toUpperCase();
  const avatarHtml = user.avatar_url
    ? `<div class="${avatarCls}"><img src="${escHtml(user.avatar_url)}" alt="" onerror="this.parentElement.innerHTML='${letter}'"></div>`
    : `<div class="${avatarCls}">${letter}</div>`;

  const followBtn = isSelf ? '' : isFollowing
    ? `<button class="btn btn-sm btn-secondary search-follow-btn" data-un="${escHtml(user.username)}" onclick="_searchUnfollow('${escHtml(user.username)}')">フォロー中</button>`
    : `<button class="btn btn-sm btn-primary search-follow-btn" data-un="${escHtml(user.username)}" onclick="_searchFollow('${escHtml(user.username)}')">フォロー</button>`;

  return `<div class="search-user-card${isOfficial?' is-official':''}" data-username="${escHtml(user.username)}">
    <div class="search-user-card-left" onclick="navigate('profile','${escHtml(user.username)}')">
      ${avatarHtml}
      <div class="search-user-card-info">
        <div class="search-user-card-name">
          ${escHtml(user.username)}
          ${isOfficial ? '<span class="search-official-label">公式</span>' : ''}
        </div>
        ${user.bio ? `<div class="search-user-card-bio">${escHtml(user.bio)}</div>` : ''}
      </div>
    </div>
    <div class="search-user-card-actions">
      ${followBtn}
      <button class="btn btn-sm btn-ghost" onclick="navigate('profile','${escHtml(user.username)}')">詳細</button>
    </div>
  </div>`;
}

async function _searchFollow(username) {
  try {
    await API.follow(username);
    window._searchFollowingSet?.add(username);
    document.querySelectorAll(`.search-user-card[data-username="${username}"] .search-follow-btn`).forEach(btn => {
      btn.textContent = 'フォロー中';
      btn.className = 'btn btn-sm btn-secondary search-follow-btn';
      btn.setAttribute('onclick', `_searchUnfollow('${username}')`);
    });
    toast('フォローしました', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function _searchUnfollow(username) {
  try {
    await API.unfollow(username);
    window._searchFollowingSet?.delete(username);
    document.querySelectorAll(`.search-user-card[data-username="${username}"] .search-follow-btn`).forEach(btn => {
      btn.textContent = 'フォロー';
      btn.className = 'btn btn-sm btn-primary search-follow-btn';
      btn.setAttribute('onclick', `_searchFollow('${username}')`);
    });
    toast('フォローを解除しました', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

// ===== エクスポート =====
function _openExportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.id = 'exportModalOverlay';
  overlay.innerHTML = `
    <div class="modal-box export-modal">
      <div class="modal-header">
        <h3 class="modal-title">エクスポート</h3>
        <button class="modal-close" onclick="document.getElementById('exportModalOverlay').remove()">✕</button>
      </div>
      <p class="export-modal-desc">テンプレートを選んでください。新しいウィンドウで開き、印刷またはPDF保存できます。</p>
      <div class="export-template-list">
        <button class="export-template-card" onclick="_exportAs('resume')">
          <div class="export-template-icon">📋</div>
          <div class="export-template-info">
            <div class="export-template-title">履歴書・職務経歴書</div>
            <div class="export-template-desc">仕事・学業を中心にまとめたビジネス向けフォーマット</div>
          </div>
        </button>
        <button class="export-template-card" onclick="_exportAs('artist')">
          <div class="export-template-icon">🎨</div>
          <div class="export-template-info">
            <div class="export-template-title">アーティストバイオグラフィー</div>
            <div class="export-template-desc">活動・作品・経歴をまとめたアーティスト向け略歴</div>
          </div>
        </button>
        <button class="export-template-card" onclick="_openWeddingPartnerPicker()">
          <div class="export-template-icon">💒</div>
          <div class="export-template-info">
            <div class="export-template-title">結婚式 経歴書</div>
            <div class="export-template-desc">パートナーを選んで2人分の経歴書を生成。式典用プロフィール</div>
          </div>
        </button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function _exportAs(type) {
  document.getElementById('exportModalOverlay')?.remove();
  const username = window._state?.username || window._currentUser?.username;
  let entries = window._profileEntries || [];
  let profile = null;
  try {
    profile = await API.getProfile(username, window._currentUser?.id);
  } catch { profile = { username, bio: '' }; }
  if (!entries.length) {
    try { entries = await API.getUserEntries(username); } catch { entries = []; }
  }
  entries = [...entries].sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''));

  const doc = type === 'resume' ? _buildResumeHtml(profile, entries)
                                : _buildArtistHtml(profile, entries);
  const win = window.open('', '_blank');
  win.document.write(doc);
  win.document.close();
}

function _openWeddingPartnerPicker() {
  const box = document.querySelector('#exportModalOverlay .modal-box');
  if (!box) return;
  box.innerHTML = `
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-ghost btn-sm" style="padding:4px 8px" onclick="_openExportModal()">← 戻る</button>
        <h3 class="modal-title" style="margin:0">パートナーを選択</h3>
      </div>
      <button class="modal-close" onclick="document.getElementById('exportModalOverlay').remove()">✕</button>
    </div>
    <p class="export-modal-desc">一緒に経歴書を作成するユーザーを選んでください。</p>
    <div class="form-group" style="margin-bottom:10px">
      <input type="search" id="weddingPartnerSearch" class="search-input" style="border-radius:8px"
        placeholder="ユーザー名で検索..."
        oninput="_debounceWeddingSearch()" autocomplete="off">
    </div>
    <div id="weddingPartnerResults" style="max-height:260px;overflow-y:auto"></div>`;
}

let _weddingSearchTimer;
function _debounceWeddingSearch() {
  clearTimeout(_weddingSearchTimer);
  _weddingSearchTimer = setTimeout(_execWeddingSearch, 280);
}
async function _execWeddingSearch() {
  const q   = document.getElementById('weddingPartnerSearch')?.value.trim();
  const el  = document.getElementById('weddingPartnerResults');
  if (!el) return;
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="padding:12px;color:#999;font-size:13px">検索中...</div>';
  try {
    const users = await API.searchUsers(q);
    const me    = window._currentUser?.username;
    const list  = users.filter(u => u.username !== me);
    if (!list.length) { el.innerHTML = '<div style="padding:12px;color:#999;font-size:13px">見つかりませんでした</div>'; return; }
    el.innerHTML = list.map(u => `
      <button class="export-template-card" style="margin-bottom:6px" onclick="_exportWedding('${escHtml(u.username)}')">
        <div class="export-template-icon" style="font-size:16px">${(u.username||'?')[0].toUpperCase()}</div>
        <div class="export-template-info">
          <div class="export-template-title">${escHtml(u.username)}</div>
          ${u.bio ? `<div class="export-template-desc">${escHtml(u.bio)}</div>` : ''}
        </div>
      </button>`).join('');
  } catch { el.innerHTML = '<div style="padding:12px;color:#c00;font-size:13px">取得に失敗しました</div>'; }
}

async function _exportWedding(partnerUsername) {
  document.getElementById('exportModalOverlay')?.remove();
  const myUsername = window._state?.username || window._currentUser?.username;
  try {
    const [myProfile, myEntries, partnerProfile, partnerEntries] = await Promise.all([
      API.getProfile(myUsername, window._currentUser?.id).catch(() => ({ username: myUsername, bio: '' })),
      (window._profileEntries?.length ? Promise.resolve(window._profileEntries) : API.getUserEntries(myUsername).catch(() => [])),
      API.getProfile(partnerUsername, window._currentUser?.id).catch(() => ({ username: partnerUsername, bio: '' })),
      API.getUserEntries(partnerUsername).catch(() => [])
    ]);
    const sort = arr => [...arr].sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''));
    const doc = _buildWeddingHtml(myProfile, sort(myEntries), partnerProfile, sort(partnerEntries));
    const win = window.open('', '_blank');
    win.document.write(doc);
    win.document.close();
  } catch (e) { toast('エクスポートに失敗しました', 'error'); }
}

// --- 共通ヘルパー ---
function _fmtDate(str, fmt = 'full') {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d)) return str;
  if (fmt === 'ym') return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
  if (fmt === 'y')  return d.getFullYear() + '年';
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}
function _groupByYear(entries) {
  const map = {};
  entries.forEach(e => {
    const y = e.entry_date ? new Date(e.entry_date).getFullYear() : '不明';
    (map[y] = map[y] || []).push(e);
  });
  return Object.entries(map).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
function _tagsText(entry) {
  return (entry.tags || []).map(t => t.name).join('・');
}

// --- 印刷用ベースCSS ---
function _baseStyles(accentColor) {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Meiryo', sans-serif;
           color: #222; background: #fff; font-size: 10pt; line-height: 1.6; }
    .page { max-width: 780px; margin: 0 auto; padding: 36px 40px; }
    h1 { margin: 0 0 4px; font-size: 22pt; font-weight: 700; letter-spacing: -0.02em; }
    h2 { font-size: 12pt; font-weight: 700; margin: 0 0 10px; color: ${accentColor};
         border-bottom: 2px solid ${accentColor}; padding-bottom: 4px; }
    h3 { font-size: 10pt; font-weight: 700; margin: 0 0 2px; }
    p  { margin: 0 0 8px; }
    .print-btn { display: block; margin: 0 auto 28px; padding: 10px 28px;
                 background: ${accentColor}; color: #fff; border: none; border-radius: 6px;
                 font-size: 13px; cursor: pointer; font-family: inherit; }
    @media print { .print-btn { display: none; } .page { padding: 20px 24px; } }`;
}

// ===== 1. 履歴書・職務経歴書 =====
function _buildResumeHtml(profile, entries) {
  const WORK_TAGS = ['仕事', '学業', '資格', '受賞'];
  const filtered = entries.filter(e => {
    const tags = (e.tags || []).map(t => t.name);
    return !tags.length || tags.some(n => WORK_TAGS.includes(n));
  });
  const rows = (filtered.length ? filtered : entries).map(e => `
    <tr>
      <td style="white-space:nowrap;padding:6px 12px 6px 0;vertical-align:top;color:#555;width:110px">${_fmtDate(e.entry_date,'ym')}</td>
      <td style="padding:6px 12px 6px 0;vertical-align:top;color:#8397FE;width:80px;font-size:9pt">${_tagsText(e) || '—'}</td>
      <td style="padding:6px 0;vertical-align:top">
        <strong>${e.title}</strong>
        ${e.detail ? `<div style="margin-top:2px;color:#555;font-size:9pt">${e.detail}</div>` : ''}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
    <title>履歴書・職務経歴書 — ${profile.username}</title>
    <style>
      ${_baseStyles('#8397FE')}
      .header { display: flex; justify-content: space-between; align-items: flex-end;
                border-bottom: 3px solid #8397FE; padding-bottom: 14px; margin-bottom: 28px; }
      .header-meta { font-size: 9pt; color: #666; text-align: right; }
      table { width: 100%; border-collapse: collapse; }
      tr:not(:last-child) td { border-bottom: 1px solid #eee; }
      section { margin-bottom: 32px; }
    </style></head><body>
    <div class="page">
      <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
      <div class="header">
        <div>
          <h1>${profile.username}</h1>
          ${profile.bio ? `<p style="margin:6px 0 0;color:#555;font-size:10pt">${profile.bio}</p>` : ''}
        </div>
        <div class="header-meta">作成日：${new Date().toLocaleDateString('ja-JP')}</div>
      </div>
      <section>
        <h2>学歴・職歴</h2>
        <table><tbody>${rows}</tbody></table>
      </section>
    </div>
  </body></html>`;
}

// ===== 2. アーティストバイオグラフィー =====
function _buildArtistHtml(profile, entries) {
  const years = _groupByYear(entries);
  const timeline = years.map(([y, es]) => `
    <div class="year-block">
      <div class="year-label">${y}</div>
      <div class="year-entries">
        ${es.map(e => `
          <div class="bio-entry">
            ${e.image_url ? `<img src="${e.image_url}" alt="" class="bio-img">` : ''}
            <div>
              <strong>${e.title}</strong>
              ${_tagsText(e) ? `<span class="tag-pill">${_tagsText(e)}</span>` : ''}
              ${e.detail ? `<p style="margin:4px 0 0;color:#555;font-size:9pt">${e.detail}</p>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
    <title>バイオグラフィー — ${profile.username}</title>
    <style>
      ${_baseStyles('#8397FE')}
      .hero { text-align: center; padding: 24px 0 32px; border-bottom: 1px solid #eee; margin-bottom: 32px; }
      .hero h1 { font-size: 28pt; }
      .hero .bio { margin-top: 10px; color: #555; max-width: 560px; margin-left: auto; margin-right: auto; }
      .year-block { display: flex; gap: 16px; margin-bottom: 24px; }
      .year-label { width: 56px; flex-shrink: 0; font-weight: 700; color: #8397FE; font-size: 11pt; padding-top: 2px; }
      .year-entries { flex: 1; border-left: 2px solid #e8eaff; padding-left: 16px; display: flex; flex-direction: column; gap: 14px; }
      .bio-entry { display: flex; gap: 12px; align-items: flex-start; }
      .bio-img { width: 72px; height: 54px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
      .tag-pill { display: inline-block; background: #ede9ff; color: #8397FE; border-radius: 4px;
                  padding: 1px 7px; font-size: 8pt; margin-left: 6px; vertical-align: middle; }
    </style></head><body>
    <div class="page">
      <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
      <div class="hero">
        <h1>${profile.username}</h1>
        ${profile.bio ? `<p class="bio">${profile.bio}</p>` : ''}
      </div>
      <h2>年表</h2>
      ${timeline || '<p style="color:#999">エントリーがありません</p>'}
    </div>
  </body></html>`;
}

// ===== 3. 結婚式 経歴書 =====
function _buildWeddingHtml(profileA, entriesA, profileB, entriesB) {
  function timeline(entries) {
    return _groupByYear(entries).map(([y, es]) => `
      <div class="w-year">
        <div class="w-year-label">${y}</div>
        <ul class="w-list">
          ${es.map(e => `
            <li>
              <span class="w-date">${_fmtDate(e.entry_date,'ym')}</span>
              <span class="w-title">${e.title}</span>
              ${e.detail ? `<span class="w-detail">— ${e.detail}</span>` : ''}
            </li>`).join('')}
        </ul>
      </div>`).join('') || '<p style="color:#999;font-size:9pt">エントリーがありません</p>';
  }

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
    <title>経歴書 — ${profileA.username} & ${profileB.username}</title>
    <style>
      ${_baseStyles('#b48fc8')}
      body { font-size: 10.5pt; }
      .w-cover { text-align: center; padding: 40px 0 28px; }
      .w-cover .label { font-size: 9pt; letter-spacing: .2em; color: #b48fc8; margin-bottom: 14px; }
      .w-cover .names { font-size: 24pt; font-weight: 700; color: #3a2a4a; letter-spacing: .04em; }
      .w-cover .amp   { color: #c9aad8; margin: 0 16px; }
      .w-cover .bio   { margin-top: 8px; color: #666; font-size: 9.5pt; line-height: 1.7; }
      .w-divider { text-align: center; margin: 6px 0 28px; color: #c9aad8; font-size: 14pt; letter-spacing: .5em; }
      .w-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
      .w-col-name { font-size: 13pt; font-weight: 700; color: #8c6aaa; border-bottom: 1px solid #dcc8e8;
                    padding-bottom: 6px; margin-bottom: 16px; }
      .w-year { display: flex; gap: 14px; margin-bottom: 16px; }
      .w-year-label { width: 44px; flex-shrink: 0; font-weight: 700; color: #b48fc8; font-size: 9.5pt; padding-top: 2px; }
      .w-list { list-style: none; margin: 0; padding: 0; border-left: 1px dashed #dcc8e8; padding-left: 12px; flex: 1; }
      .w-list li { margin-bottom: 6px; }
      .w-date  { color: #888; font-size: 8.5pt; margin-right: 6px; }
      .w-title { font-weight: 600; color: #3a2a4a; }
      .w-detail { color: #666; font-size: 8.5pt; margin-left: 5px; }
      @media print { .w-cols { gap: 20px; } }
    </style></head><body>
    <div class="page">
      <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
      <div class="w-cover">
        <div class="label">WEDDING PROFILE</div>
        <div class="names">
          ${profileA.username}<span class="amp">&</span>${profileB.username}
        </div>
        ${profileA.bio || profileB.bio ? `<p class="bio">${[profileA.bio, profileB.bio].filter(Boolean).join('　/　')}</p>` : ''}
      </div>
      <div class="w-divider">✦ ✦ ✦</div>
      <div class="w-cols">
        <div>
          <div class="w-col-name">${profileA.username}</div>
          ${timeline(entriesA)}
        </div>
        <div>
          <div class="w-col-name">${profileB.username}</div>
          ${timeline(entriesB)}
        </div>
      </div>
    </div>
  </body></html>`;
}

// ===== 共有イベント UI =====
let _shareEntryId = null;
let _shareSearchTimer;

function openShareEntryModal(entryId) {
  _shareEntryId = entryId;
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.id = 'shareEntryOverlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <h3 class="modal-title">共有リクエストを送る</h3>
        <button class="modal-close" onclick="document.getElementById('shareEntryOverlay').remove()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-2);margin:0 0 12px">共有したいユーザーを検索して選んでください。承認されるとそのユーザーのタイムラインにも表示されます。</p>
      <div class="search-input-wrap" style="margin-bottom:10px">
        <input type="search" id="shareUserSearch" class="search-input" style="border-radius:8px"
          placeholder="ユーザー名で検索..."
          oninput="_debounceShareSearch()" autocomplete="off">
      </div>
      <div id="shareUserResults" style="max-height:240px;overflow-y:auto"></div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function _debounceShareSearch() {
  clearTimeout(_shareSearchTimer);
  _shareSearchTimer = setTimeout(_execShareSearch, 280);
}
async function _execShareSearch() {
  const q  = document.getElementById('shareUserSearch')?.value.trim();
  const el = document.getElementById('shareUserResults');
  if (!el) return;
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<div style="padding:10px;color:#999;font-size:13px">検索中...</div>';
  try {
    const users = await API.searchUsers(q);
    const me = window._currentUser?.username;
    const list = users.filter(u => u.username !== me);
    if (!list.length) { el.innerHTML = '<div style="padding:10px;color:#999;font-size:13px">見つかりませんでした</div>'; return; }
    el.innerHTML = list.map(u => `
      <button class="export-template-card" style="margin-bottom:6px" onclick="_doShareEntry('${escHtml(u.username)}')">
        <div class="export-template-icon" style="font-size:15px">${(u.username||'?')[0].toUpperCase()}</div>
        <div class="export-template-info">
          <div class="export-template-title">${escHtml(u.username)}</div>
          ${u.bio ? `<div class="export-template-desc">${escHtml(u.bio)}</div>` : ''}
        </div>
      </button>`).join('');
  } catch { el.innerHTML = '<div style="padding:10px;color:#c00;font-size:13px">取得に失敗しました</div>'; }
}

async function _doShareEntry(username) {
  if (!_shareEntryId) return;
  try {
    await API.shareEntry(_shareEntryId, username);
    document.getElementById('shareEntryOverlay')?.remove();
    toast(`@${username} に共有リクエストを送りました`, 'success');
  } catch (e) { toast(e.message, 'error'); }
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
    <p style="text-align:center;margin-top:14px;font-size:12px">
      <a href="#" onclick="navigate('forgot-password')" style="color:var(--text-3)">パスワードをお忘れの方</a>
    </p>
    <p style="text-align:center;margin-top:8px;font-size:12px;color:var(--text-3)">
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
      <label>生年月日（任意）</label>
      <input type="date" id="regBirthdate">
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
  const username  = document.getElementById('regUser')?.value.trim();
  const email     = document.getElementById('regEmail')?.value.trim();
  const password  = document.getElementById('regPass')?.value;
  const birthdate = document.getElementById('regBirthdate')?.value || '';
  const errEl     = document.getElementById('regError');
  try {
    const res = await API.register({ username, email, password, birthdate });
    localStorage.setItem('lf_token', res.token);
    window._currentUser = res.user;
    renderNav();
    navigate('feed');
    toast('登録が完了しました', 'success');
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function renderForgotPassword() {
  setMain(`<div class="auth-page"><div class="auth-card">
    <h2>パスワードをリセット</h2>
    <p class="auth-sub">登録済みのメールアドレスを入力してください</p>
    <div class="form-group">
      <label>メールアドレス</label>
      <input type="email" id="forgotEmail" placeholder="you@example.com" autocomplete="email"
             onkeydown="if(event.key==='Enter')doForgotPassword()">
    </div>
    <div id="forgotError" class="form-error"></div>
    <div id="forgotResult"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="doForgotPassword()">リセットリンクを発行</button>
    <p style="text-align:center;margin-top:18px;font-size:12px;color:var(--text-3)">
      <a href="#" onclick="navigate('login')" style="color:var(--primary);font-weight:600">← ログインに戻る</a>
    </p>
  </div></div>`);
}

async function doForgotPassword() {
  const email = document.getElementById('forgotEmail')?.value.trim();
  const errEl = document.getElementById('forgotError');
  const resEl = document.getElementById('forgotResult');
  if (errEl) errEl.textContent = '';
  try {
    const data = await API.forgotPassword(email);
    if (data.token) {
      const url = `${location.origin}${location.pathname}#reset-password/${data.token}`;
      resEl.innerHTML = `
        <div class="forgot-result-box">
          <p style="margin:0 0 8px;font-weight:600;color:var(--success)">リセットリンクを発行しました</p>
          <p style="margin:0 0 10px;font-size:12px;color:var(--text-2)">通常はメールで送信されますが、このデモ環境では下のリンクを使用してください。有効期限は1時間です。</p>
          <a href="${url}" class="forgot-reset-link">${url}</a>
        </div>`;
    } else {
      // メールアドレスが登録されていない場合も同じメッセージ
      resEl.innerHTML = `<div class="forgot-result-box"><p style="margin:0;color:var(--text-2);font-size:13px">ご入力のメールアドレスが登録されている場合、リセットリンクを送信します。</p></div>`;
    }
    document.querySelector('#forgotResult + button, .btn-primary')?.setAttribute('disabled', 'true');
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function renderResetPassword(token) {
  if (!token) { navigate('login'); return; }
  setMain(`<div class="auth-page"><div class="auth-card">
    <h2>新しいパスワードを設定</h2>
    <p class="auth-sub">6文字以上で入力してください</p>
    <div class="form-group">
      <label>新しいパスワード</label>
      <input type="password" id="resetPass1" placeholder="新しいパスワード" autocomplete="new-password">
    </div>
    <div class="form-group">
      <label>確認（もう一度）</label>
      <input type="password" id="resetPass2" placeholder="もう一度入力" autocomplete="new-password"
             onkeydown="if(event.key==='Enter')doResetPassword('${token}')">
    </div>
    <div id="resetError" class="form-error"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="doResetPassword('${token}')">パスワードを変更</button>
  </div></div>`);
}

async function doResetPassword(token) {
  const pass1  = document.getElementById('resetPass1')?.value;
  const pass2  = document.getElementById('resetPass2')?.value;
  const errEl  = document.getElementById('resetError');
  if (errEl) errEl.textContent = '';
  if (pass1 !== pass2) { if (errEl) errEl.textContent = 'パスワードが一致しません'; return; }
  try {
    await API.resetPassword(token, pass1);
    toast('パスワードを変更しました。ログインしてください。', 'success');
    navigate('login');
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
      <label>生年月日</label>
      <input type="date" id="pe-birthdate" value="${escHtml(u?.birthdate || '')}">
    </div>
    <div class="form-group">
      <label class="toggle-label">
        <input type="checkbox" id="pe-show-age" ${(u?.show_age ?? 1) ? 'checked' : ''}>
        エントリーに年齢を表示する
      </label>
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
  const birthdate  = document.getElementById('pe-birthdate')?.value || '';
  const show_age   = document.getElementById('pe-show-age')?.checked ? 1 : 0;
  try {
    const updated = await API.updateProfile({ bio, avatar_url, birthdate, show_age });
    window._currentUser = { ...window._currentUser, ...updated };
    renderNav();
    closeModal();
    toast('プロフィールを更新しました', 'success');
    navigate('profile', updated.username);
  } catch (e) { toast(e.message, 'error'); }
}

init();
