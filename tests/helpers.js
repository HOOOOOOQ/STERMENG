import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer as netServer } from 'node:net';
import { createServer } from 'node:http';
import { loadSettings, prepareSettings } from '../src/config.js';
import { output } from '../src/media/processes.js';

export async function availablePort() {
  const server = netServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve)); return port;
}
export async function temporary(t, prefix = '666-node-test-') {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true })); return directory;
}
export async function testSettings(t, override = {}) {
  const directory = await temporary(t);
  const env = { ...process.env, DATA_DIR: directory, MEDIA_DIR: path.join(directory, 'media'), HOST: '0.0.0.0', PORT: String(await availablePort()), SERVER_PORT: '', APP_PASSWORD: 'private-test-password-only', COOKIE_SECURE: 'false', STREAM_QUALITY: '720p', STREAM_RESOLUTION: '320:180', STREAM_FPS: '15', STREAM_VIDEO_BITRATE: '400k', VIDEO_ENCODER: 'libx264', STREAM_AV_SYNC_MS: '0', FFMPEG_THREADS: '1', MAX_CACHE_MB: '32', MAX_UPLOAD_MB: '1', MAX_DOWNLOAD_MB: '32', DISCORD_BOT_TOKEN: '', DISCORD_TOKEN: '', ALLOWED_USER_IDS: '', OPERATOR_USER_IDS: '', DISCORD_GUILD_IDS: '', JELLYFIN_URL: '', JELLYFIN_API_KEY: '', TVHEADEND_URL: '', TVHEADEND_USER: '', TVHEADEND_PASS: '', PUBLIC_URL: '', ...override };
  return prepareSettings(loadSettings(env));
}
export async function fixture(settings, filename, { audioOnly = false, videoOnly = false, seconds = 5 } = {}) {
  await mkdir(path.dirname(filename), { recursive: true });
  const args = ['-hide_banner', '-v', 'error', '-nostdin', '-y'];
  if (!audioOnly) args.push('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15');
  if (!videoOnly) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000');
  args.push('-t', String(seconds), '-threads', '1');
  if (!audioOnly) args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (!videoOnly) args.push('-c:a', 'aac');
  if (['.mp4', '.m4a', '.mov'].includes(path.extname(filename))) args.push('-movflags', '+faststart');
  args.push(filename);
  await output(settings.ffmpeg, args); return filename;
}
export async function listenFixture(t, handler) {
  const server = createServer((request, response) => { Promise.resolve(handler(request, response)).catch(() => { response.statusCode = 500; response.end(); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
export async function waitFor(operation, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = await operation(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('Test condition timeout');
}
export async function login(base, password = 'private-test-password-only') {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  if (response.status !== 200) throw new Error(`Login failed: ${response.status}`);
  return response.headers.get('set-cookie').split(';', 1)[0];
}
export function client(base, cookie) {
  return async (endpoint, { method = 'GET', data, headers = {}, body } = {}) => fetch(`${base}${endpoint}`, { method, headers: { Cookie: cookie, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: data === undefined ? body : JSON.stringify(data) });
}
