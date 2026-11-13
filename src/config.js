// 666 Streaming. Derived from the original project's configuration/services.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdir, access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const APP_NAME = '666 Streaming';
export const VERSION = '2.0.0';
export const MEDIA_EXTENSIONS = new Set('.mp4 .mkv .webm .mov .avi .m4v .ts .m2ts .mp3 .m4a .aac .flac .wav .ogg .opus'.split(' '));
export const REMOTE = /^(https?|rtsps?|rtmps?):\/\//i;

export function integer(env, name, fallback, minimum, maximum) {
  const raw = String(env[name] ?? '').trim() || String(fallback);
  const value = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} harus berupa angka antara ${minimum} dan ${maximum}.`);
  }
  return value;
}
export function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function validateUrl(input, httpOnly = false) {
  if (typeof input !== 'string' || input.length > 8192 || /[\x00-\x1f\x7f]/.test(input)) throw new TypeError('URL tidak valid.');
  const value = input.trim();
  let url;
  try { url = new URL(value); } catch { throw new TypeError('URL tidak valid.'); }
  const protocols = httpOnly ? ['http:', 'https:'] : ['http:', 'https:', 'rtsp:', 'rtsps:', 'rtmp:', 'rtmps:'];
  if (!protocols.includes(url.protocol) || !url.hostname || (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))) {
    throw new TypeError(httpOnly ? 'Gunakan URL HTTP(S).' : 'Gunakan URL HTTP(S), RTSP, atau RTMP.');
  }
  return value;
}
export function streamProfile(env = process.env) {
  const quality = String(env.STREAM_QUALITY || '720p').trim().toLowerCase();
  const presets = { '720p': '1280:720', '1080p': '1920:1080', '4k': '3840:2160' };
  if (!presets[quality]) throw new RangeError('STREAM_QUALITY harus 720p, 1080p, atau 4k.');
  const resolution = (String(env.STREAM_RESOLUTION || '').trim() || presets[quality]).toLowerCase().replace('x', ':');
  const [width, height] = resolution.split(':').map(Number);
  if (!/^\d+:\d+$/.test(resolution) || !Number.isInteger(width) || !Number.isInteger(height) || width < 64 || width > 3840 || height < 64 || height > 2160 || width % 2 || height % 2) throw new RangeError('STREAM_RESOLUTION harus W:H genap, maksimum 3840:2160.');
  const fps = Number(String(env.STREAM_FPS || '').trim() || '30');
  if (!Number.isFinite(fps) || fps < 1 || fps > 60) throw new RangeError('STREAM_FPS harus antara 1 dan 60.');
  const bitrate = String(env.STREAM_VIDEO_BITRATE || '').trim() || '3500k';
  const rate = Number.parseInt(bitrate, 10) * (/m$/i.test(bitrate) ? 1000000 : /k$/i.test(bitrate) ? 1000 : 1);
  if (!/^[1-9][0-9]{0,8}[kKmM]?$/.test(bitrate) || rate < 64000 || rate > 100000000) throw new RangeError('STREAM_VIDEO_BITRATE harus 64k–100M (contoh: 3500k).');
  return { width, height, fps, bitrate, quality };
}
function envPath(env, name, fallback, root) {
  let raw = String(env[name] || '').trim() || fallback;
  if (raw === '~' || raw.startsWith('~/')) raw = path.join(os.homedir(), raw.slice(2));
  return path.resolve(root, raw);
}
export function loadSettings(env = process.env, root = ROOT) {
  const profile = streamProfile(env);
  const cookie = String(env.COOKIE_SECURE || 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(cookie)) throw new RangeError('COOKIE_SECURE harus true atau false.');
  const encoder = String(env.VIDEO_ENCODER || '').trim() || 'libx264';
  if (!['libx264', 'libopenh264', 'h264_nvenc', 'h264_vaapi'].includes(encoder)) throw new RangeError('VIDEO_ENCODER tidak didukung.');
  const dataDir = envPath(env, 'DATA_DIR', 'data', root);
  const publicUrl = String(env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicUrl) {
    const parsed = new URL(validateUrl(publicUrl, true));
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new RangeError('PUBLIC_URL harus berupa root origin HTTP(S), tanpa path/credential.');
  }
  let timezone = String(env.TIMEZONE || '').trim() || 'UTC';
  try { new Intl.DateTimeFormat('id-ID', { timeZone: timezone }).format(); } catch { timezone = 'UTC'; }
  const binary = (name, fallback) => {
    const value = String(env[name] || '').trim() || fallback;
    return /[/\\\\]/.test(value) ? envPath({ [name]: value }, name, value, root) : value;
  };
  return {
    root, env, profile, encoder, timezone, dataDir,
    mediaDir: envPath(env, 'MEDIA_DIR', path.join(dataDir, 'media'), root),
    cacheDir: path.join(dataDir, 'cache'),
    host: String(env.HOST || '').trim() || '0.0.0.0',
    port: integer(env, String(env.PORT || '').trim() ? 'PORT' : 'SERVER_PORT', 8080, 1, 65535),
    password: env.APP_PASSWORD || '', cookieSecure: cookie === 'true', publicUrl,
    ffmpeg: binary('FFMPEG_PATH', 'ffmpeg'),
    ffprobe: binary('FFPROBE_PATH', 'ffprobe'),
    ytdlp: binary('YTDLP_PATH', path.join(root, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')),
    threads: integer(env, 'FFMPEG_THREADS', 2, 1, 32),
    avSyncMs: integer(env, 'STREAM_AV_SYNC_MS', 0, -5000, 5000),
    maxStreams: integer(env, 'MAX_STREAMS', 3, 1, 20),
    idleSeconds: integer(env, 'STREAM_IDLE_SECONDS', 900, 30, 86400),
    maxCacheMb: integer(env, 'MAX_CACHE_MB', 1024, 32, 102400),
    maxUploadMb: integer(env, 'MAX_UPLOAD_MB', 1024, 1, 102400),
    maxDownloadMb: integer(env, 'MAX_DOWNLOAD_MB', 1024, 1, 102400),
    resolveTimeout: integer(env, 'RESOLVE_TIMEOUT', 300, 10, 3600),
    ytdlpFormat: String(env.YTDLP_FORMAT || '').trim() || 'bv*[height<=?1080]+ba/b[height<=?1080]',
    vaapiDevice: String(env.VAAPI_DEVICE || '').trim() || '/dev/dri/renderD128',
  };
}
export async function prepareSettings(settings) {
  if (within(settings.cacheDir, settings.mediaDir)) throw new RangeError('MEDIA_DIR tidak boleh berada di dalam direktori cache.');
  for (const directory of [settings.dataDir, settings.mediaDir, settings.cacheDir]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await access(directory, constants.W_OK);
  }
  // Resolve symlinks before path confinement and disposable-cache cleanup.
  settings.dataDir = await realpath(settings.dataDir);
  settings.mediaDir = await realpath(settings.mediaDir);
  settings.cacheDir = await realpath(settings.cacheDir);
  if (!within(settings.dataDir, settings.cacheDir)) throw new RangeError('Cache harus tetap berada di dalam DATA_DIR.');
  if (within(settings.cacheDir, settings.mediaDir) || within(settings.mediaDir, settings.cacheDir)) throw new RangeError('MEDIA_DIR dan cache tidak boleh saling memuat.');
  return settings;
}
