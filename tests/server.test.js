import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdir, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApplication } from '../src/server.js';
import { ROOT } from '../src/config.js';
import { children } from '../src/media/processes.js';
import { temporary, testSettings, fixture, login, client, waitFor, listenFixture } from './helpers.js';

async function wsConnect(url, cookie, origin) {
  const socket = new WebSocket(url.replace(/^http/, 'ws'), { headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) } });
  const welcome = once(socket, 'message'); await once(socket, 'open'); await welcome; return socket;
}
test('real Node HTTP API / authenticated media / WS / upload contracts', { timeout: 60000 }, async (t) => {
  const directory = await temporary(t), hidden = path.join(directory, '.hidden-data');
  const settings = await testSettings(t, { DATA_DIR: hidden, MEDIA_DIR: path.join(hidden, 'media') });
  settings.root = path.join(directory, '.hidden-application'); await mkdir(settings.root);
  await cp(path.join(ROOT, 'public'), path.join(settings.root, 'public'), { recursive: true });
  await writeFile(path.join(settings.root, 'public/.env'), 'PRIVATE-FIXTURE');
  const application = await createApplication(settings);
  await application.start({ discord: false }); const base = `http://127.0.0.1:${settings.port}`, cookie = await login(base), api = client(base, cookie);
  try {
    await t.test('health, public info and authenticated runtime identify Node, not Python', async () => {
      assert.equal((await (await fetch(`${base}/healthz`)).json()).app, '666 Streaming');
      assert.deepEqual(Object.keys(await (await fetch(`${base}/api/info`)).json()).sort(), ['app', 'authenticated', 'version']);
      const info = await (await api('/api/info')).json(); assert.equal(info.runtime.node, process.versions.node); assert.equal(info.discord.video, 'web-player-only'); assert.equal(info.discord.state, 'disabled');
      const preview = await fetch(`${base}/healthz`, { headers: { Host: '8080-real-sandbox.e2b.app' } }); assert.equal(preview.status, 200);
    });
    await t.test('API requires auth, rejects cross-origin writes/invalid JSON and does not leak credentials', async () => {
      for (const endpoint of ['/api/library', '/api/channels', '/api/playlists', '/api/sessions', `/media/${'a'.repeat(32)}/index.m3u8`]) assert.equal((await fetch(base + endpoint)).status, 401);
      assert.equal((await api('/api/playlists', { method: 'POST', data: { name: 'Denied' }, headers: { Origin: 'https://attacker.invalid' } })).status, 403);
      assert.equal((await api('/api/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
      assert.equal((await api('/api/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"name":"${'x'.repeat(140000)}"}` })).status, 413);
      assert.equal((await api('/api/playlists', { method: 'POST', data: [] })).status, 400);
      assert.equal((await api('/api/playlists', { method: 'POST', body: 'no json' })).status, 400);
      const response = await api('/api/library'); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    });
    await t.test('playlist CRUD validates descriptors, persists and refuses missing playlists', async () => {
      let response = await api('/api/playlists', { method: 'POST', data: { name: 'Persistent' } }); assert.equal(response.status, 200);
      const playlist = (await response.json()).items[0];
      response = await api(`/api/playlists/${playlist.id}`, { method: 'PATCH', data: { items: [{ kind: 'url', title: 'URL', url: 'https://provider.invalid/video.mp4' }] } }); assert.equal(response.status, 200);
      assert.equal(JSON.parse(await readFile(path.join(settings.dataDir, 'playlists.json'), 'utf8'))[0].items.length, 1);
      assert.equal((await api(`/api/playlists/${playlist.id}`, { method: 'PATCH', data: { items: Array(501).fill({}) } })).status, 400);
      assert.equal((await api(`/api/playlists/${playlist.id}`, { method: 'PATCH', data: { items: [{ kind: 'url', url: 'file:///etc/passwd' }] } })).status, 400);
      assert.equal((await api('/api/playlists/missing', { method: 'DELETE' })).status, 404);
      assert.equal((await api(`/api/playlists/${playlist.id}`, { method: 'DELETE' })).status, 200);
    });
    const input = await fixture(settings, path.join(settings.dataDir, 'upload.mp4'), { seconds: 8 });
    await t.test('actual multipart upload is private, appears in library, and concurrent names never clobber', async () => {
      const bytes = await readFile(input);
      const upload = async () => { const form = new FormData(); form.append('file', new Blob([bytes]), 'uploaded.mp4'); const response = await api('/api/library/upload', { method: 'POST', body: form }); assert.equal(response.status, 201, await response.clone().text()); return response.json(); };
      const files = await Promise.all([upload(), upload()]); assert.notEqual(files[0].path, files[1].path);
      for (const item of files) { assert.equal(item.size, bytes.length); assert.equal((await stat(path.join(settings.mediaDir, item.path))).mode & 0o777, 0o600); }
      assert.equal((await (await api('/api/library')).json()).items.length, 2);
    });
    await t.test('unsupported, empty, multiple and oversized uploads fail and remove temporary files', async () => {
      for (const [name, bytes, expected] of [['bad.exe', Buffer.from('bad'), 400], ['empty.mp4', Buffer.alloc(0), 400], ['large.mp4', Buffer.alloc(1024 * 1024 + 1), 413]]) {
        const form = new FormData(); form.append('file', new Blob([bytes]), name); assert.equal((await api('/api/library/upload', { method: 'POST', body: form })).status, expected);
      }
      const form = new FormData(); form.append('file', new Blob(['one']), 'one.mp4'); form.append('file', new Blob(['two']), 'two.mp4');
      assert.equal((await api('/api/library/upload', { method: 'POST', body: form })).status, 400);
      assert.equal((await readdir(settings.mediaDir)).some((name) => name.startsWith('.upload-')), false);
    });
    await t.test('sources use real M3U HTTP parsing, toggle/delete persist and public results hide upstream URLs', async () => {
      const { url } = await listenFixture(t, (_request, response) => response.end('#EXTM3U\n#EXTINF:-1,Channel\nhttp://user:password@provider.invalid/live?secret=1\n'));
      assert.equal((await api('/api/sources', { method: 'POST', data: { name: 'Private', url: `${url}/list.m3u` } })).status, 200);
      const list = await (await api('/api/channels?refresh=1')).json(); assert.equal(list.items.length, 1); assert.doesNotMatch(JSON.stringify(list), /password|secret|127\.0\.0\.1/);
      assert.equal((await api('/api/sources/0', { method: 'PATCH', data: { enabled: false } })).status, 200); assert.equal((await (await api('/api/channels')).json()).items.length, 0);
      assert.equal((await api('/api/sources/0', { method: 'PATCH', data: { enabled: 'true' } })).status, 400);
      assert.equal((await api('/api/tvheadend', { method: 'PATCH', data: { enabled: false } })).status, 200);
      assert.equal((await api('/api/sources/0', { method: 'DELETE' })).status, 200); assert.equal((await api('/api/sources/0', { method: 'DELETE' })).status, 404);
    });
    let session;
    await t.test('real session produces protected manifest/segments; invalid paths cannot read filesystem', async () => {
      let response = await api('/api/sessions', { method: 'POST', data: { kind: 'local', path: 'uploaded.mp4' } }); assert.equal(response.status, 201); session = application.media.get((await response.json()).id);
      await waitFor(() => session.state === 'playing');
      response = await api(session.public().manifest); assert.equal(response.status, 200); assert.match(await response.text(), /seg\d+\.ts/);
      assert.equal((await fetch(base + session.public().manifest)).status, 401);
      assert.equal((await api(`/media/${session.id}/source.mp4`)).status, 404);
      assert.equal((await api('/api/sessions', { method: 'POST', data: { kind: 'local', path: '../upload.mp4' } })).status, 400);
      assert.equal((await api('/api/sessions', { method: 'POST', data: { kind: 'bridge', source: '/etc/passwd' } })).status, 400);
      assert.equal((await api('/api/sessions/missing')).status, 404);
    });
    await t.test('authenticated WS broadcasts validated pause/seek, closes on session stop; anonymous/origin rejected', async () => {
      const endpoint = `${base}/api/sessions/${session.id}/sync`;
      const one = await wsConnect(endpoint, cookie, base), two = await wsConnect(endpoint, cookie, base);
      try {
        const message = once(two, 'message'); one.send(JSON.stringify({ position: 2.5, playing: false, sender: 'test' }));
        const [raw] = await message; const value = JSON.parse(raw); assert.equal(value.position, 2.5); assert.equal(value.playing, false);
        const invalid = once(one, 'message'); one.send(JSON.stringify({ position: -1, playing: 'true', sender: 'bad' }));
        // one receives the earlier valid broadcast first if its event is buffered;
        // install invalid listener after allowing the frame to be consumed.
        let result = JSON.parse((await invalid)[0]);
        if (!result.error) result = JSON.parse((await once(one, 'message'))[0]); assert.match(result.error, /valid/);
        for (const [token, origin, expected] of [['', base, 401], [cookie, 'https://evil.invalid', 403]]) {
          const socket = new WebSocket(endpoint.replace(/^http/, 'ws'), { headers: { Cookie: token, Origin: origin } });
          const response = await new Promise((resolve, reject) => { socket.once('unexpected-response', (_request, response) => { resolve(response.statusCode); response.resume(); socket.terminate(); }); socket.on('error', () => {}); socket.once('open', () => reject(new Error('Unauthorized WS opened'))); });
          assert.equal(response, expected);
        }
        const closed = once(two, 'close'); await api(`/api/sessions/${session.id}`, { method: 'DELETE' }); await closed;
        assert.equal(application.media.sessions.size, 0); assert.equal(children.size, 0);
      } finally { one.terminate(); two.terminate(); }
    });
    await t.test('schedules/API provider absence, logout and static branding are explicit', async () => {
      assert.equal((await api('/api/jellyfin/search?q=movie')).status, 422); assert.equal((await api('/api/epg?q=news')).status, 422);
      assert.equal((await api('/api/schedules', { method: 'POST', data: { media: { kind: 'local', path: 'uploaded.mp4' }, timestamp: 0 } })).status, 400);
      const response = await api('/api/schedules', { method: 'POST', data: { media: { kind: 'local', path: 'uploaded.mp4' }, timestamp: Date.now() / 1000 + 100 } }); assert.equal(response.status, 201);
      await api(`/api/schedules/${(await response.json()).id}`, { method: 'DELETE' }); assert.equal(application.media.schedules.size, 0);
      const index = await fetch(base); assert.equal(index.status, 200); assert.match(await index.text(), /666 Streaming/);
      assert.equal((await fetch(`${base}/watch/${'a'.repeat(32)}`)).status, 200);
      assert.equal((await fetch(`${base}/static/logo.svg`)).status, 200);
      const dotfile = await fetch(`${base}/static/.env`); assert.ok([403, 404].includes(dotfile.status)); assert.doesNotMatch(await dotfile.text(), /PRIVATE-FIXTURE/);
      const logout = await api('/api/logout', { method: 'POST', data: {} }); assert.equal(logout.status, 200); assert.equal((await api('/api/library')).status, 401);
    });
  } finally { await application.close(); await application.close(); }
  assert.equal(children.size, 0);
});
