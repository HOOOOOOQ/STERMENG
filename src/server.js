import express from 'express';
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { stat, link, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import Busboy from 'busboy';
import { WebSocketServer, WebSocket } from 'ws';
import { APP_NAME, VERSION, MEDIA_EXTENSIONS } from './config.js';
import { Auth, COOKIE, checkOrigin, cookies } from './security.js';
import { PlaylistStore } from './storage.js';
import { HttpError, MediaError, objectBody, requiredText } from './errors.js';
import { Catalog } from './services/catalog.js';
import { MediaManager, sessionId } from './media/manager.js';
import { preflight } from './media/ffmpeg.js';
import { checkExtractor } from './media/extractor.js';
import { closeChildren } from './media/processes.js';
import { log } from './log.js';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
function isProtected(url) { return (url.startsWith('/api/') || url.startsWith('/media/')) && !['/api/info', '/api/login'].includes(url); }
function requireId(value, label = 'media') { if (typeof value !== 'string' || !/^[a-zA-Z0-9]{1,128}$/.test(value)) throw new TypeError(`ID ${label} tidak valid.`); return value; }
function sourceIndex(request, catalog) { if (!/^\d+$/.test(request.params.index)) throw new HttpError(404, 'Sumber tidak ditemukan.'); const index = Number(request.params.index); if (!catalog.sources.sources[index]) throw new HttpError(404, 'Sumber tidak ditemukan.'); return index; }

async function receiveUpload(request, settings) {
  if (!request.is('multipart/form-data')) throw new TypeError('Gunakan multipart/form-data.');
  const temporary = path.join(settings.mediaDir, `.upload-${sessionId()}`);
  let filename, size = 0, problem, writing, count = 0;
  const controller = new AbortController();
  const aborted = () => controller.abort();
  request.once('aborted', aborted);
  const parser = Busboy({ headers: request.headers, limits: { fileSize: settings.maxUploadMb * 1024 * 1024, files: 1, fields: 0, parts: 2, headerPairs: 100 } });
  try {
    const parsed = new Promise((resolve, reject) => {
      parser.on('file', (name, file, info) => {
        count++;
        filename = path.posix.basename(info.filename.replaceAll('\\', '/'));
        if (name !== 'file' || !filename || !MEDIA_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
          problem = new TypeError('Pilih file media yang didukung pada field file.'); file.resume(); return;
        }
        file.on('data', (chunk) => { size += chunk.length; });
        file.on('limit', () => { problem = new HttpError(413, 'File melampaui MAX_UPLOAD_MB server.'); });
        writing = pipeline(file, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal: controller.signal }).catch((error) => { problem ||= error; });
      });
      parser.once('filesLimit', () => { problem = new TypeError('Unggah satu file setiap permintaan.'); });
      parser.once('fieldsLimit', () => { problem = new TypeError('Hanya field file yang diperbolehkan.'); });
      parser.once('partsLimit', () => { problem = new TypeError('Unggah satu file setiap permintaan.'); });
      parser.once('error', reject); parser.once('close', resolve);
      request.once('error', reject);
      request.once('aborted', () => { parser.destroy(); reject(new HttpError(400, 'Upload dibatalkan.')); });
      request.pipe(parser);
    });
    await parsed; await writing;
    if (problem) throw problem;
    if (count !== 1 || !filename || !size) throw new TypeError('Pilih file media yang tidak kosong.');
    const extension = path.extname(filename).toLowerCase();
    const stem = path.parse(filename).name.replace(/[^\p{L}\p{N}_ .-]/gu, '_').slice(0, 100).replace(/^[ .]+|[ .]+$/g, '') || 'media';
    let target;
    for (let attempt = 0; attempt < 5; attempt++) {
      target = `${stem}${attempt ? `-${sessionId().slice(0, 8)}` : ''}${extension}`;
      try { await link(temporary, path.join(settings.mediaDir, target)); break; }
      catch (error) { if (error.code !== 'EEXIST' || attempt === 4) throw error; }
    }
    return { kind: 'local', path: target, title: path.parse(target).name, size };
  } finally {
    controller.abort(); request.removeListener('aborted', aborted);
    await writing; await rm(temporary, { force: true });
  }
}
export async function createApplication(settings) {
  const auth = await Auth.create(settings.password, settings.dataDir);
  const catalog = await Catalog.open(settings);
  const media = new MediaManager(settings, catalog);
  const playlists = await PlaylistStore.open(path.join(settings.dataDir, 'playlists.json'));
  const runtime = { discord: 'disabled' };
  const app = express(); app.disable('x-powered-by'); app.disable('etag');
  const server = createServer(app);
  server.requestTimeout = 600000; server.headersTimeout = 20000; server.keepAliveTimeout = 5000; server.maxRequestsPerSocket = 1000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const state = { settings, auth, catalog, media, playlists, runtime, app, server, wss, closing: false, activeUploads: 0 };
  const requestController = new AbortController();
  app.use((request, response, next) => {
    response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CSP });
    if (request.path.startsWith('/api/') || request.path.startsWith('/media/')) response.set('Cache-Control', 'private, no-store');
    try {
      if (state.closing) throw new HttpError(503, 'Server sedang shutdown.');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkOrigin(request);
      if (isProtected(request.path) && !auth.authenticated(request)) throw new HttpError(401, 'Silakan masuk untuk mengakses media.');
      next();
    } catch (error) { next(error); }
  });
  app.use(express.json({ limit: '128kb', strict: true }));
  app.use((request, _response, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(request.method) && request.path !== '/api/library/upload') {
      try { if (!request.is('application/json')) throw new TypeError('Gunakan Content-Type: application/json.'); objectBody(request.body); }
      catch (error) { next(error); return; }
    }
    next();
  });
  app.get('/healthz', (_request, response) => response.json({ status: 'ok', app: APP_NAME, version: VERSION }));
  app.get('/api/info', (request, response) => {
    const authenticated = auth.authenticated(request);
    response.json({ app: APP_NAME, version: VERSION, authenticated, ...(authenticated ? { runtime, providers: { jellyfin: Boolean(catalog.jellyfin), tvheadend: Boolean(catalog.tvh), iptv: catalog.sources.sources.length }, limits: { streams: settings.maxStreams, upload_mb: settings.maxUploadMb }, discord: { configured: Boolean(settings.env.DISCORD_BOT_TOKEN), state: runtime.discord, video: 'web-player-only' } } : {}) });
  });
  app.post('/api/login', async (request, response) => {
    const token = await auth.login(requiredText(request.body, 'password', 1024), request.socket.remoteAddress || 'unknown');
    response.cookie(COOKIE, token, { maxAge: 86400000, httpOnly: true, sameSite: 'strict', secure: settings.cookieSecure, path: '/' }).json({ ok: true });
  });
  app.post('/api/logout', (request, response) => { auth.revoke(cookies(request)[COOKIE]); response.clearCookie(COOKIE, { path: '/' }).json({ ok: true }); });
  app.get('/api/library', async (_request, response) => response.json({ items: await catalog.localFiles() }));
  app.post('/api/library/upload', async (request, response) => {
    if (state.activeUploads >= 3) throw new HttpError(429, 'Upload sedang penuh. Tunggu unggahan lain selesai.');
    state.activeUploads++;
    try { response.status(201).json(await receiveUpload(request, settings)); } finally { state.activeUploads--; }
  });
  app.get('/api/channels', async (request, response) => response.json(await catalog.channelList(request.query.refresh === '1', { signal: requestController.signal })));
  app.route('/api/sources').get((_request, response) => response.json({ items: catalog.sourceList(), tvheadend_enabled: catalog.sources.tvhEnabled }))
    .post(async (request, response) => { await catalog.addSource(requiredText(request.body, 'name', 80), requiredText(request.body, 'url', 8192), { signal: requestController.signal }); response.json({ items: catalog.sourceList(), tvheadend_enabled: catalog.sources.tvhEnabled }); });
  app.route('/api/sources/:index').patch(async (request, response) => { await catalog.sources.setEnabled(sourceIndex(request, catalog), request.body.enabled); catalog.invalidate(); response.json({ items: catalog.sourceList() }); })
    .delete(async (request, response) => { await catalog.sources.remove(sourceIndex(request, catalog)); catalog.invalidate(); response.json({ items: catalog.sourceList() }); });
  app.patch('/api/tvheadend', async (request, response) => { await catalog.sources.setTvhEnabled(request.body.enabled); catalog.invalidate(); response.json({ ok: true }); });
  app.get('/api/jellyfin/:action', async (request, response) => {
    if (!catalog.jellyfin) throw new MediaError('Atur JELLYFIN_URL dan JELLYFIN_API_KEY di environment server terlebih dahulu.');
    const { action } = request.params; let items;
    const options = catalog.options(requestController.signal);
    if (action === 'seasons') items = await catalog.jellyfin.getSeasons(requireId(request.query.id, 'Jellyfin'), options);
    else if (action === 'episodes') items = await catalog.jellyfin.getEpisodes(requireId(request.query.id, 'Jellyfin'), request.query.season ? requireId(request.query.season, 'season') : '', options);
    else if (action === 'search') items = await catalog.jellyfin.search(String(request.query.q || '').trim().slice(0, 200), options);
    else throw new HttpError(404, 'Endpoint Jellyfin tidak ditemukan.');
    response.json({ items: items.map((item) => ({ id: item.Id, title: item.Name || 'Media', kind: 'jellyfin', type: item.Type || 'Episode', year: item.ProductionYear, series: item.SeriesName || '' })) });
  });
  app.get('/api/epg', async (request, response) => {
    if (!catalog.tvh || !catalog.sources.tvhEnabled) throw new MediaError('TVheadend belum dikonfigurasi atau dinonaktifkan.');
    const events = await catalog.tvh.getEpgEvents(String(request.query.q || '').slice(0, 200), 100, catalog.options(requestController.signal));
    await catalog.channelList(false, { signal: requestController.signal });
    const ids = new Map([...catalog.channels].filter(([, channel]) => channel.uuid).map(([id, channel]) => [channel.uuid, id]));
    response.json({ items: events.filter((event) => ids.has(event.channelUuid)).map((event) => ({ title: event.title || 'Programme', start: event.start, stop: event.stop, id: ids.get(event.channelUuid), kind: 'channel', channel: event.channelName || '' })) });
  });
  app.route('/api/playlists').get((_request, response) => response.json({ items: playlists.playlists }))
    .post(async (request, response) => {
      const name = requiredText(request.body, 'name', 80);
      await playlists.update((next) => { if (next.length >= 100) throw new RangeError('Maksimum 100 playlist.'); next.push({ id: sessionId(), name, items: [] }); });
      response.json({ items: playlists.playlists });
    });
  const changePlaylist = async (request, response) => {
    let items;
    if (request.method !== 'DELETE' && 'items' in request.body) {
      if (!Array.isArray(request.body.items) || request.body.items.length > 500) throw new RangeError('Maksimum 500 item per playlist.');
      items = await Promise.all(request.body.items.map((item) => catalog.validateDescriptor(item)));
    }
    await playlists.update((next) => {
      const index = next.findIndex((entry) => entry.id === request.params.id);
      if (index < 0) throw new HttpError(404, 'Playlist tidak ditemukan.');
      if (request.method === 'DELETE') next.splice(index, 1);
      else { if ('name' in request.body) next[index].name = requiredText(request.body, 'name', 80); if (items) next[index].items = items; }
    });
    response.json({ items: playlists.playlists });
  };
  app.route('/api/playlists/:id').patch(changePlaylist).delete(changePlaylist);
  app.route('/api/sessions').get((_request, response) => response.json({ items: [...media.sessions.values()].map((session) => session.public()) }))
    .post(async (request, response) => response.status(201).json((await media.create(request.body)).public()));
  app.route('/api/sessions/:id').get((request, response) => response.json(media.get(request.params.id).public()))
    .delete(async (request, response) => { await media.stop(request.params.id); response.json({ ok: true }); });
  app.route('/api/schedules').get((_request, response) => response.json({ items: [...media.schedules.values()] }))
    .post(async (request, response) => response.status(201).json(await media.schedule(request.body.media, request.body.timestamp)));
  app.delete('/api/schedules/:id', (request, response) => { media.cancelSchedule(request.params.id); response.json({ ok: true }); });
  app.get('/media/:id/:filename', async (request, response) => {
    const session = media.get(request.params.id), filename = request.params.filename;
    if (!/^(?:index\.m3u8|seg[0-9]{6,}\.ts)$/.test(filename)) throw new HttpError(404, 'File tidak ditemukan.');
    const file = path.join(session.directory, filename);
    try { if (!(await stat(file)).isFile()) throw new Error(); } catch { throw new HttpError(404, 'Segmen belum tersedia.'); }
    response.type(filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    response.sendFile(filename, { root: session.directory, dotfiles: 'deny' });
  });
  const publicDir = path.join(settings.root, 'public');
  app.use('/static', express.static(publicDir, { dotfiles: 'deny', index: false, redirect: false, fallthrough: true, maxAge: 0 }));
  const index = async (_request, response) => {
    const file = path.join(publicDir, 'index.html');
    try { await stat(file); } catch { throw new HttpError(503, 'Aset web belum dibuild. Jalankan npm ci && npm run build.'); }
    // Fixed filename within an explicit root: a hidden ancestor of the install
    // directory must not make Express reject the page as a requested dotfile.
    response.set('Cache-Control', 'no-cache').sendFile('index.html', { root: publicDir, dotfiles: 'deny' });
  };
  app.get('/', index);
  app.get('/watch/:id', (request, response, next) => { if (!/^[a-f0-9]{32}$/.test(request.params.id)) { next(); return; } return index(request, response); });
  app.use((_request, _response, next) => next(new HttpError(404, 'Endpoint tidak ditemukan.')));
  app.use((error, request, response, _next) => {
    if (response.headersSent) { response.destroy(); return; }
    let status = 502, message = 'Layanan tidak dapat dihubungi. Coba lagi.';
    if (error instanceof HttpError) { status = error.status; message = error.message; }
    else if (error instanceof MediaError) { status = 422; message = error.message; }
    else if (error.type === 'entity.too.large') { status = 413; message = 'JSON terlalu besar.'; }
    else if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON tidak valid.'; }
    else if (error instanceof TypeError || error instanceof RangeError) { status = 400; message = error.message; }
    else log.error(`API failure: ${request.method} ${request.path} (${error.name || 'Error'})`);
    response.status(status).json({ error: message });
  });
  server.on('upgrade', (request, socket, head) => {
    try {
      if (state.closing) throw new HttpError(503, 'Server sedang shutdown.');
      checkOrigin(request);
      if (!auth.authenticated(request)) throw new HttpError(401, 'Silakan masuk untuk mengakses media.');
      const match = /^\/api\/sessions\/([a-f0-9]{32})\/sync$/.exec(new URL(request.url, 'http://server').pathname);
      if (!match) throw new HttpError(404, 'Ruang tidak ditemukan.');
      const session = media.get(match[1]);
      if (session.sockets.size >= 30) throw new HttpError(429, 'Ruang tontonan penuh.');
      wss.handleUpgrade(request, socket, head, (peer) => connectRoom(peer, request, session, auth));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 400;
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    }
  });
  state.start = async ({ discord = true } = {}) => {
    requestController.signal.throwIfAborted();
    Object.assign(runtime, await preflight(settings, { signal: requestController.signal }));
    try { runtime.ytdlp = await checkExtractor(settings, { signal: requestController.signal }); }
    catch (error) { requestController.signal.throwIfAborted(); runtime.ytdlp = false; log.warn(error.message); }
    requestController.signal.throwIfAborted();
    await media.start(); requestController.signal.throwIfAborted(); catalog.start();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(settings.port, settings.host, () => { server.removeListener('error', reject); resolve(); }); });
    requestController.signal.throwIfAborted();
    if (settings.env.DISCORD_TOKEN) log.warn('DISCORD_TOKEN diabaikan. Hanya DISCORD_BOT_TOKEN aplikasi resmi didukung.');
    if (discord && settings.env.DISCORD_BOT_TOKEN?.trim()) {
      try {
        const { StreamingBot } = await import('./discord/bot.js');
        requestController.signal.throwIfAborted();
        state.bot = new StreamingBot(state);
        state.botTask = state.bot.start().catch(() => { if (!state.closing) { runtime.discord = 'error'; log.error('Koneksi Discord gagal. Periksa token bot/intents; player web tetap berjalan.'); } });
      } catch (error) { requestController.signal.throwIfAborted(); runtime.discord = 'error'; log.error(`Bot tidak dapat disiapkan: ${error.message}`); }
    }
    return state;
  };
  state.close = () => {
    if (state.closeTask) return state.closeTask;
    state.closing = true;
    state.closeTask = (async () => {
      requestController.abort();
      const httpClosed = new Promise((resolve) => { if (server.listening) server.close(resolve); else resolve(); });
      const force = setTimeout(() => server.closeAllConnections(), 10000); force.unref();
      for (const peer of wss.clients) peer.terminate();
      const cleanup = await Promise.allSettled([state.bot?.close(), catalog.close(), media.close()]);
      await closeChildren();
      await httpClosed; clearTimeout(force);
      await new Promise((resolve) => wss.close(resolve));
      if (cleanup.some((result) => result.status === 'rejected')) throw new MediaError('Sebagian cleanup gagal; periksa akses data dan log host.');
    })();
    return state.closeTask;
  };
  return state;
}
function connectRoom(peer, request, session, auth) {
  peer.on('error', () => {});
  session.sockets.add(peer); let alive = true, messages = 0;
  peer.send(JSON.stringify(session.sockets.size === 1 ? { type: 'welcome', empty: true } : session.sync));
  const timer = setInterval(() => {
    messages = 0;
    if (!alive || !auth.authenticated(request)) { peer.terminate(); return; }
    alive = false; peer.ping();
  }, 20000); timer.unref();
  peer.on('pong', () => { alive = true; });
  peer.on('message', (raw, binary) => {
    if (!auth.authenticated(request)) { peer.close(1008, 'Login expired'); return; }
    if (++messages > 200) { peer.close(1008, 'Rate limit'); return; }
    try {
      if (binary) throw new Error();
      const data = JSON.parse(raw.toString());
      session.touched = Date.now();
      if (data?.type === 'heartbeat') return;
      if (typeof data?.position !== 'number' || !Number.isFinite(data.position) || data.position < 0 || data.position > 21600 || typeof data.playing !== 'boolean' || typeof data.sender !== 'string') throw new Error();
      session.sync = { position: data.position, playing: data.playing, sender: data.sender.slice(0, 80), updated_at: Date.now() / 1000 };
      const text = JSON.stringify(session.sync);
      for (const socket of session.sockets) if (socket.readyState === WebSocket.OPEN) { if (socket.bufferedAmount > 65536) socket.terminate(); else socket.send(text); }
    } catch { if (peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ error: 'Data sinkronisasi tidak valid.' })); }
  });
  peer.once('close', () => { clearInterval(timer); session.sockets.delete(peer); });
}
