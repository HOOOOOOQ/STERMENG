// Adapter contracts use controlled HTTP services, not external-provider claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseM3u, epgUrl, fetchM3u, backfillEpgUrls } from '../src/services/m3u.js';
import { parseXmltvDate, parseXmltv, fetchXmltvNowPlaying } from '../src/services/epg.js';
import { highestVariant, extractHlsVariantUrl } from '../src/services/hls.js';
import { requestBytes, requestJson } from '../src/services/http.js';
import { JellyfinClient, parseEpisodeQuery, formatJellyfinItem } from '../src/services/jellyfin.js';
import { TVheadendClient } from '../src/services/tvheadend.js';
import { Catalog, channelKey } from '../src/services/catalog.js';
import { SourceStore } from '../src/storage.js';
import { temporary, testSettings, listenFixture } from './helpers.js';

const m3u = '\uFEFF#EXTM3U x-tvg-url="guide.xml.gz"\n#EXTINF:-1 tvg-id="tv" group-title="News, Global",Channel One\nstream/index.m3u8\n#EXTINF:-1 tvg-name="Fallback"\n# ignored\nhttps://provider.invalid/two\n';
test('M3U parser handles BOM, commas in quoted attributes, fallback names and EPG', () => {
  const result = parseM3u(m3u); assert.equal(result.length, 2); assert.deepEqual(result[0], { name: 'Channel One', tvg_id: 'tv', group: 'News, Global', stream_url: 'stream/index.m3u8' });
  assert.equal(result[1].name, 'Fallback'); assert.equal(epgUrl(m3u), 'guide.xml.gz');
  assert.throws(() => parseM3u('not M3U')); assert.equal(epgUrl(''), null);
});
test('M3U HTTP resolves relative URLs and backfills old EPG header (bounded prefix)', async (t) => {
  const { url } = await listenFixture(t, (_request, response) => { response.end(m3u); });
  const result = await fetchM3u(`${url}/list.m3u`);
  assert.equal(result.channels[0].stream_url, `${url}/stream/index.m3u8`); assert.equal(result.epgUrl, `${url}/guide.xml.gz`);
  const directory = await temporary(t), store = await SourceStore.open(path.join(directory, 'sources.json'));
  await store.add('Original', `${url}/list.m3u`, result.channels); assert.equal(await backfillEpgUrls(store), 1); assert.equal(store.epgSources()[0][1], result.epgUrl);
  assert.equal(await backfillEpgUrls(store), 0);
});
test('HTTP bounds responses, timeouts, abort, invalid JSON; auth survives only same-origin redirects', async (t) => {
  const { url } = await listenFixture(t, (request, response) => {
    if (request.url === '/large') return response.end('x'.repeat(2000));
    if (request.url === '/slow') return;
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/auth' }); response.end(); return; }
    if (request.url === '/auth') { response.end(JSON.stringify({ auth: request.headers.authorization })); return; }
    response.end('not JSON');
  });
  await assert.rejects(() => requestBytes(`${url}/large`, { maximum: 100 }), /besar/);
  assert.equal((await requestBytes(`${url}/large`, { maximum: 100, prefix: true })).data.length, 100);
  await assert.rejects(() => requestBytes(`${url}/slow`, { timeout: 30 }), /waktu/);
  const controller = new AbortController(); const pending = requestBytes(`${url}/slow`, { signal: controller.signal }); controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(() => requestJson(`${url}/invalid`), /JSON/);
  const address = new URL(`${url}/redirect`); address.username = 'user'; address.password = 'password';
  assert.equal((await requestJson(address.href)).auth, `Basic ${Buffer.from('user:password').toString('base64')}`);
});
for (const [input, expected] of [['20260519120000 +0000', 1779192000], ['20260519190000 +0700', 1779192000], ['20260519070000 -0500', 1779192000], ['20260519120000', 1779192000]]) test(`XMLTV timezone ${input}`, () => assert.equal(parseXmltvDate(input), expected));
for (const value of ['', '20260230120000', '20261319120000', '20260519126000', '20260519120000 +2460']) test(`XMLTV rejects invalid timestamp ${value}`, () => assert.throws(() => parseXmltvDate(value)));
test('XMLTV streaming parser handles now-playing, entities/gzip and discards old/bad programme', async (t) => {
  const guide = '<tv><programme channel="tv" start="20260519110000 +0000" stop="20260519130000 +0000"><title>News &amp; Updates</title></programme><programme channel="old" start="20260518110000" stop="20260518130000"><title>Old</title></programme><programme channel="bad" start="invalid" stop="invalid"><title>Bad</title></programme></tv>';
  assert.deepEqual(await parseXmltv(guide, 1779192000), { tv: 'News & Updates' });
  const { url } = await listenFixture(t, (_request, response) => response.end(gzipSync(guide)));
  assert.deepEqual(await fetchXmltvNowPlaying(url, { now: 1779192000 }), { tv: 'News & Updates' });
  await assert.rejects(() => parseXmltv('<!DOCTYPE tv [<!ENTITY x SYSTEM "file:///etc/passwd">]><tv/>'), /DOCTYPE/);
  await assert.rejects(() => requestBytes(url, { maximum: 1024, expandedMaximum: 10 }), /terkompresi/);
});
test('HLS master selection preserves signed variant query and tolerates non-HLS/failed URL', async (t) => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900\nhigh.m3u8?token=private\n';
  assert.equal(highestVariant(master, 'https://provider.invalid/master.m3u8'), 'https://provider.invalid/high.m3u8?token=private');
  const { url } = await listenFixture(t, (_request, response) => response.end(master));
  assert.equal(await extractHlsVariantUrl(`${url}/master.m3u8`), `${url}/high.m3u8?token=private`);
  assert.equal(highestVariant('not HLS', url), url);
});
test('Jellyfin search/episode traversal, authorized PlaybackInfo and subtitle suppression', async (t) => {
  const requests = [];
  const { url } = await listenFixture(t, async (request, response) => {
    const parsed = new URL(request.url, 'http://fixture'); requests.push(parsed.pathname);
    assert.equal(request.headers.authorization, 'MediaBrowser Token="private-key"');
    let result;
    if (parsed.pathname === '/Users') result = [{ Id: 'user1' }];
    else if (parsed.pathname === '/Items' && parsed.searchParams.get('searchTerm') === 'Show') result = { Items: [{ Id: 'series1', Type: 'Series', Name: 'Show' }] };
    else if (parsed.pathname === '/Shows/series1/Seasons') result = { Items: [{ Id: 'season2', IndexNumber: 2 }, { Id: 'season1', IndexNumber: 1 }] };
    else if (parsed.pathname === '/Shows/series1/Episodes') {
      assert.equal(parsed.searchParams.get('SeasonId'), 'season1'); result = { Items: [{ Id: 'ep2', IndexNumber: 2, ParentIndexNumber: 1, SeriesName: 'Show', Name: 'Episode', Type: 'Episode' }] };
    } else if (parsed.pathname === '/Items/ep2/PlaybackInfo') {
      let body = ''; for await (const chunk of request) body += chunk;
      const value = JSON.parse(body); assert.equal(value.UserId, 'user1'); assert.equal(value.SubtitleStreamIndex, -1); assert.deepEqual(value.DeviceProfile.SubtitleProfiles, []); assert.equal(value.DeviceProfile.TranscodingProfiles[0].VideoCodec, 'h264');
      result = { MediaSources: [{ TranscodingUrl: '/Videos/ep2/master.m3u8?SubtitleStreamIndex=3&PlaySessionId=session1' }] };
    } else result = { Items: [] };
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(result));
  });
  const client = new JellyfinClient(url, 'private-key');
  const matches = await client.search('Show S01E02'); assert.equal(matches[0].Id, 'ep2');
  assert.equal(formatJellyfinItem(matches[0]), 'Show — S01E02 — Episode');
  const stream = new URL(await client.getStreamUrl('ep2'));
  assert.equal(stream.searchParams.get('api_key'), 'private-key'); assert.equal(stream.searchParams.get('SubtitleStreamIndex'), '-1');
  await client.getStreamUrl('ep2'); assert.equal(requests.filter((item) => item === '/Users').length, 1);
  assert.deepEqual(parseEpisodeQuery('Movie'), { show: 'Movie', season: null, episode: null });
});
test('TVheadend Basic auth, enabled sorting, EPG client filter and cache, IPv6 URL encoding', async (t) => {
  let epgRequests = 0;
  const now = Date.now() / 1000;
  const { url } = await listenFixture(t, (request, response) => {
    assert.equal(request.headers.authorization, `Basic ${Buffer.from('user:p@ss').toString('base64')}`);
    const parsed = new URL(request.url, 'http://fixture');
    if (parsed.pathname === '/api/channel/grid') response.end(JSON.stringify({ entries: [{ uuid: 'b', name: 'Two', number: 2 }, { uuid: 'a', name: 'One', number: 1 }, { uuid: 'x', name: 'Disabled', enabled: false }] }));
    else { epgRequests++; response.end(JSON.stringify({ entries: [{ channelUuid: 'a', title: 'News', start: now - 10, stop: now + 100 }, { channelUuid: 'b', title: 'Sports', start: now + 100, stop: now + 200 }] })); }
  });
  const client = new TVheadendClient(url, 'user', 'p@ss');
  assert.deepEqual((await client.getChannels()).map((item) => item.uuid), ['a', 'b']);
  assert.deepEqual(await client.getNowPlaying(), { a: 'News' }); await client.getNowPlaying(); assert.equal(epgRequests, 1);
  assert.equal((await client.getEpgEvents('nEwS')).length, 1);
  const stream = new URL(new TVheadendClient('http://[::1]:9981', 'u@', 'p#').streamUrl('uuid'));
  assert.equal(stream.hostname, '[::1]'); assert.equal(decodeURIComponent(stream.password), 'p#'); assert.equal(stream.pathname, '/stream/channel/uuid');
});
test('catalog retains channel hash and hides all provider credentials from public listings', async (t) => {
  const settings = await testSettings(t), catalog = await Catalog.open(settings); t.after(() => catalog.close());
  const stream = 'http://user:password@provider.invalid/live?token=private';
  await catalog.sources.add('Original', 'http://provider.invalid/list?secret=private', [{ name: 'TV', stream_url: stream }]);
  const data = await catalog.channelList(); assert.equal(data.items[0].id, channelKey('Original', 'TV', stream));
  assert.doesNotMatch(JSON.stringify([catalog.sourceList(), data]), /password|secret|private/);
  assert.equal((await catalog.resolve({ kind: 'channel', id: data.items[0].id })).source, stream);
  await catalog.sources.setEnabled(0, false); catalog.invalidate(); assert.deepEqual((await catalog.channelList()).items, []);
});
test('missing providers are explicit and malformed persisted JSON does not get overwritten', async (t) => {
  const settings = await testSettings(t);
  await writeFile(path.join(settings.dataDir, 'sources.json'), '{invalid');
  await assert.rejects(() => Catalog.open(settings), /rusak/);
  assert.equal(JellyfinClient.fromEnv({}), null); assert.equal(TVheadendClient.fromEnv({}), null);
});

test('relative M3U and XMLTV URLs retain private Basic credentials without crossing redirect origins', async (t) => {
  const expected = `Basic ${Buffer.from('user:private').toString('base64')}`;
  const { url } = await listenFixture(t, (request, response) => {
    assert.equal(request.headers.authorization, expected);
    response.end('#EXTM3U url-tvg="guide.xml"\n#EXTINF:-1,Private\nstream.m3u8\n');
  });
  const address = new URL(`${url}/list.m3u`); address.username = 'user'; address.password = 'private';
  const result = await fetchM3u(address.href);
  assert.equal(new URL(result.channels[0].stream_url).password, 'private'); assert.equal(new URL(result.epgUrl).username, 'user');
  const other = await listenFixture(t, (request, response) => response.end(JSON.stringify({ auth: request.headers.authorization || null })));
  const redirect = await listenFixture(t, (_request, response) => { response.writeHead(302, { Location: other.url }); response.end(); });
  assert.equal((await requestJson(redirect.url, { headers: { Authorization: expected } })).auth, null);
});
