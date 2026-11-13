import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, symlink, readFile, writeFile, open, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadSettings, ROOT } from '../src/config.js';
import { Catalog } from '../src/services/catalog.js';
import { MediaManager } from '../src/media/manager.js';
import { output, spawnTracked, terminate, children } from '../src/media/processes.js';
import { testSettings, fixture, listenFixture, waitFor, login, client } from './helpers.js';

const nodeProcess = (args, env, options = {}) => {
  const child = spawn(process.execPath, args, { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  child.logs = ''; child.stdout.on('data', (data) => { child.logs += data; }); child.stderr.on('data', (data) => { child.logs += data; }); return child;
};
async function exited(child, signal = 'SIGTERM') {
  const exit = once(child, 'exit'); child.kill(signal);
  const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
  try { const [code] = await exit; assert.equal(code, 0, child.logs); } finally { clearTimeout(timer); }
}
test('binary path overrides resolve against app root, bare executable names remain PATH lookups', () => {
  const settings = loadSettings({ FFMPEG_PATH: './bin/ffmpeg', FFPROBE_PATH: 'ffprobe', YTDLP_PATH: 'bin/yt-dlp' }, '/home/container');
  assert.equal(settings.ffmpeg, '/home/container/bin/ffmpeg'); assert.equal(settings.ffprobe, 'ffprobe'); assert.equal(settings.ytdlp, '/home/container/bin/yt-dlp');
});
test('Node preflight succeeds with a PATH containing NO python/pip (approved standalone utility only)', { timeout: 20000 }, async (t) => {
  const settings = await testSettings(t), isolated = path.join(settings.dataDir, 'node-only-bin'); await mkdir(isolated);
  await symlink(process.execPath, path.join(isolated, 'node'));
  // Locate configured test executables without invoking any interpreter.
  const resolve = async (name) => {
    if (name.includes('/')) return name;
    for (const directory of process.env.PATH.split(path.delimiter)) { try { const filename = path.join(directory, name); if ((await stat(filename)).isFile()) return filename; } catch { /* next */ } }
    throw new Error(`Tool unavailable for real test: ${name}`);
  };
  for (const [name, filename] of [['ffmpeg', settings.ffmpeg], ['ffprobe', settings.ffprobe], ['yt-dlp', settings.ytdlp]]) await symlink(await resolve(filename), path.join(isolated, name));
  assert.deepEqual((await readdir(isolated)).sort(), ['ffmpeg', 'ffprobe', 'node', 'yt-dlp']);
  const env = { ...settings.env, PATH: isolated, FFMPEG_PATH: 'ffmpeg', FFPROBE_PATH: 'ffprobe', YTDLP_PATH: 'yt-dlp' };
  const child = nodeProcess([path.join(ROOT, 'src/index.js'), '--check'], env, { cwd: settings.dataDir });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, child.logs); assert.match(child.logs, /AAC\/HLS\/FFprobe OK/); assert.match(child.logs, /yt-dlp=\d{4}/);
});
test('Pterodactyl-like direct Node startup uses SERVER_PORT, accepts proxy Host, and SIGINT exits cleanly', { timeout: 20000 }, async (t) => {
  const settings = await testSettings(t), env = { ...settings.env, SERVER_PORT: String(settings.port), PORT: '' };
  const child = nodeProcess(['src/index.js'], env);
  try {
    await waitFor(() => child.logs.includes('666 Streaming siap'), 15000);
    const response = await fetch(`http://127.0.0.1:${settings.port}/healthz`, { headers: { Host: `${settings.port}-wings.e2b.app` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).version, '2.0.0');
    await exited(child, 'SIGINT'); assert.match(child.logs, /shutdown bersih/);
  } finally { if (child.exitCode === null && child.signalCode === null) await exited(child); }
});
test('SIGTERM during real yt-dlp metadata request reaps extractor; no Python application child exists', { timeout: 25000 }, async (t) => {
  const settings = await testSettings(t), child = nodeProcess(['src/index.js'], settings.env);
  const { url } = await listenFixture(t, () => {});
  try {
    await waitFor(() => child.logs.includes('666 Streaming siap'), 15000);
    const base = `http://127.0.0.1:${settings.port}`, api = client(base, await login(base));
    assert.equal((await api('/api/sessions', { method: 'POST', data: { kind: 'url', url: `${url}/watch` } })).status, 201);
    const pids = await waitFor(async () => {
      const value = (await readFile(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8')).trim(); return value ? value.split(/\s+/).map(Number) : false;
    });
    const command = (await readFile(`/proc/${pids[0]}/cmdline`)).toString(); assert.doesNotMatch(command, /(?:^|\0)(?:python\d*|pip)(?:\0|$)/);
    await exited(child);
    for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally { if (child.exitCode === null && child.signalCode === null) await exited(child); }
});
test('TERM→KILL covers a stubborn grandchild even when its group leader exits first', { timeout: 10000 }, async () => {
  const program = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)`;
  const child = spawnTracked(process.execPath, ['-e', program]); child.stderr.resume();
  const [data] = await once(child.stdout, 'data'), grandchild = Number(String(data).trim());
  try {
    await new Promise((resolve) => setTimeout(resolve, 100)); await terminate(child);
    await waitFor(async () => {
      try { const status = await readFile(`/proc/${grandchild}/status`, 'utf8'); return /^State:\s+Z/m.test(status); } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return true; throw error; }
    }, 2000);
  } finally { try { process.kill(grandchild, 'SIGKILL'); } catch { /* already exited */ } await terminate(child); }
  assert.equal(children.size, 0);
});
test('cache cap stops active real encoding; prune/close never deletes source media', async (t) => {
  const settings = await testSettings(t), catalog = await Catalog.open(settings), manager = new MediaManager(settings, catalog); await manager.start();
  try {
    const file = await fixture(settings, path.join(settings.mediaDir, 'keep.mp4'), { seconds: 12 });
    const session = await manager.create({ kind: 'local', path: 'keep.mp4' }); await waitFor(() => session.state === 'playing');
    const excess = await open(path.join(session.directory, 'large.cache'), 'w'); await excess.truncate(33 * 1024 * 1024); await excess.close();
    await manager.pruneOnce(); assert.equal(session.state, 'error'); assert.match(session.error, /cache/); assert.equal(children.size, 0); assert.ok(await stat(file));
    await manager.close(); assert.ok(await stat(file));
  } finally { await manager.close(); await catalog.close(); }
});
test('startup cleanup only removes generated hex cache directories, not other data', async (t) => {
  const settings = await testSettings(t), catalog = await Catalog.open(settings), manager = new MediaManager(settings, catalog);
  await mkdir(path.join(settings.cacheDir, 'a'.repeat(32))); await writeFile(path.join(settings.cacheDir, 'keep.txt'), 'keep'); await mkdir(path.join(settings.cacheDir, 'not-our-session'));
  try { await manager.start(); await assert.rejects(() => stat(path.join(settings.cacheDir, 'a'.repeat(32)))); assert.equal(await readFile(path.join(settings.cacheDir, 'keep.txt'), 'utf8'), 'keep'); assert.ok(await stat(path.join(settings.cacheDir, 'not-our-session'))); }
  finally { await manager.close(); await catalog.close(); }
});
test('check mode fails honestly when extractor is absent rather than reporting all providers ready', async (t) => {
  const settings = await testSettings(t); const child = nodeProcess(['src/index.js', '--check'], { ...settings.env, YTDLP_PATH: '/nonexistent/standalone-yt-dlp' });
  const [code] = await once(child, 'exit'); assert.equal(code, 1); assert.match(child.logs, /UNAVAILABLE/); assert.doesNotMatch(child.logs, /Python traceback|Traceback/);
});
test('check mode rejects missing ffmpeg before opening any port', async (t) => {
  const settings = await testSettings(t);
  await assert.rejects(() => output(process.execPath, ['src/index.js', '--check'], { timeout: 10000, cwd: ROOT, env: { ...settings.env, FFMPEG_PATH: '/nonexistent/ffmpeg' } }));
});
