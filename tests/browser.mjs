// End-to-end tests against the real built UI and FFmpeg. No mocked API/media.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium as playwright } from 'playwright-core';
import chromium, { inflate } from '@sparticuz/chromium';

const root = fileURLToPath(new URL('../', import.meta.url));
const binaries = [process.env.FFMPEG_PATH || 'ffmpeg', process.env.FFPROBE_PATH || 'ffprobe'];
for (const binary of binaries) execFileSync(binary, ['-version'], { stdio: 'pipe' });
const directory = await mkdtemp(path.join(tmpdir(), '666-streaming-e2e-'));
const password = randomBytes(24).toString('hex');
const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening'); const port = portServer.address().port; await new Promise((resolve) => portServer.close(resolve));
const url = `http://127.0.0.1:${port}`;
// Controlled Jellyfin API, but actual video bytes/FFmpeg/browser playback.
// In particular the episodes call MUST use seriesId + SeasonId, not seasonId
// as the series route (an old frontend compatibility bug).
let jellyfinMedia;
const providerErrors = [], providerKey = randomBytes(18).toString('hex');
const provider = createHttpServer(async (request, response) => {
  try {
    const target = new URL(request.url, 'http://fixture');
    const json = (value) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    if (target.pathname.startsWith('/Videos/')) {
      assert.equal(target.searchParams.get('api_key'), providerKey);
      response.setHeader('Content-Type', 'video/mp4'); response.setHeader('Content-Length', (await stat(jellyfinMedia)).size); createReadStream(jellyfinMedia).pipe(response); return;
    }
    assert.equal(request.headers.authorization, 'MediaBrowser Token="' + providerKey + '"');
    if (target.pathname === '/Users') return json([{ Id: 'user1' }]);
    if (target.pathname === '/Items') return json({ Items: [{ Id: 'series1', Name: 'Integration Series', Type: 'Series' }] });
    if (target.pathname === '/Shows/series1/Seasons') return json({ Items: [{ Id: 'season1', Name: 'Season One', IndexNumber: 1 }] });
    if (target.pathname === '/Shows/series1/Episodes') {
      assert.equal(target.searchParams.get('SeasonId'), 'season1'); return json({ Items: [{ Id: 'episode1', Name: 'Integration Episode', Type: 'Episode', SeriesName: 'Integration Series', ParentIndexNumber: 1, IndexNumber: 1 }] });
    }
    if (target.pathname === '/Items/episode1/PlaybackInfo') { request.resume(); return json({ MediaSources: [{ DirectStreamUrl: '/Videos/episode1/stream.mp4' }] }); }
    throw new Error('Unexpected Jellyfin fixture endpoint: ' + target.pathname);
  } catch (error) { providerErrors.push(error.message); response.writeHead(500); response.end(); }
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const providerUrl = 'http://127.0.0.1:' + provider.address().port;

const env = { ...process.env, DATA_DIR: directory, MEDIA_DIR: path.join(directory, 'media'), PORT: String(port), APP_PASSWORD: password, COOKIE_SECURE: 'false', DISCORD_BOT_TOKEN: '', DISCORD_TOKEN: '', JELLYFIN_URL: providerUrl, JELLYFIN_API_KEY: providerKey, TVHEADEND_URL: '', TVHEADEND_USER: '', TVHEADEND_PASS: '', FFMPEG_PATH: binaries[0], FFPROBE_PATH: binaries[1], VIDEO_ENCODER: 'libx264', STREAM_RESOLUTION: '320:180', STREAM_FPS: '15', STREAM_VIDEO_BITRATE: '400k' };
const server = spawn(process.execPath, ['src/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', (data) => { logs = (logs + data).slice(-10000); }); server.stderr.on('data', (data) => { logs = (logs + data).slice(-10000); });
let browser;
const errors = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server startup timeout: ${logs}`)), 20000);
    const ready = (data) => { if (String(data).includes('666 Streaming siap')) { clearTimeout(timer); resolve(); } };
    server.stdout.on('data', ready); server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${logs}`)); });
  });
  // The npm browser package includes NSS/NSPR for minimal Linux runners.
  if (process.platform === 'linux') await inflate(path.join(root, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
  const args = chromium.args.filter((arg) => !['--disable-web-security', '--single-process'].includes(arg));
  browser = await playwright.launch({ executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(), args: [...args, '--autoplay-policy=no-user-gesture-required'], env: { ...process.env, LD_LIBRARY_PATH: `${tmpdir()}/al2023/lib:${tmpdir()}:${process.env.LD_LIBRARY_PATH || ''}` }, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  async function login(page, route = '/') {
    await page.goto(url + route);
    await page.locator('#password').fill(password);
    await page.locator('.login-submit').click();
    await page.locator('#app-shell').waitFor({ state: 'visible' });
  }
  await login(page);
  await page.locator('#result-count').filter({ hasText: '0 media' }).waitFor();
  assert.equal(await page.title(), '666 Streaming — Your private screen');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mkdir(path.join(root, 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'artifacts/dashboard.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(root, 'artifacts/mobile.png'), fullPage: true });
  await page.locator('#mobile-menu').click();
  await page.locator('.sidebar [data-view="playlists"]').click();
  await page.locator('#library-action').click();
  await page.locator('#text-input').fill('Integration playlist');
  await page.locator('#text-form button[type=submit]').click();
  await page.locator('.playlist-row').filter({ hasText: 'Integration playlist' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Generate a test pattern outside MEDIA_DIR, then upload through the real UI.
  const fixture = path.join(directory, 'integration-fixture.mp4');
  execFileSync(binaries[0], ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '24', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', fixture]);
  jellyfinMedia = fixture;
  await page.locator('.sidebar [data-view="local"]').click();
  await page.locator('#file-upload').setInputFiles(fixture);
  await page.locator('.media-card').filter({ hasText: 'integration-fixture' }).waitFor();
  await page.locator('.media-card [aria-label="Simpan ke playlist"]').click();
  await page.locator('#info-content .button').filter({ hasText: 'Integration playlist' }).click();
  await page.locator('.media-card [aria-label="Tambah ke antrean"]').click();
  await page.locator('.media-card .media-art').click();
  await page.waitForFunction(() => { const video = document.querySelector('#video'); return video.currentTime > 0.3 && video.videoWidth === 320 && !video.paused; }, null, { timeout: 45000 });
  console.log('PASS: login, desktop/mobile layout, playlist creation/save, upload, real HLS video playback.');
  const session = (await (await context.request.get(`${url}/api/sessions`)).json()).items[0];
  assert.ok(session.manifest && session.metadata.has_audio && session.metadata.has_video);
  const manifestResponse = await context.request.get(url + session.manifest); assert.equal(manifestResponse.status(), 200); assert.match(await manifestResponse.text(), /seg\d+\.ts/);
  const anonymous = await browser.newContext(); assert.equal((await anonymous.request.get(url + session.manifest)).status(), 401); await anonymous.close();
  await page.locator('#sync-toggle').check();
  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const second = await secondContext.newPage(); second.on('pageerror', (error) => errors.push(error.message));
  await login(second, `/watch/${session.id}`);
  await second.waitForFunction(() => document.querySelector('#video').currentTime > 0);
  await second.locator('#sync-toggle').check();
  await page.waitForTimeout(700);
  await page.locator('#video').evaluate((video) => video.pause());
  await second.waitForFunction(() => document.querySelector('#video').paused, null, { timeout: 10000 });
  await page.locator('#video').evaluate((video) => { video.currentTime = 1; });
  await second.waitForFunction(() => Math.abs(document.querySelector('#video').currentTime - 1) < 1.5, null, { timeout: 10000 });
  console.log('PASS: authenticated shared room, real WebSocket pause/seek synchronization.');
  await secondContext.close();
  await page.locator('#stop-stream').click();
  await page.locator('#now-title').filter({ hasText: 'Belum ada tayangan' }).waitFor();
  assert.equal((await (await context.request.get(`${url}/api/sessions`)).json()).items.length, 0);
  // Actual bad network source: the HTTP server is up, but this path is a 404.
  await page.locator('#open-stream').click(); await page.locator('#stream-url').fill(`${url}/missing.mp4`); await page.locator('#stream-submit').click();
  await page.locator('#player-error').waitFor({ state: 'visible', timeout: 40000 });
  assert.equal((await context.request.get(`${url}/healthz`)).status(), 200);
  assert.equal((await (await context.request.get(`${url}/api/playlists`)).json()).items[0].items.length, 1);
  await page.locator('#stop-stream').click();
  console.log('PASS: stop cleanup, protected manifests, real 404 notification without server crash.');
  await page.locator('.sidebar [data-view="jellyfin"]').click();
  await page.locator('.media-card').filter({ hasText: 'Integration Series' }).locator('.media-art').click();
  await page.locator('.media-card').filter({ hasText: 'Season One' }).locator('.media-art').click();
  await page.locator('.media-card').filter({ hasText: 'Integration Episode' }).locator('.media-art').click();
  await page.waitForFunction(() => { const video = document.querySelector('#video'); return video.currentTime > 0.3 && video.videoWidth === 320 && !video.paused; }, null, { timeout: 45000 });
  await page.locator('#stop-stream').click();
  await page.locator('#now-title').filter({ hasText: 'Belum ada tayangan' }).waitFor();
  assert.deepEqual(providerErrors, []);
  console.log('PASS: Jellyfin series → season → episode UI uses correct API IDs and decodes actual video (controlled service).');
  assert.deepEqual(errors, []);
  // Keep an active FFmpeg process during shutdown and verify it is reaped.
  const active = await context.request.post(`${url}/api/sessions`, { data: { kind: 'local', path: 'integration-fixture.mp4' } });
  const key = (await active.json()).id;
  await page.waitForFunction(async (key) => { const result = await fetch(`/api/sessions/${key}`).then((r) => r.json()); return result.state === 'playing'; }, key, { timeout: 45000 });
  const children = execFileSync('ps', ['-o', 'pid=', '--ppid', String(server.pid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean).map(Number);
  const shutdownSocket = await context.newPage();
  await shutdownSocket.goto(url + `/watch/${key}`);
  await shutdownSocket.locator('#sync-toggle').check();
  const exited = once(server, 'exit'); server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 15000);
  const [code] = await exited; clearTimeout(timeout);
  assert.equal(code, 0, logs);
  await browser.close(); browser = null;
  for (const pid of children) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  console.log('PASS: SIGTERM exits cleanly with active FFmpeg; no orphan child processes.');
} catch (error) {
  console.error(logs); throw error;
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
  provider.closeAllConnections(); await new Promise((resolve) => provider.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
