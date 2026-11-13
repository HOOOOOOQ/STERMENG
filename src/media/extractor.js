// The external executable is the user-approved standalone yt-dlp build.
// Never use python, python -m, an npm Python wrapper, or a shebang zipapp.
import { open, realpath, stat, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { validateUrl, within } from '../config.js';
import { MediaError } from '../errors.js';
import { output, spawnTracked, terminate } from './processes.js';

export async function assertStandalone(filename) {
  let file;
  try {
    if (!filename.includes('/') && !filename.includes('\\')) {
      let found;
      for (const directory of (process.env.PATH || '').split(path.delimiter)) {
        const candidate = path.join(directory, filename);
        try { await access(candidate, constants.X_OK); found = candidate; break; } catch { /* next PATH entry */ }
      }
      if (!found) throw new Error('Binary not in PATH');
      filename = found;
    }
    file = await open(filename, 'r'); const bytes = Buffer.alloc(4); await file.read(bytes, 0, 4, 0);
    const hex = bytes.toString('hex');
    if (!(hex === '7f454c46' || bytes.subarray(0, 2).toString() === 'MZ' || ['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca'].includes(hex))) throw new Error('Not standalone');
    return filename;
  } catch { throw new MediaError('YTDLP_PATH harus menunjuk binary yt-dlp mandiri resmi (bukan script Python). Jalankan npm run install:ytdlp.'); }
  finally { if (file) await file.close(); }
}
export async function checkExtractor(settings, { signal } = {}) {
  const binary = await assertStandalone(settings.ytdlp);
  const version = (await output(binary, ['--ignore-config', '--version'], { timeout: 15000, signal })).toString('utf8').trim();
  if (!/^\d{4}\.\d{2}\.\d{2}(?:[^\s]*)?$/.test(version)) throw new MediaError('Binary YTDLP_PATH tidak melaporkan versi yt-dlp yang valid.');
  return version;
}
export function extractorArguments(settings) {
  return ['--ignore-config', '--no-update', '--no-playlist', '--no-progress', '--no-warnings', '--socket-timeout', '15', '--retries', '2', '--fragment-retries', '2', '--max-filesize', String(settings.maxDownloadMb * 1024 * 1024), '--js-runtimes', `node:${process.execPath}`, '--ffmpeg-location', settings.ffmpeg];
}
export function chooseLiveSource(info) {
  const variants = (info.formats || []).filter((item) => String(item.protocol || '').startsWith('m3u8') && item.url && item.vcodec && item.vcodec !== 'none' && item.acodec && item.acodec !== 'none');
  variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0));
  return variants[0]?.url || info.url || null;
}
async function directorySize(directory) {
  let total = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, item.name);
    try { if (item.isFile()) total += (await stat(name)).size; else if (item.isDirectory()) total += await directorySize(name); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return total;
}
export async function extract(settings, url, directory, { signal } = {}) {
  validateUrl(url, true); const binary = await assertStandalone(settings.ytdlp);
  const timeoutSignal = AbortSignal.timeout(settings.resolveTimeout * 1000);
  const combined = AbortSignal.any([timeoutSignal, ...(signal ? [signal] : [])]);
  try {
    // URL on stdin, not in process argv; no config/plugin options from user input.
    const metadata = JSON.parse((await output(binary, [...extractorArguments(settings), '--skip-download', '--dump-single-json', '--batch-file', '-'], { timeout: settings.resolveTimeout * 1000, signal: combined, maximum: 16 * 1024 * 1024, stdin: `${url}\n` })).toString('utf8'));
    if (!metadata || metadata._type === 'playlist') throw new MediaError('Gunakan satu video; playlist provider tidak diunduh sekaligus. Tambahkan item ke antrean.');
    const title = String(metadata.title || 'Provider media').slice(0, 200);
    if (metadata.live_status === 'is_live' || metadata.is_live === true) {
      const source = chooseLiveSource(metadata);
      if (!source) throw new MediaError('Provider live tidak mengembalikan URL A/V yang dapat diputar.');
      return { source: validateUrl(source), title, live: true };
    }
    const child = spawnTracked(binary, [...extractorArguments(settings), '--format', settings.ytdlpFormat, '--merge-output-format', 'mp4', '--output', path.join(directory, 'provider.%(ext)s'), '--print', 'after_move:filepath', '--batch-file', '-'], { signal: combined, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {}); child.stdin.end(`${url}\n`); child.stderr.resume();
    let resultText = '', tooLarge = false, checking = false;
    child.stdout.on('data', (chunk) => { if (resultText.length < 16384) resultText += chunk; });
    // max-filesize is per-format. Enforce a total disk cap too, including .part
    // and separate A/V streams; stopping/restarting must not leave workers behind.
    const monitor = setInterval(async () => {
      if (checking) return; checking = true;
      try { if (await directorySize(directory) > settings.maxDownloadMb * 1024 * 1024) { tooLarge = true; await terminate(child); } }
      catch { await terminate(child); } finally { checking = false; }
    }, 250);
    try {
      const result = await child.result;
      combined.throwIfAborted();
      if (tooLarge) throw new MediaError('Unduhan melampaui MAX_DOWNLOAD_MB.');
      if (result.error || result.code !== 0) throw new MediaError('yt-dlp gagal mengunduh media. Periksa versi, koneksi, dan akses provider.');
      const candidate = resultText.trim().split(/\r?\n/).at(-1);
      if (!candidate) throw new MediaError('Provider tidak mengembalikan file media.');
      const source = await realpath(candidate), destination = await realpath(directory);
      if (!within(destination, source) || !(await stat(source)).isFile()) throw new MediaError('Path hasil unduhan tidak valid.');
      if (await directorySize(directory) > settings.maxDownloadMb * 1024 * 1024) throw new MediaError('Unduhan melampaui MAX_DOWNLOAD_MB.');
      return { source, title, live: false };
    } finally { clearInterval(monitor); await terminate(child); }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeoutSignal.aborted) throw new MediaError('Resolusi provider melewati RESOLVE_TIMEOUT.');
    if (error instanceof MediaError) throw error;
    throw new MediaError('yt-dlp gagal mengambil sumber. Periksa provider dan versi binary mandiri.');
  }
}
