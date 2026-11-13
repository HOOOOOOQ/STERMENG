// Explicit installation of the standalone utility (never the Python zipapp).
import { mkdir, writeFile, rename, chmod, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const YTDLP_VERSION = '2026.10.26';
const root = fileURLToPath(new URL('../', import.meta.url));
const platforms = { 'linux-x64': 'yt-dlp_linux', 'linux-arm64': 'yt-dlp_linux_aarch64', 'darwin-x64': 'yt-dlp_macos', 'darwin-arm64': 'yt-dlp_macos', 'win32-x64': 'yt-dlp.exe' };
const asset = platforms[`${process.platform}-${process.arch}`];
if (!asset) throw new Error('Platform tidak didukung installer standalone. Pasang binary resmi lalu set YTDLP_PATH.');
const destination = process.env.YTDLP_PATH ? path.resolve(process.env.YTDLP_PATH) : path.join(root, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`;
async function download(url, maximum) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Unduhan GitHub gagal: HTTP ${response.status}.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw new Error('Binary melebihi batas download.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
try {
  const sums = (await download(`${base}/SHA2-256SUMS`, 65536)).toString('utf8');
  const line = sums.split(/\r?\n/).find((line) => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === asset);
  const expected = line?.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected || '')) throw new Error('Checksum asset resmi tidak ditemukan.');
  const binary = await download(`${base}/${asset}`, 100 * 1024 * 1024);
  if (createHash('sha256').update(binary).digest('hex') !== expected.toLowerCase()) throw new Error('Checksum yt-dlp tidak cocok. Tidak dipasang.');
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.download-${process.pid}`;
  try { await writeFile(temporary, binary, { flag: 'wx', mode: 0o755 }); await chmod(temporary, 0o755); await rename(temporary, destination); }
  finally { await rm(temporary, { force: true }); }
  console.log(`666 Streaming: standalone yt-dlp ${YTDLP_VERSION} installed (${asset}, SHA256 ${expected}).`);
  console.log('Tidak membutuhkan Python sistem; utilitas mandiri ini membawa CPython internal, sesuai pilihan pengguna.');
} catch (error) {
  console.error(`666 Streaming: ${error.message} Jika hosting memblokir release GitHub, unduh asset standalone + SHA2-256SUMS pada mesin administrator, verifikasi checksum dan upload binary. Jangan memakai file yt-dlp tanpa suffix platform (zipapp Python).`);
  process.exitCode = 1;
}
