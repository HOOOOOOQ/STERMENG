import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadSettings, streamProfile, validateUrl, within, prepareSettings, ROOT } from '../src/config.js';
import { temporary } from './helpers.js';

test('Node settings use the assigned Pterodactyl port and portable paths', () => {
  const settings = loadSettings({ PORT: '', SERVER_PORT: '25566', DATA_DIR: './state' }, '/home/container');
  assert.equal(settings.host, '0.0.0.0'); assert.equal(settings.port, 25566); assert.equal(settings.dataDir, '/home/container/state'); assert.equal(settings.mediaDir, '/home/container/state/media');
  assert.equal(loadSettings({ PORT: '8088', SERVER_PORT: '25566' }).port, 8088);
  assert.equal(loadSettings({}).port, 8080); assert.equal(loadSettings({}).encoder, 'libx264');
  assert.equal(loadSettings({}).ytdlp, path.join(ROOT, 'bin/yt-dlp'));
});
const invalid = {
  PORT: ['0', '65536', '3.14', '1x', '-1', 'Infinity'], SERVER_PORT: ['wrong'], COOKIE_SECURE: ['1', 'yes'], VIDEO_ENCODER: ['copy', 'unknown'],
  STREAM_QUALITY: ['360p'], STREAM_RESOLUTION: ['63:180', '321:180', '320:181', '4096:2160', '1280:2162', 'a:b', '320:180:90'], STREAM_FPS: ['0', '61', 'NaN', 'Infinity'],
  STREAM_VIDEO_BITRATE: ['4;bad', '-1', '1k', '999999999'], FFMPEG_THREADS: ['0', '33'], STREAM_AV_SYNC_MS: ['5001', '-5001'],
  MAX_STREAMS: ['0', '21'], STREAM_IDLE_SECONDS: ['29'], MAX_CACHE_MB: ['31'], MAX_UPLOAD_MB: ['0'], MAX_DOWNLOAD_MB: ['0'], RESOLVE_TIMEOUT: ['9'],
  PUBLIC_URL: ['ftp://example.com', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?secret=1'],
};
for (const [name, values] of Object.entries(invalid)) for (const value of values) test(`configuration rejects ${name}=${value}`, () => assert.throws(() => loadSettings({ [name]: value })));
test('profiles accept valid even overrides/fractional fps and bounded sync', () => {
  assert.deepEqual(streamProfile({ STREAM_QUALITY: '4k', STREAM_RESOLUTION: '1920x1080', STREAM_FPS: '29.97', STREAM_VIDEO_BITRATE: '8M' }), { width: 1920, height: 1080, fps: 29.97, bitrate: '8M', quality: '4k' });
  assert.equal(loadSettings({ STREAM_AV_SYNC_MS: '-5000' }).avSyncMs, -5000); assert.equal(loadSettings({ TIMEZONE: 'invalid/zone' }).timezone, 'UTC');
});
for (const url of ['file:///etc/passwd', 'data:text/plain,test', 'concat:http://example.com', '-i http://example.com', 'http://', 'http://example.com:0', 'https://example.com:99999', 'http://example.com\n-secret', 'rtp://example.com', 'ftp://example.com']) test(`URL scheme/input rejects ${JSON.stringify(url)}`, () => assert.throws(() => validateUrl(url)));
for (const url of ['https://example.com/video?q=signed', 'http://user:pass@192.168.0.2:8080/path', 'rtsp://example.com/live', 'rtmps://example.com/live', 'https://[::1]:8443/file']) test(`URL accepts supported media ${url}`, () => assert.equal(validateUrl(url), url));
test('HTTP-only sources reject RTSP; path checks do not confuse sibling prefixes', () => {
  assert.throws(() => validateUrl('rtsp://example.com/live', true)); assert.equal(within('/media', '/media-two/file'), false); assert.equal(within('/media', '/media/file'), true);
});
test('prepare refuses media under disposable cache or its parent', async (t) => {
  const directory = await temporary(t);
  await assert.rejects(() => prepareSettings(loadSettings({ DATA_DIR: directory, MEDIA_DIR: path.join(directory, 'cache/media') })), /MEDIA_DIR/);
  await assert.rejects(() => prepareSettings(loadSettings({ DATA_DIR: directory, MEDIA_DIR: directory })), /MEDIA_DIR/);
});
