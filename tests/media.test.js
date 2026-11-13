// Real FFmpeg/FFprobe and HTTP input: no simulated stream or success payload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat, symlink, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Catalog } from '../src/services/catalog.js';
import { MediaManager, MediaSession } from '../src/media/manager.js';
import { output, children, spawnTracked, terminate } from '../src/media/processes.js';
import { preflight, probe, hlsCommand } from '../src/media/ffmpeg.js';
import { assertStandalone, checkExtractor, extract, chooseLiveSource } from '../src/media/extractor.js';
import { testSettings, fixture, waitFor, listenFixture } from './helpers.js';

async function setup(t, overrides = {}) {
  const settings = await testSettings(t, overrides), catalog = await Catalog.open(settings), manager = new MediaManager(settings, catalog);
  await manager.start(); t.after(async () => { await catalog.close(); await manager.close(); });
  return { settings, catalog, manager };
}
test('real preflight encodes video/AAC, writes HLS and reads it using BOTH utilities', async (t) => {
  const { settings } = await setup(t);
  const result = await preflight(settings); assert.equal(result.encoder, 'libx264'); assert.equal(result.ffprobe, true); assert.equal(result.ffmpeg, true);
  assert.equal((await readdir(settings.cacheDir)).filter((name) => name.startsWith('preflight-')).length, 0); assert.equal(children.size, 0);
});
test('preflight clearly rejects missing binaries and invalid hardware encoder', async (t) => {
  const { settings } = await setup(t);
  await assert.rejects(() => preflight({ ...settings, ffmpeg: '/nonexistent/666-ffmpeg' }), /tidak tersedia/);
  await assert.rejects(() => preflight({ ...settings, encoder: 'encoder_nonexistent' }), /Encoder/);
});
for (const [name, options, video, audio] of [['video-audio.mp4', {}, true, true], ['audio-only.m4a', { audioOnly: true }, false, true], ['video-only.mp4', { videoOnly: true }, true, false]]) {
  test(`real local → HLS → decoded media: ${name}`, async (t) => {
    const { settings, manager } = await setup(t);
    const file = await fixture(settings, path.join(settings.mediaDir, name), options);
    const input = await probe(settings, file, false); assert.equal(input.has_video, video); assert.equal(input.has_audio, audio);
    const session = await manager.create({ kind: 'local', path: name });
    await session.task; assert.equal(session.state, 'ended', session.error);
    const manifest = path.join(session.directory, 'index.m3u8'); assert.match(await readFile(manifest, 'utf8'), /#EXT-X-ENDLIST/);
    const media = await probe(settings, manifest, false); assert.equal(media.has_video, video); assert.equal(media.has_audio, audio);
    await output(settings.ffmpeg, ['-v', 'error', '-i', manifest, '-t', '0.2', '-f', 'null', '-']);
    await manager.stop(session.id); await assert.rejects(() => stat(session.directory), { code: 'ENOENT' }); assert.equal(manager.sessions.size, 0); assert.equal(children.size, 0);
  });
}
test('real HTTP HLS input fetches playlist AND .ts, then generates playable HLS again', async (t) => {
  const { settings, manager } = await setup(t), upstream = path.join(settings.dataDir, 'upstream'); await mkdir(upstream);
  const input = await fixture(settings, path.join(settings.dataDir, 'input.mp4'));
  await output(settings.ffmpeg, ['-v', 'error', '-i', input, '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', path.join(upstream, 'index.m3u8')]);
  const requests = [];
  const { url } = await listenFixture(t, async (request, response) => {
    requests.push(request.url); const filename = path.join(upstream, path.basename(request.url));
    try { response.setHeader('Content-Length', (await stat(filename)).size); createReadStream(filename).pipe(response); }
    catch { response.writeHead(404); response.end(); }
  });
  const session = await manager.create({ kind: 'url', url: `${url}/index.m3u8`, title: 'HTTP HLS' });
  await session.task; assert.equal(session.state, 'ended', session.error);
  assert.ok(requests.some((name) => name.endsWith('.m3u8'))); assert.ok(requests.some((name) => name.endsWith('.ts')));
  const media = await probe(settings, path.join(session.directory, 'index.m3u8'), false); assert.equal(media.has_video, true); assert.equal(media.has_audio, true);
});
test('IPTV channel uses stored URL for actual video, not a synthetic placeholder', async (t) => {
  const { settings, catalog, manager } = await setup(t), input = await fixture(settings, path.join(settings.dataDir, 'live.mp4'));
  const { url } = await listenFixture(t, (request, response) => { assert.equal(request.url, '/channel.mp4'); createReadStream(input).pipe(response); });
  await catalog.sources.add('Fixture IPTV', `${url}/list.m3u`, [{ name: 'Controlled channel', stream_url: `${url}/channel.mp4` }]);
  const descriptor = (await catalog.channelList()).items[0], session = await manager.create(descriptor);
  await session.task; assert.equal(session.state, 'ended', session.error); assert.equal(session.live, true); assert.ok(session.public().manifest);
});
test('actual 404 and invalid media become safe errors, not success, and do not kill manager', async (t) => {
  const { settings, manager } = await setup(t);
  const { url } = await listenFixture(t, (_request, response) => { response.writeHead(404); response.end('source-secret'); });
  const session = await manager.create({ kind: 'url', url: `${url}/private.mp4?token=secret` }); await session.task;
  assert.equal(session.state, 'error'); assert.doesNotMatch(session.error, /secret|token|127\.0\.0\.1/); assert.equal(session.public().manifest, null);
  await writeFile(path.join(settings.mediaDir, 'bad.mp4'), 'not-media');
  const invalid = await manager.create({ kind: 'local', path: 'bad.mp4' }); await invalid.task; assert.equal(invalid.state, 'error');
});
test('stopping during slow HTTP probe cancels its actual process; close is idempotent', async (t) => {
  const { manager } = await setup(t);
  const { url } = await listenFixture(t, () => {});
  const session = await manager.create({ kind: 'url', url: `${url}/slow.mp4` });
  await waitFor(() => children.size > 0);
  await manager.stop(session.id); assert.equal(children.size, 0); assert.equal(session.state, 'stopped');
  await manager.close(); await manager.close(); await assert.rejects(() => manager.create({ kind: 'url', url: `${url}/slow.mp4` }), /shutdown/);
});
test('concurrent sessions enforce slot cap and stop reaps active FFmpeg', async (t) => {
  const { settings, manager } = await setup(t, { MAX_STREAMS: '1' });
  await fixture(settings, path.join(settings.mediaDir, 'long.mp4'), { seconds: 12 });
  const result = await Promise.allSettled([manager.create({ kind: 'local', path: 'long.mp4' }), manager.create({ kind: 'local', path: 'long.mp4' })]);
  assert.equal(result.filter((entry) => entry.status === 'fulfilled').length, 1); assert.equal(result.filter((entry) => entry.status === 'rejected').length, 1);
  const session = result.find((entry) => entry.status === 'fulfilled').value;
  await waitFor(() => session.state === 'playing'); const pid = session.process.pid;
  await manager.stop(session.id); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }); assert.equal(manager.sessions.size, 0);
});
test('idle expiry removes only generated cache; local path confinement rejects escaping symlinks', async (t) => {
  const { settings, catalog, manager } = await setup(t);
  await fixture(settings, path.join(settings.mediaDir, 'keep.mp4'), { seconds: 1 });
  const outside = path.join(settings.dataDir, 'outside.mp4'); await writeFile(outside, 'outside'); await symlink(outside, path.join(settings.mediaDir, 'escape.mp4'));
  await assert.rejects(() => catalog.localPath('escape.mp4'), /luar/); await assert.rejects(() => catalog.localPath('../outside.mp4'), /luar/);
  assert.deepEqual((await catalog.localFiles()).map((item) => item.path), ['keep.mp4']);
  const session = await manager.create({ kind: 'local', path: 'keep.mp4' }); await session.task;
  session.touched = Date.now() - 10000000; await manager.pruneOnce(); assert.equal(manager.sessions.size, 0); assert.ok(await stat(path.join(settings.mediaDir, 'keep.mp4')));
});
test('scheduled real media starts; invalid horizons and cancellation are explicit', async (t) => {
  const { settings, manager } = await setup(t);
  await fixture(settings, path.join(settings.mediaDir, 'scheduled.mp4'), { seconds: 1 });
  const descriptor = { kind: 'local', path: 'scheduled.mp4' };
  for (const time of [NaN, Infinity, 0, Date.now() / 1000 + 604900]) await assert.rejects(() => manager.schedule(descriptor, time));
  const entry = await manager.schedule(descriptor, Date.now() / 1000 + 0.1); await waitFor(() => entry.state === 'started');
  const session = manager.sessions.get(entry.session_id); await session.task; assert.equal(session.state, 'ended');
  const cancel = await manager.schedule(descriptor, Date.now() / 1000 + 100); manager.cancelSchedule(cancel.id); assert.equal(manager.schedules.has(cancel.id), false);
});
test('command generation respects quality, threads, A/V offset and selected encoder', async (t) => {
  const { settings } = await setup(t), session = new MediaSession('a'.repeat(32), { kind: 'url' }, settings.cacheDir);
  const args = hlsCommand({ ...settings, avSyncMs: -120 }, session, 'https://provider.invalid/live', true);
  assert.ok(args.includes('aresample=async=1:first_pts=0,asetpts=PTS-(-0.12)/TB')); assert.equal(args.includes('-reconnect'), true); assert.ok(args.includes('1'));
  const vaapi = hlsCommand({ ...settings, encoder: 'h264_vaapi' }, session, '/local.mp4', false); assert.equal(vaapi[0], '-hide_banner'); assert.ok(vaapi.includes('-vaapi_device')); assert.ok(vaapi.some((entry) => entry.includes('hwupload')));
});
test('bounded subprocess output, timeout and explicit abort kill actual Node children', async () => {
  await assert.rejects(() => output(process.execPath, ['-e', 'console.log("x".repeat(10000))'], { maximum: 10 }), /batas/);
  await assert.rejects(() => output(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 30 }), /waktu/);
  const controller = new AbortController(); const pending = output(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal }); controller.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(children.size, 0);
  const child = spawnTracked(process.execPath, ['-e', 'setInterval(()=>{},1000)']); await terminate(child); await terminate(child); assert.equal(children.size, 0);
});
test('extractor refuses Python shebang/zipapps; live selection requires combined A/V', async (t) => {
  const { settings } = await setup(t), filename = path.join(settings.dataDir, 'script'); await writeFile(filename, '#!/usr/bin/python3\nprint("not allowed")');
  await assert.rejects(() => assertStandalone(filename), /mandiri/);
  assert.equal(chooseLiveSource({ formats: [{ protocol: 'm3u8_native', url: 'https://provider.invalid/videoonly', vcodec: 'h264', acodec: 'none', height: 1080 }, { protocol: 'm3u8', url: 'https://provider.invalid/combined', vcodec: 'h264', acodec: 'aac', height: 720 }] }), 'https://provider.invalid/combined');
});
test('real standalone yt-dlp downloads controlled HTML5 video and hands it to real FFmpeg', async (t) => {
  const { settings, manager } = await setup(t);
  // Require the approved executable for this integration test; missing tooling
  // is a failure, never a fake passing provider result.
  const version = await checkExtractor(settings); assert.match(version, /^\d{4}\.\d{2}\.\d{2}/);
  const input = await fixture(settings, path.join(settings.dataDir, 'provider.mp4'), { seconds: 2 }); const requests = [];
  const { url } = await listenFixture(t, (request, response) => {
    requests.push(request.url);
    if (request.url === '/watch') { response.setHeader('Content-Type', 'text/html'); response.end('<html><head><title>Controlled HTML5</title></head><body><video src="/source.mp4" controls></video></body></html>'); }
    else if (request.url.startsWith('/source.mp4')) { response.setHeader('Content-Type', 'video/mp4'); createReadStream(input).pipe(response); }
    else { response.writeHead(404); response.end(); }
  });
  const session = await manager.create({ kind: 'url', url: `${url}/watch` }); await session.task;
  assert.equal(session.state, 'ended', session.error); assert.equal(session.live, false); assert.equal(session.metadata.has_video, true); assert.ok(requests.includes('/source.mp4')); assert.ok(session.public().manifest);
  assert.ok((await readdir(session.directory)).some((name) => name.startsWith('provider.')));
});
test('real extractor failures/timeouts surface safe errors and leave no children', async (t) => {
  const { settings } = await setup(t), directory = path.join(settings.cacheDir, 'extractor'); await mkdir(directory);
  const { url } = await listenFixture(t, (_request, response) => { response.writeHead(404); response.end(); });
  await assert.rejects(() => extract(settings, `${url}/bad?key=secret`, directory), (error) => !error.message.includes('secret'));
  assert.equal(children.size, 0);
});
