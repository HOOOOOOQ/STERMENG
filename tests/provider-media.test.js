// Full controlled service API → authenticated upstream → real decoded HLS.
// This does not impersonate a test against externally hosted Jellyfin/TVheadend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Catalog } from '../src/services/catalog.js';
import { MediaManager } from '../src/media/manager.js';
import { output } from '../src/media/processes.js';
import { probe } from '../src/media/ffmpeg.js';
import { fixture, listenFixture, testSettings } from './helpers.js';

test('controlled Jellyfin/TVheadend API paths deliver actual A/V through FFmpeg', { timeout: 25000 }, async (t) => {
  const settings = await testSettings(t), source = await fixture(settings, path.join(settings.dataDir, 'source.mp4'), { seconds: 3 });
  const upstream = path.join(settings.dataDir, 'provider-hls'); await mkdir(upstream);
  await output(settings.ffmpeg, ['-v', 'error', '-i', source, '-c', 'copy', '-hls_time', '1', '-hls_playlist_type', 'vod', path.join(upstream, 'index.m3u8')]);
  const requests = [], now = Date.now() / 1000;
  const { url } = await listenFixture(t, async (request, response) => {
    const parsed = new URL(request.url, 'http://fixture'); requests.push(parsed.pathname);
    const json = (value) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
    if (parsed.pathname === '/Users') { assert.equal(request.headers.authorization, 'MediaBrowser Token="jellyfin-private"'); return json([{ Id: 'user1' }]); }
    if (parsed.pathname === '/Items/movie1/PlaybackInfo') {
      assert.equal(request.method, 'POST'); assert.equal(request.headers.authorization, 'MediaBrowser Token="jellyfin-private"'); request.resume();
      return json({ MediaSources: [{ TranscodingUrl: '/Videos/movie1/index.m3u8?api_key=jellyfin-private' }] });
    }
    if (parsed.pathname === '/Videos/movie1/index.m3u8') {
      assert.equal(parsed.searchParams.get('api_key'), 'jellyfin-private');
      const manifest = (await readFile(path.join(upstream, 'index.m3u8'), 'utf8')).split('\n').map((line) => line.endsWith('.ts') ? `${line}?api_key=jellyfin-private` : line).join('\n');
      response.setHeader('Content-Type', 'application/vnd.apple.mpegurl'); response.end(manifest); return;
    }
    if (parsed.pathname.startsWith('/Videos/movie1/') && parsed.pathname.endsWith('.ts')) {
      assert.equal(parsed.searchParams.get('api_key'), 'jellyfin-private'); createReadStream(path.join(upstream, path.basename(parsed.pathname))).pipe(response); return;
    }
    const auth = `Basic ${Buffer.from('tvuser:tv-private').toString('base64')}`;
    if (parsed.pathname === '/api/channel/grid') { assert.equal(request.headers.authorization, auth); return json({ entries: [{ uuid: 'tv1', name: 'Controlled TV', number: 1, enabled: true }] }); }
    if (parsed.pathname === '/api/epg/events/grid') { assert.equal(request.headers.authorization, auth); return json({ entries: [{ channelUuid: 'tv1', channelName: 'Controlled TV', title: 'Programme', start: now - 100, stop: now + 100 }] }); }
    if (parsed.pathname === '/stream/channel/tv1') {
      if (request.headers.authorization !== auth) { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="fixture"' }); response.end(); return; }
      response.setHeader('Content-Length', (await stat(source)).size); response.setHeader('Content-Type', 'video/mp4'); createReadStream(source).pipe(response); return;
    }
    response.writeHead(404); response.end();
  });
  settings.env = { ...settings.env, JELLYFIN_URL: url, JELLYFIN_API_KEY: 'jellyfin-private', TVHEADEND_URL: url, TVHEADEND_USER: 'tvuser', TVHEADEND_PASS: 'tv-private' };
  const catalog = await Catalog.open(settings), manager = new MediaManager(settings, catalog); await manager.start();
  try {
    const descriptors = [{ kind: 'jellyfin', id: 'movie1', title: 'Controlled movie' }, (await catalog.channelList()).items[0]];
    for (const descriptor of descriptors) {
      const session = await manager.create(descriptor); await session.task; assert.equal(session.state, 'ended', session.error);
      const decoded = await probe(settings, path.join(session.directory, 'index.m3u8'), false); assert.equal(decoded.has_video, true); assert.equal(decoded.has_audio, true);
      assert.doesNotMatch(JSON.stringify(session.public()), /jellyfin-private|tv-private/); await manager.stop(session.id);
    }
    assert.ok(requests.includes('/Items/movie1/PlaybackInfo')); assert.ok(requests.some((name) => name.startsWith('/Videos/movie1/') && name.endsWith('.ts'))); assert.ok(requests.includes('/stream/channel/tv1'));
  } finally { await manager.close(); await catalog.close(); }
});
