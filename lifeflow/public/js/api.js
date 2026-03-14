// API client
const API = {
  base: '/api',

  token() {
    return localStorage.getItem('lf_token');
  },

  headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  },

  async request(method, path, body) {
    const opts = { method, headers: this.headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get: (p) => API.request('GET', p),
  post: (p, b) => API.request('POST', p, b),
  put: (p, b) => API.request('PUT', p, b),
  del: (p) => API.request('DELETE', p),

  // Auth
  register: (d) => API.post('/auth/register', d),
  login: (d) => API.post('/auth/login', d),
  me: () => API.get('/auth/me'),
  updateProfile: (d) => API.put('/auth/me', d),

  // Timeline
  getTags: () => API.get('/tags'),
  createTag: (d) => API.post('/tags', d),
  getUserEntries: (u) => API.get(`/users/${u}/entries`),
  getFeed: (page=1) => API.get(`/feed?page=${page}&limit=20`),
  getEntry: (id) => API.get(`/entries/${id}`),
  createEntry: (d) => API.post('/entries', d),
  updateEntry: (id, d) => API.put(`/entries/${id}`, d),
  deleteEntry: (id) => API.del(`/entries/${id}`),
  compare: (u) => API.get(`/compare/${u}`),
  compareAll: () => API.get('/compare-all'),

  // Follow
  getProfile: (u, viewerId) => API.get(`/users/${u}${viewerId ? `?viewerId=${viewerId}` : ''}`),
  follow: (u) => API.post(`/users/${u}/follow`, {}),
  unfollow: (u) => API.del(`/users/${u}/follow`),
  getFollowers: (u) => API.get(`/users/${u}/followers`),
  getFollowing: (u) => API.get(`/users/${u}/following`),
  searchUsers: (q) => API.get(`/users?q=${encodeURIComponent(q)}`),

  // Upload
  async uploadImage(file) {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/upload/image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token()}` },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'アップロード失敗');
    return data.url;
  },

  async uploadAvatar(file) {
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/api/upload/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token()}` },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'アップロード失敗');
    return data.url;
  }
};
