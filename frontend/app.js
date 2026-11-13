import Hls from 'hls.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M7.1 7.1a7 7 0 0 0 0 9.8m9.8-9.8a7 7 0 0 1 0 9.8M4.3 4.3a11 11 0 0 0 0 15.4m15.4-15.4a11 11 0 0 1 0 15.4"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4"/>',
  list: '<path d="M4 5h16M4 10h16M4 15h8M4 20h8m5-5 5 3-5 3z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
  sliders: '<path d="M4 3v5m0 4v9M12 3v10m0 4v4M20 3v3m0 4v11M1 8h6m2 9h6m2-11h6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m7-13 5 5-5 5m-7-5h12"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M5.1 7a8 8 0 0 1 13.3-1L20 8M4 16l1.6 2A8 8 0 0 0 19 17"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  link: '<path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(2 1)"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-17a3 3 0 0 1 0 6m4 11v-3a6 6 0 0 0-3-5"/>',
  monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  tv: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="m7 2 5 5 5-5m-7 10 5 3-5 3z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v.1"/>',
  edit: '<path d="m15 5 4 4M4 20l1-5L17 3l4 4L9 19z"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  down: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths[name] || paths.film; // Only constant SVG paths, never user input.
  return svg;
}
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((node) => node.replaceWith(icon(node.dataset.icon)));
}
function node(tag, className, content) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content !== undefined) result.textContent = String(content);
  return result;
}
function action(label, name, callback, className = 'icon-button') {
  const button = node('button', className);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  if (name) button.append(icon(name));
  if (!['icon-button', 'media-art', 'queue-copy'].includes(className)) button.append(document.createTextNode(label));
  button.addEventListener('click', () => Promise.resolve(callback()).catch((error) => toast(error.message, true)));
  return button;
}
function toast(message, error = false) {
  const entry = node('div', `toast${error ? ' error' : ''}`);
  entry.append(icon(error ? 'alert' : 'check'), node('span', '', message));
  $('#toast-container').append(entry);
  setTimeout(() => entry.remove(), 6000);
}
const state = {
  info: null, view: 'home', filter: 'all', local: [], channels: [], playlists: [], sources: [],
  schedules: [], queue: [], current: null, descriptor: null, hls: null, socket: null,
  poll: null, heartbeat: null, reconnect: null, attached: null, playingRequest: false,
  applyingSync: false, remoteState: null, jellyfinItems: [], jellyfinLabel: '',
  expandedPlaylist: null, limit: 24, sourceWarnings: [], authenticated: false,
};
const video = $('#video');
const viewNames = { home: 'Beranda', live: 'Live TV', local: 'Media lokal', jellyfin: 'Jellyfin', playlists: 'Playlist', sources: 'Sumber streaming', schedules: 'Jadwal tayangan' };
const subtitles = {
  home: 'Dari siaran langsung sampai koleksi pribadi. Semuanya di sini.',
  live: 'Siaran langsung dari playlist IPTV dan server TVheadend milikmu.',
  local: 'Koleksi pribadimu, diputar langsung dari server.',
  jellyfin: 'Film, serial, dan episode dari perpustakaan Jellyfin milikmu.',
  playlists: 'Susun tayangan favoritmu. Simpan untuk lain waktu.',
  sources: 'Hubungkan, aktifkan, dan kelola sumber streaming pribadimu.',
  schedules: 'Cari acara di EPG dan siapkan tayangan berikutnya.',
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', ...options,
    headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Respons server tidak valid.'); }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') showLogin();
    throw new Error(data.error || 'Permintaan gagal.');
  }
  return data;
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
const patch = (path, data) => api(path, { method: 'PATCH', body: JSON.stringify(data) });
const remove = (path) => api(path, { method: 'DELETE' });
function labelFor(item) {
  if (item.title) return item.title;
  if (item.path) return item.path.split('/').pop();
  try { return new URL(item.url).hostname; } catch { return 'Media'; }
}
function kindLabel(item) {
  return { local: 'MEDIA LOKAL', channel: 'LIVE TV', jellyfin: 'JELLYFIN', bridge: 'DISCORD', url: 'URL STREAM' }[item.kind] || 'MEDIA';
}
function storeQueue() {
  try { sessionStorage.setItem('666-queue', JSON.stringify(state.queue)); } catch { /* Storage can be disabled. */ }
  renderQueue();
}
function showLogin() {
  state.authenticated = false;
  detachPlayer();
  $('#boot').hidden = true;
  $('#app-shell').hidden = true;
  $('#login-screen').hidden = false;
}
async function showWorkspace() {
  state.authenticated = true;
  state.info = await api('/api/info');
  $('#boot').hidden = true;
  $('#login-screen').hidden = true;
  $('#app-shell').hidden = false;
  try {
    const queue = JSON.parse(sessionStorage.getItem('666-queue') || '[]');
    state.queue = Array.isArray(queue) ? queue.slice(0, 500) : [];
  } catch { state.queue = []; }
  renderQueue();
  $('#jellyfin-provider-state').textContent = state.info.providers.jellyfin ? 'Server dikonfigurasi' : 'Belum dikonfigurasi';
  renderView();
  const match = location.pathname.match(/^\/watch\/([a-f0-9]{32})$/);
  if (match) {
    try { await watchSession(match[1]); } catch (error) { toast(error.message, true); }
  }
  await refreshData();
}
async function refreshData() {
  const button = $('#refresh-button');
  button.disabled = true;
  const resources = [
    ['/api/library', 'local'], ['/api/channels', 'channels'], ['/api/playlists', 'playlists'],
    ['/api/sources', 'sources'], ['/api/schedules', 'schedules'],
  ];
  await Promise.all(resources.map(async ([path, key]) => {
    try {
      const data = await api(path);
      state[key] = data.items;
      if (key === 'channels') state.sourceWarnings = data.warnings || [];
      if (key === 'sources') state.tvhEnabled = data.tvheadend_enabled;
    } catch (error) { if (state.authenticated) toast(error.message, true); }
  }));
  button.disabled = false;
  $('#channel-count').textContent = state.channels.length;
  $('#playlist-count').textContent = state.playlists.length;
  $('#local-count').textContent = state.local.length;
  $('#live-tab-count').textContent = state.channels.length;
  renderView();
}
function navigate(view) {
  state.view = view;
  state.filter = 'all';
  state.limit = 24;
  $('#library-search').value = '';
  $('#sidebar').classList.remove('open');
  renderView();
  if (view === 'jellyfin' && state.info.providers.jellyfin && !state.jellyfinItems.length) loadJellyfin();
  if (view !== 'home') $('#library-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function emptyState(name, title, description, buttonLabel, callback) {
  const section = node('div', 'empty-state');
  section.append(icon(name), node('h3', '', title), node('p', '', description));
  if (buttonLabel) section.append(action(buttonLabel, 'plus', callback, 'button secondary'));
  return section;
}
function renderView() {
  const view = state.view;
  const home = view === 'home';
  $('#hero').hidden = !home;
  $('#watch-area').hidden = !home;
  $('#providers-section').hidden = !home;
  $('#breadcrumb-current').textContent = viewNames[view];
  $('#page-title').replaceChildren(document.createTextNode(home ? 'Ruang tontonanmu' : viewNames[view]), node('span', '', '.'));
  $('#page-subtitle').textContent = subtitles[view];
  $('#page-eyebrow').textContent = home ? 'MAKE IT YOUR SCREEN' : 'YOUR PRIVATE COLLECTION';
  $$('.sidebar [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  $('#library-title').textContent = ({ home: 'Perpustakaan media', live: 'Channel tersedia', local: 'Koleksi lokal', jellyfin: state.jellyfinLabel || 'Perpustakaan Jellyfin', playlists: 'Playlist milikmu', sources: 'Sumber yang terhubung', schedules: 'Jadwal & panduan acara' })[view];
  $('#library-eyebrow').textContent = home ? 'KOLEKSI PILIHANMU' : 'SEMUA DALAM KENDALIMU';
  $('#library-tabs').hidden = !home;
  $('#library-search').parentElement.hidden = ['sources', 'playlists', 'schedules'].includes(view);
  const libraryAction = $('#library-action');
  libraryAction.hidden = view === 'schedules';
  const actions = { sources: ['plus', 'Tambah sumber'], playlists: ['plus', 'Playlist baru'], live: ['layers', 'Tambah sumber'], jellyfin: ['refresh', 'Muat koleksi'] };
  const [symbol, title] = actions[view] || ['upload', 'Unggah media'];
  libraryAction.replaceChildren(icon(symbol), document.createTextNode(title));
  if (view === 'sources') return renderSources();
  if (view === 'playlists') return renderPlaylists();
  if (view === 'schedules') return renderSchedules();
  renderLibrary();
}
function renderLibrary() {
  const target = $('#view-content');
  target.replaceChildren();
  let items = state.view === 'jellyfin' ? state.jellyfinItems : state.view === 'live' ? state.channels : state.view === 'local' ? state.local : [...state.local, ...state.channels];
  const search = $('#library-search').value.trim().toLowerCase();
  if (state.view !== 'jellyfin') items = items.filter((item) => (!search || `${item.title} ${item.source || ''} ${item.group || ''}`.toLowerCase().includes(search)) && (state.filter === 'all' || item.kind === state.filter));
  $('#result-count').textContent = `${items.length} ${state.view === 'live' ? 'channel' : 'media'} tersedia`;
  $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.filter));
  if (state.view === 'live') state.sourceWarnings.forEach((warning) => target.append(node('div', 'view-notice', warning)));
  if (!items.length) {
    const jellyfin = state.view === 'jellyfin';
    const live = state.view === 'live' || state.filter === 'channel';
    const title = search ? 'Belum ada hasil yang cocok' : jellyfin ? (state.info.providers.jellyfin ? 'Koleksi Jellyfin masih kosong' : 'Hubungkan perpustakaan Jellyfin') : live ? 'Channel-mu akan tampil di sini' : 'Koleksi dimulai dari satu tayangan.';
    const description = search ? 'Coba kata kunci lain atau muat ulang sumber media.' : jellyfin ? 'Atur JELLYFIN_URL dan JELLYFIN_API_KEY di environment server. Credential tidak dimasukkan ke browser.' : live ? 'Tambahkan sumber M3U milikmu atau atur koneksi TVheadend di server.' : 'Unggah file media ke server, hubungkan IPTV, atau mulai dari sebuah URL.';
    target.append(emptyState(jellyfin ? 'film' : live ? 'tv' : 'folder', title, description,
      search ? null : jellyfin ? 'Lihat konfigurasi' : live ? 'Tambah sumber IPTV' : 'Unggah media pertama',
      jellyfin ? showServerInfo : live ? openSource : () => $('#file-upload').click()));
    return;
  }
  if (state.view === 'jellyfin' && state.jellyfinLabel) target.append(action('Kembali ke koleksi', 'up', () => { state.jellyfinLabel = ''; return loadJellyfin(); }, 'text-button'));
  const grid = node('div', 'media-grid');
  items.slice(0, state.limit).forEach((item) => grid.append(mediaCard(item)));
  target.append(grid);
  if (items.length > state.limit) target.append(action('Tampilkan lebih banyak', 'plus', () => { state.limit += 24; renderLibrary(); }, 'button secondary'));
}
function mediaCard(item) {
  const card = node('article', `media-card ${item.kind}`);
  const play = action(`Putar ${labelFor(item)}`, null, () => item.type === 'Series' || item.type === 'Season' ? browseSeries(item) : playMedia(item), 'media-art');
  play.append(icon(item.kind === 'channel' ? 'tv' : item.extension && ['MP3', 'FLAC', 'M4A', 'WAV'].includes(item.extension) ? 'radio' : 'film'));
  play.append(node('span', 'media-kind', item.extension || (item.type === 'Series' ? 'SERIAL' : kindLabel(item))));
  const playOverlay = node('span', 'media-play'); playOverlay.append(icon('play')); play.append(playOverlay);
  const detail = node('div', 'media-detail');
  detail.append(node('h3', '', labelFor(item)), node('p', '', item.now_playing || item.source || item.series || (item.size ? formatSize(item.size) : item.year || 'Koleksi pribadimu')));
  const controls = node('div', 'media-card-actions');
  if (!['Series', 'Season'].includes(item.type)) controls.append(action('Tambah ke antrean', 'plus', () => enqueue(item)), action('Simpan ke playlist', 'list', () => choosePlaylist(item)), action('Jadwalkan tayangan', 'calendar', () => openSchedule(item)));
  card.append(play, detail, controls);
  return card;
}
function formatSize(size) { return size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }
function enqueue(item) {
  if (state.queue.length >= 500) throw new Error('Maksimum 500 media dalam antrean.');
  state.queue.push(item); storeQueue(); toast('Ditambahkan ke antrean.');
}
function renderQueue() {
  const list = $('#queue-list'); list.replaceChildren();
  $('#queue-count').textContent = state.queue.length;
  $('#clear-queue').disabled = !state.queue.length;
  if (!state.queue.length) {
    const empty = node('div', 'queue-empty');
    empty.append(icon('list'), node('h3', '', 'Belum ada antrean'), node('p', '', 'Tambahkan tayangan. Nikmati tanpa jeda memilih.'));
    list.append(empty); return;
  }
  state.queue.forEach((item, index) => {
    const row = node('div', 'queue-item'); const thumb = node('span', 'queue-thumb'); thumb.append(icon(item.kind === 'channel' ? 'tv' : 'film'));
    const copy = action(`Putar ${labelFor(item)}`, null, () => {
      state.queue.splice(index, 1); storeQueue(); return playMedia(item);
    }, 'queue-copy'); copy.replaceChildren(node('strong', '', labelFor(item)), node('small', '', kindLabel(item)));
    row.append(node('span', 'queue-index', String(index + 1).padStart(2, '0')), thumb, copy, action('Hapus dari antrean', 'x', () => { state.queue.splice(index, 1); storeQueue(); }));
    list.append(row);
  });
}
let streamMode = 'play';
function openStream(mode = 'play', playlistId = '') {
  streamMode = mode;
  $('#stream-form').reset(); $('#stream-form-error').textContent = '';
  $('#stream-dialog-title').textContent = mode === 'queue' ? 'Tambahkan tayangan' : mode === 'save' ? 'Simpan ke playlist' : 'Buka stream baru';
  const select = $('#stream-playlist'); select.replaceChildren(node('option', '', 'Tidak disimpan')); select.firstChild.value = '';
  state.playlists.forEach((playlist) => { const option = node('option', '', playlist.name); option.value = playlist.id; select.append(option); });
  select.value = playlistId;
  $('#stream-submit').replaceChildren(icon(mode === 'play' ? 'play' : 'plus'), document.createTextNode(mode === 'play' ? 'Putar sekarang' : mode === 'queue' ? 'Tambah ke antrean' : 'Simpan tayangan'));
  $('#stream-dialog').showModal();
  $('#stream-url').focus();
}
function openSource() { $('#source-form').reset(); $('#source-form-error').textContent = ''; $('#source-dialog').showModal(); }
function textDialog(title, label, initial, callback) {
  $('#text-dialog-title').textContent = title; $('#text-label').textContent = label; $('#text-input').value = initial;
  $('#text-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = $('#text-form button[type=submit]'); button.disabled = true;
    try { await callback($('#text-input').value.trim()); $('#text-dialog').close(); } catch (error) { toast(error.message, true); } finally { button.disabled = false; }
  };
  $('#text-dialog').showModal(); $('#text-input').focus();
}
function infoDialog(title, content) {
  $('#info-title').textContent = title; $('#info-content').replaceChildren(content); $('#info-dialog').showModal();
}
function showHelp() {
  const section = node('div');
  [
    ['01 / Buka sumbermu', 'Gunakan Buka stream untuk URL YouTube, Twitch, MP4, HLS, RTSP, atau sumber lain yang didukung yt-dlp. VOD diunduh dulu; live diproses langsung.'],
    ['02 / Bangun koleksimu', 'Unggah video/audio melalui Media lokal. Tambahkan URL M3U melalui Sumber streaming. Jellyfin dan TVheadend dikonfigurasi di environment server.'],
    ['03 / Tonton bersama', 'Saat video siap, Bagikan ruang menyalin link yang sama. Semua penonton perlu password server. Aktifkan Sinkron untuk berbagi play/pause/seek. Browser mungkin meminta klik play terlebih dahulu.'],
    ['04 / Kendalikan tayangan', 'Gunakan kontrol player untuk volume, posisi, dan fullscreen. Antrean lanjut otomatis setelah VOD selesai. Tombol stop mengakhiri sesi untuk semua penonton ruang.'],
    ['Catatan hosting', 'Jadwal aktif disimpan di memori dan perlu dibuat ulang setelah restart. Playlist/sumber/file lokal tersimpan di DATA_DIR. Bot Discord resmi hanya mengirim audio; video tetap di browser.'],
  ].forEach(([title, description]) => section.append(node('h3', '', title), node('p', '', description)));
  infoDialog('Mulai dari satu play.', section);
}
async function showServerInfo() {
  const data = await api('/api/info'); state.info = data;
  const section = node('div');
  [ ['Aplikasi', `${data.app} ${data.version}`], ['FFmpeg / FFprobe', data.runtime.ffmpeg && data.runtime.ffprobe ? 'Tersedia' : 'Perlu diperiksa'], ['Encoder', data.runtime.encoder], ['Discord resmi', data.discord.state], ['Batas sesi', data.limits.streams], ['Batas upload', `${data.limits.upload_mb} MB`], ['Jellyfin', data.providers.jellyfin ? 'Dikonfigurasi' : 'Belum dikonfigurasi'], ['TVheadend', data.providers.tvheadend ? 'Dikonfigurasi' : 'Belum dikonfigurasi'] ].forEach(([key, value]) => {
    const row = node('div', 'info-row'); row.append(node('span', '', key), node('strong', '', value)); section.append(row);
  });
  section.append(node('h3', '', 'Konfigurasi provider'), node('p', '', 'Atur JELLYFIN_URL / JELLYFIN_API_KEY atau TVHEADEND_URL / TVHEADEND_USER / TVHEADEND_PASS melalui environment panel hosting, lalu restart. Jangan kirim credential ke chat atau source code.'), node('p', '', 'Bot Discord resmi memakai DISCORD_BOT_TOKEN. Video screenshare native tidak tersedia melalui API bot; gunakan player web.'));
  infoDialog('Informasi server', section);
}
function showCredits() {
  const section = node('div');
  section.append(node('p', '', '666 Streaming adalah turunan Slopsoil, karya topsoil / dev-topsoil. Lisensi GPL asli dalam LICENSE dipertahankan tanpa perubahan. Rebranding tidak menghapus hak dan atribusi pembuat asli.'));
  const link = node('a', '', 'Source asli & atribusi'); link.href = 'https://github.com/dev-topsoil/slopsoil'; link.target = '_blank'; link.rel = 'noopener noreferrer'; section.append(link);
  section.append(node('h3', '', 'Komponen pihak ketiga'), node('p', '', 'Node.js 22, discord.js v14 dan @discordjs/voice (Apache-2.0), Express/ws (MIT), hls.js (Apache-2.0), Manrope dan Barlow Condensed (SIL OFL). yt-dlp mandiri membawa CPython internal sesuai persetujuan pengguna; tidak memerlukan Python sistem. Lisensi binary FFmpeg/yt-dlp mengikuti build dan dependency-nya. Lihat THIRD_PARTY.md.'));
  infoDialog('Tentang & atribusi', section);
}
function renderSources() {
  const target = $('#view-content'); target.replaceChildren(); $('#result-count').textContent = `${state.sources.length} sumber IPTV`;
  if (!state.sources.length) target.append(emptyState('layers', 'Sambungkan sumber pertamamu', 'Daftar channel akan dibaca dari playlist M3U yang kamu miliki. Tidak ada channel bawaan atau konten contoh.', 'Tambah sumber IPTV', openSource));
  state.sources.forEach((source) => {
    const row = node('div', 'source-row'); const symbol = node('span', 'row-icon'); symbol.append(icon('layers'));
    const copy = node('div', 'row-copy'); copy.append(node('h3', '', source.name), node('p', '', `${source.channels} channel · Playlist M3U`));
    const controls = node('div', 'row-buttons');
    controls.append(action(source.enabled ? 'Nonaktifkan sumber' : 'Aktifkan sumber', source.enabled ? 'stop' : 'play', async () => {
      await patch(`/api/sources/${source.index}`, { enabled: !source.enabled }); await refreshData();
    }), action('Hapus sumber', 'trash', async () => { if (confirm(`Hapus sumber "${source.name}"?`)) { await remove(`/api/sources/${source.index}`); await refreshData(); } }));
    row.append(symbol, copy, node('span', `source-state${source.enabled ? '' : ' off'}`, source.enabled ? 'AKTIF' : 'NONAKTIF'), controls); target.append(row);
  });
  if (state.info.providers.tvheadend) {
    const row = node('div', 'source-row'); const copy = node('div', 'row-copy'); copy.append(node('h3', '', 'TVheadend'), node('p', '', 'Live TV & EPG · Dikonfigurasi melalui environment'));
    row.append(icon('tv'), copy, action(state.tvhEnabled ? 'Nonaktifkan TVheadend' : 'Aktifkan TVheadend', state.tvhEnabled ? 'stop' : 'play', async () => { await patch('/api/tvheadend', { enabled: !state.tvhEnabled }); await refreshData(); })); target.append(row);
  }
  target.append(node('p', 'player-caption', 'URL dan credential provider tidak ditampilkan di daftar ini. Gunakan konten yang boleh kamu akses.'));
}
async function newPlaylist() {
  textDialog('Playlist baru', 'Nama playlist', '', async (name) => { state.playlists = (await post('/api/playlists', { name })).items; $('#playlist-count').textContent = state.playlists.length; renderView(); });
}
async function savePlaylist(playlist, items) {
  state.playlists = (await patch(`/api/playlists/${playlist.id}`, { items })).items;
  renderView();
}
function choosePlaylist(item) {
  if (!state.playlists.length) {
    return textDialog('Playlist pertama', 'Nama playlist', '', async (name) => {
      state.playlists = (await post('/api/playlists', { name })).items;
      const playlist = state.playlists.at(-1); await savePlaylist(playlist, [item]); toast('Media disimpan ke playlist.');
    });
  }
  const section = node('div'); section.append(node('p', '', `Simpan "${labelFor(item)}" ke:`));
  state.playlists.forEach((playlist) => section.append(action(playlist.name, 'list', async () => {
    await savePlaylist(playlist, [...playlist.items, item]); $('#info-dialog').close(); toast('Media disimpan ke playlist.');
  }, 'button secondary')));
  infoDialog('Simpan ke playlist', section);
}
function renderPlaylists() {
  const target = $('#view-content'); target.replaceChildren(); $('#result-count').textContent = `${state.playlists.length} playlist`;
  if (!state.playlists.length) { target.append(emptyState('list', 'Susun maraton versimu sendiri.', 'Simpan URL, channel, atau file lokal dalam playlist. Koleksimu akan tetap ada setelah server restart.', 'Buat playlist pertama', newPlaylist)); return; }
  state.playlists.forEach((playlist) => {
    const row = node('div', 'playlist-row'); const symbol = node('span', 'row-icon'); symbol.append(icon('list'));
    const copy = node('div', 'row-copy'); copy.append(node('h3', '', playlist.name), node('p', '', `${playlist.items.length} tayangan tersimpan`));
    const controls = node('div', 'row-buttons');
    const play = action('Putar playlist', 'play', async () => {
      state.queue = playlist.items.slice(1); storeQueue(); await playMedia(playlist.items[0]);
    }); play.disabled = !playlist.items.length;
    controls.append(play, action('Lihat / edit isi playlist', 'list', () => { state.expandedPlaylist = state.expandedPlaylist === playlist.id ? null : playlist.id; renderPlaylists(); }), action('Tambah URL', 'plus', () => openStream('save', playlist.id)), action('Ubah nama', 'edit', () => textDialog('Ubah nama playlist', 'Nama playlist', playlist.name, async (name) => {
      state.playlists = (await patch(`/api/playlists/${playlist.id}`, { name })).items; renderView();
    })), action('Hapus playlist', 'trash', async () => {
      if (confirm(`Hapus playlist "${playlist.name}"?`)) { state.playlists = (await remove(`/api/playlists/${playlist.id}`)).items; renderView(); }
    }));
    row.append(symbol, copy, controls); target.append(row);
    if (state.expandedPlaylist === playlist.id) {
      const contents = node('div', 'playlist-items');
      if (!playlist.items.length) contents.append(node('p', 'player-caption', 'Playlist kosong. Tambah URL atau simpan media melalui tombol playlist pada kartu media.'));
      playlist.items.forEach((item, index) => {
        const entry = node('div', 'playlist-item');
        const move = async (offset) => { const items = [...playlist.items]; [items[index], items[index + offset]] = [items[index + offset], items[index]]; await savePlaylist(playlist, items); };
        const up = action('Naikkan urutan', 'up', () => move(-1)); up.disabled = index === 0;
        const down = action('Turunkan urutan', 'down', () => move(1)); down.disabled = index === playlist.items.length - 1;
        entry.append(node('span', '', String(index + 1).padStart(2, '0')), node('strong', '', labelFor(item)), action('Putar tayangan', 'play', () => playMedia(item)), up, down, action('Hapus dari playlist', 'x', () => savePlaylist(playlist, playlist.items.filter((_, i) => i !== index)))); contents.append(entry);
      }); target.append(contents);
    }
  });
}
async function loadJellyfin(query = '') {
  if (!state.info.providers.jellyfin) return renderLibrary();
  $('#view-content').replaceChildren(emptyState('film', 'Mengambil koleksi…', 'Menghubungkan ke server Jellyfin milikmu.'));
  try { state.jellyfinItems = (await api(`/api/jellyfin/search?q=${encodeURIComponent(query)}`)).items; if (state.view === 'jellyfin') renderLibrary(); } catch (error) { toast(error.message, true); }
}
async function browseSeries(item) {
  const actionName = item.type === 'Series' ? 'seasons' : 'episodes';
  const seriesId = item.type === 'Series' ? item.id : item.seriesId;
  const params = new URLSearchParams({ id: seriesId || item.id });
  if (item.type === 'Season') params.set('season', item.id);
  state.jellyfinItems = (await api(`/api/jellyfin/${actionName}?${params}`)).items.map((entry) => ({ ...entry, seriesId, type: item.type === 'Series' ? 'Season' : 'Episode' }));
  state.jellyfinLabel = item.title; renderView();
}
function openSchedule(item) {
  const section = node('form'); const label = node('label', '', 'Mulai tayangan pada');
  const input = node('input'); input.type = 'datetime-local'; input.required = true;
  const later = new Date(Date.now() + 10 * 60000); input.value = new Date(later.getTime() - later.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const submit = node('button', 'button primary modal-submit', 'Simpan jadwal'); submit.type = 'submit';
  section.append(node('p', '', labelFor(item)), label, input, node('p', 'modal-note', 'Jadwal perlu dibuat ulang setelah server restart. Saat jadwal mulai, buka tayangan dari halaman Jadwal.'), submit);
  section.addEventListener('submit', async (event) => {
    event.preventDefault(); submit.disabled = true;
    try { await post('/api/schedules', { media: item, timestamp: new Date(input.value).getTime() / 1000 }); state.schedules = (await api('/api/schedules')).items; $('#info-dialog').close(); toast('Jadwal tayangan disimpan.'); } catch (error) { toast(error.message, true); } finally { submit.disabled = false; }
  });
  infoDialog('Jadwalkan tayangan', section);
}
function renderSchedules() {
  const target = $('#view-content'); target.replaceChildren(); $('#result-count').textContent = `${state.schedules.length} jadwal`;
  state.schedules.forEach((schedule) => {
    const row = node('div', 'schedule-row'); const copy = node('div', 'row-copy');
    copy.append(node('h3', '', schedule.title), node('p', '', `${new Date(schedule.timestamp * 1000).toLocaleString('id-ID')} · ${{ scheduled: 'Terjadwal', started: 'Dimulai', cancelled: 'Dibatalkan', error: 'Gagal memulai' }[schedule.state] || schedule.state}`));
    row.append(icon('calendar'), copy);
    if (schedule.session_id) row.append(action('Buka tayangan', 'play', () => watchSession(schedule.session_id)));
    row.append(action('Hapus jadwal', 'x', async () => { await remove(`/api/schedules/${schedule.id}`); state.schedules = (await api('/api/schedules')).items; renderSchedules(); })); target.append(row);
  });
  if (!state.schedules.length) target.append(emptyState('calendar', 'Ada yang ingin kamu tonton nanti?', 'Gunakan ikon kalender di kartu media untuk menjadwalkan tayangan hingga 7 hari ke depan. Server harus tetap berjalan.'));
  if (state.info.providers.tvheadend) {
    const heading = node('h3', '', 'Cari acara di EPG TVheadend'); const form = node('form', 'epg-search'); const input = node('input'); input.type = 'search'; input.placeholder = 'Judul acara…'; input.required = true;
    const submit = node('button', 'button secondary', 'Cari EPG'); submit.type = 'submit'; form.append(input, submit);
    const results = node('div', 'epg-results');
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); submit.disabled = true;
      try { const data = await api(`/api/epg?q=${encodeURIComponent(input.value)}`); results.replaceChildren();
        data.items.forEach((event) => {
          const row = node('div', 'schedule-row'); const copy = node('div', 'row-copy'); copy.append(node('h3', '', event.title), node('p', '', `${event.channel} · ${new Date(event.start * 1000).toLocaleString('id-ID')}`));
          row.append(copy, action(event.start > Date.now() / 1000 ? 'Jadwalkan acara' : 'Putar channel', event.start > Date.now() / 1000 ? 'calendar' : 'play', async () => {
            if (event.start > Date.now() / 1000) { await post('/api/schedules', { media: event, timestamp: event.start }); await refreshData(); toast('Acara dijadwalkan.'); } else await playMedia(event);
          })); results.append(row);
        }); if (!data.items.length) results.append(node('p', 'view-notice', 'Tidak ada acara yang cocok.'));
      } catch (error) { toast(error.message, true); } finally { submit.disabled = false; }
    }); target.append(heading, form, results);
  }
}

function detachPlayer() {
  clearInterval(state.poll); state.poll = null; clearInterval(state.heartbeat); clearTimeout(state.reconnect);
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  if (state.socket) { state.socket.onclose = null; state.socket.close(); state.socket = null; }
  state.attached = null; state.remoteState = null; video.pause(); video.removeAttribute('src'); video.load();
}
function resetPlayer() {
  $('#player-idle').hidden = false; video.hidden = true; $('#player-loading').hidden = true; $('#player-error').hidden = true;
  $('#now-title').textContent = 'Belum ada tayangan'; $('#now-source').textContent = 'Player siap untuk media favoritmu'; $('#player-badge').textContent = 'SIAP MEMUTAR';
  $('#share-stream').disabled = true; $('#stop-stream').disabled = true;
}
async function stopCurrent(deleteSession = true) {
  const key = state.current?.id; state.current = null; detachPlayer();
  $('#stop-stream').disabled = true;
  if (key && deleteSession) await remove(`/api/sessions/${key}`);
  resetPlayer();
}
function playerError(message) {
  $('#player-loading').hidden = true; $('#player-idle').hidden = true; $('#player-error').hidden = false;
  $('#player-error-message').textContent = message; $('#player-badge').textContent = 'TERPUTUS'; $('#retry-stream').hidden = !state.descriptor;
}
async function playMedia(item) {
  if (!item || state.playingRequest) return;
  state.playingRequest = true;
  try {
    await stopCurrent(); state.descriptor = item;
    navigate('home'); $('#watch-area').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#player-idle').hidden = true; $('#player-loading').hidden = false; $('#loading-message').textContent = 'Menghubungkan ke sumber media…';
    const session = await post('/api/sessions', item);
    state.current = session; await watchSession(session.id, item);
  } catch (error) { playerError(error.message); } finally { state.playingRequest = false; }
}
async function watchSession(id, descriptor = null) {
  detachPlayer(); state.descriptor = descriptor; navigate('home');
  state.current = await api(`/api/sessions/${id}`);
  $('#stop-stream').disabled = false; $('#share-stream').disabled = false;
  $('#player-idle').hidden = true; $('#player-error').hidden = true; $('#player-loading').hidden = true;
  updateSession(state.current);
  state.poll = setInterval(async () => {
    try {
      const session = await api(`/api/sessions/${id}`);
      if (state.current?.id !== id) return;
      state.current = session; updateSession(session);
    } catch (error) { if (state.current?.id === id) { clearInterval(state.poll); playerError(error.message); } }
  }, 1200);
}
function updateSession(session) {
  $('#now-title').textContent = session.title;
  $('#now-source').textContent = `${kindLabel(session)}${session.metadata.width ? ` · ${session.metadata.width} × ${session.metadata.height}` : ''}${session.live ? ' · LIVE' : ''}`;
  if (session.state === 'error') { playerError(session.error); return; }
  if (!session.manifest) {
    $('#player-loading').hidden = false; $('#player-badge').textContent = 'MENGHUBUNGKAN';
    $('#loading-message').textContent = session.state === 'preparing' ? 'Mengambil sumber dan metadata. VOD perlu diunduh dahulu…' : 'FFmpeg sedang menyiapkan segmen video pertama…'; return;
  }
  if (state.attached !== session.id) attachVideo(session);
  $('#player-badge').textContent = session.live ? 'LIVE STREAM' : video.paused ? 'JEDA / SIAP PLAY' : 'SEDANG MEMUTAR';
}
function attachVideo(session) {
  state.attached = session.id; video.hidden = false; $('#player-loading').hidden = true; $('#player-error').hidden = true;
  let recoveries = 0;
  if (Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 25, backBufferLength: 30, liveSyncDurationCount: 3, enableWorker: true }); state.hls = hls;
    hls.loadSource(session.manifest); hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => toast('Tayangan siap. Tekan play untuk mulai menonton.')));
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal || state.attached !== session.id) return;
      if (recoveries++ < 3 && data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (recoveries < 3 && data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else playerError('Player tidak dapat membaca video. Coba mulai ulang tayangan atau periksa sumber media.');
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = session.manifest; video.play().catch(() => toast('Tayangan siap. Tekan play untuk mulai menonton.'));
  } else { playerError('Browser ini belum mendukung pemutaran HLS. Gunakan Chrome, Firefox, Edge, atau Safari terbaru.'); }
  if ($('#sync-toggle').checked) connectSync();
}
const clientId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
function connectSync() {
  if (!state.current || !$('#sync-toggle').checked || state.socket) return;
  const id = state.current.id;
  const url = new URL(`/api/sessions/${id}/sync`, location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url); state.socket = socket;
  socket.onmessage = (event) => {
    try { const data = JSON.parse(event.data); if (data.type === 'welcome') { sendSync(); } else if (!data.error && data.sender !== clientId && Number.isFinite(data.position)) { state.remoteState = data; applyRemoteSync(); } } catch { /* Ignore malformed network data. */ }
  };
  socket.onclose = () => {
    state.socket = null; clearInterval(state.heartbeat);
    if (state.current?.id === id && $('#sync-toggle').checked) state.reconnect = setTimeout(connectSync, 2500);
  };
  socket.onopen = () => {
    clearInterval(state.heartbeat);
    state.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'heartbeat' })); }, 20000);
  };
}
function applyRemoteSync() {
  const remote = state.remoteState;
  if (!remote || video.readyState < 1 || !$('#sync-toggle').checked) return;
  state.applyingSync = true;
  let position = remote.position + (remote.playing ? Math.max(0, Date.now() / 1000 - remote.updated_at) : 0);
  if (video.seekable.length) position = Math.min(Math.max(position, video.seekable.start(0)), video.seekable.end(video.seekable.length - 1) - 0.1);
  if (Math.abs(video.currentTime - position) > 1.5 && position >= 0) video.currentTime = position;
  if (remote.playing) video.play().catch(() => {}); else video.pause();
  setTimeout(() => { state.applyingSync = false; }, 500);
}
function sendSync() {
  if (!state.applyingSync && $('#sync-toggle').checked && state.socket?.readyState === WebSocket.OPEN && state.attached) state.socket.send(JSON.stringify({ position: video.currentTime, playing: !video.paused, sender: clientId }));
}

hydrateIcons();
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const submit = $('#login-form button[type=submit]'); submit.disabled = true; $('#login-error').textContent = '';
  try { await post('/api/login', { password: $('#password').value }); $('#password').value = ''; await showWorkspace(); } catch (error) { $('#login-error').textContent = error.message; } finally { submit.disabled = false; }
});
$('#toggle-password').addEventListener('click', () => { const input = $('#password'); input.type = input.type === 'password' ? 'text' : 'password'; $('#toggle-password').setAttribute('aria-label', input.type === 'password' ? 'Tampilkan password' : 'Sembunyikan password'); });
$$('[data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
['#open-stream', '#hero-play', '#idle-open'].forEach((selector) => $(selector).addEventListener('click', () => openStream()));
$('#queue-add').addEventListener('click', () => openStream('queue'));
$('#clear-queue').addEventListener('click', () => { state.queue = []; storeQueue(); });
$('#refresh-button').addEventListener('click', () => refreshData().catch((error) => toast(error.message, true)));
$('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('click', (event) => { if (!event.target.closest('#sidebar, #mobile-menu')) $('#sidebar').classList.remove('open'); });
$('#help-button').addEventListener('click', showHelp);
$('#credits-button').addEventListener('click', showCredits);
$('#server-info').addEventListener('click', () => showServerInfo().catch((error) => toast(error.message, true)));
$('#logout').addEventListener('click', async () => { try { await post('/api/logout', {}); state.queue = []; storeQueue(); showLogin(); } catch (error) { toast(error.message, true); } });
$$('[data-provider]').forEach((button) => button.addEventListener('click', () => {
  const provider = button.dataset.provider;
  if (provider === 'iptv') { navigate(state.channels.length ? 'live' : 'sources'); if (!state.sources.length) openSource(); }
  else if (provider === 'jellyfin') navigate('jellyfin');
  else { openStream(); $('#stream-url').placeholder = provider === 'twitch' ? 'https://www.twitch.tv/…' : 'https://www.youtube.com/watch?v=…'; }
}));
$('#stream-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('#stream-form-error').textContent = ''; const submit = $('#stream-submit'); submit.disabled = true;
  const item = { kind: 'url', url: $('#stream-url').value.trim(), title: $('#stream-title').value.trim() };
  try {
    const url = new URL(item.url); if (!['http:', 'https:', 'rtsp:', 'rtsps:', 'rtmp:', 'rtmps:'].includes(url.protocol)) throw new Error('Gunakan URL media HTTP(S), RTSP, atau RTMP.');
    const playlist = state.playlists.find((entry) => entry.id === $('#stream-playlist').value);
    if (streamMode === 'save' && !playlist) throw new Error('Pilih playlist tujuan.');
    if (playlist) { await savePlaylist(playlist, [...playlist.items, item]); toast('Disimpan ke playlist.'); }
    $('#stream-dialog').close();
    if (streamMode === 'queue') enqueue(item); else if (streamMode === 'play') await playMedia(item);
  } catch (error) { $('#stream-form-error').textContent = error.message || 'URL tidak valid.'; } finally { submit.disabled = false; }
});
$('#source-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const submit = $('#source-form button[type=submit]'); submit.disabled = true; $('#source-form-error').textContent = '';
  try { await post('/api/sources', { name: $('#source-name').value.trim(), url: $('#source-url').value.trim() }); $('#source-dialog').close(); await refreshData(); toast('Sumber IPTV berhasil dihubungkan.'); } catch (error) { $('#source-form-error').textContent = error.message; } finally { submit.disabled = false; }
});
$('#library-action').addEventListener('click', () => {
  if (['sources', 'live'].includes(state.view)) openSource(); else if (state.view === 'playlists') newPlaylist(); else if (state.view === 'jellyfin') loadJellyfin($('#library-search').value); else $('#file-upload').click();
});
$$('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; state.limit = 24; renderLibrary(); }));
let searchTimer;
$('#library-search').addEventListener('input', () => { clearTimeout(searchTimer); state.limit = 24; if (state.view === 'jellyfin') searchTimer = setTimeout(() => loadJellyfin($('#library-search').value), 350); else renderLibrary(); });
$('#file-upload').addEventListener('change', async () => {
  const file = $('#file-upload').files[0]; if (!file) return;
  if (file.size > state.info.limits.upload_mb * 1024 * 1024) { toast(`Maksimum upload ${state.info.limits.upload_mb} MB.`, true); $('#file-upload').value = ''; return; }
  const form = new FormData(); form.append('file', file);
  const notice = node('div', 'upload-progress'); const spinner = node('span', 'spinner'); notice.append(spinner, node('span', '', `Mengunggah ${file.name}…`)); $('#view-content').prepend(notice);
  try { await api('/api/library/upload', { method: 'POST', body: form }); await refreshData(); toast('Media berhasil diunggah.'); } catch (error) { toast(error.message, true); } finally { notice.remove(); $('#file-upload').value = ''; }
});
$('#stop-stream').addEventListener('click', () => stopCurrent().catch((error) => toast(error.message, true)));
$('#retry-stream').addEventListener('click', () => { if (state.descriptor) playMedia(state.descriptor); });
$('#share-stream').addEventListener('click', async () => {
  if (!state.current) return;
  const link = new URL(`/watch/${state.current.id}`, location.href).href;
  try { await navigator.clipboard.writeText(link); toast('Link ruang disalin. Penonton memerlukan password server.'); } catch { const section = node('p', '', link); infoDialog('Link ruang tontonan', section); }
});
$('#sync-toggle').addEventListener('change', () => {
  if ($('#sync-toggle').checked) { connectSync(); toast('Sinkronisasi ruang aktif. Play, pause, dan seek dibagikan.'); }
  else { clearTimeout(state.reconnect); clearInterval(state.heartbeat); if (state.socket) { state.socket.onclose = null; state.socket.close(); state.socket = null; } }
});
['play', 'pause', 'seeked'].forEach((event) => video.addEventListener(event, sendSync));
video.addEventListener('loadedmetadata', applyRemoteSync);
video.addEventListener('ended', () => { if (state.queue.length) { const next = state.queue.shift(); storeQueue(); playMedia(next); } });
video.addEventListener('error', () => { if (state.attached && video.error) playerError('Video tidak dapat diputar. Periksa koneksi atau mulai ulang tayangan.'); });
setInterval(async () => {
  if (!state.authenticated) return;
  try {
    await api('/healthz'); $('#connection-status').classList.remove('offline'); $('#connection-status').lastChild.textContent = 'Server terhubung';
    if (state.view === 'schedules') { state.schedules = (await api('/api/schedules')).items; renderSchedules(); }
  } catch { $('#connection-status').classList.add('offline'); $('#connection-status').lastChild.textContent = 'Koneksi terputus'; }
}, 15000);
(async () => {
  try { const data = await api('/api/info'); if (data.authenticated) await showWorkspace(); else showLogin(); }
  catch (error) { $('#boot').replaceChildren(icon('alert'), node('span', '', error.message)); }
})();
