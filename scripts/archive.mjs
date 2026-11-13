// Reproducible ZIP of explicitly selected source/assets, never private runtime data.
import { readdir, readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FOLDERS = ['src', 'scripts', 'frontend', 'public', 'images', 'docs', 'tests', 'deploy', 'ci', '.github'];
const FILES = ['package.json', 'package-lock.json', '.env.example', '.gitignore', '.dockerignore', 'eslint.config.mjs', 'README.md', 'STREAMING.md', 'THIRD_PARTY.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml'];
const EXCLUDED = new Set(['.git', '.venv', 'venv', 'env', 'data', 'bin', 'vendor', 'node_modules', '__pycache__', '.cache', '.pytest_cache', '.ruff_cache', 'artifacts', 'coverage', 'test-results', 'playwright-report', 'build', 'dist']);
const forbidden = (name) => EXCLUDED.has(name) || /^\.env(?:\..*)?$/.test(name) && name !== '.env.example' || name === '.envrc' || /\.(?:py[co]?|log|pcap|pid)$/.test(name);
const table = Array.from({ length: 256 }, (_, number) => {
  for (let bit = 0; bit < 8; bit++) number = number & 1 ? (0xedb88320 ^ (number >>> 1)) : (number >>> 1);
  return number >>> 0;
});
function crc32(data) { let value = 0xffffffff; for (const byte of data) value = table[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }

export async function createSourceArchive(root = ROOT) {
  const files = [...FILES];
  async function scan(relative) {
    if (!(await lstat(path.join(root, relative))).isDirectory()) throw new Error(`Not a distribution directory: ${relative}`);
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (forbidden(entry.name) || entry.name.endsWith('.egg-info')) continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in distribution: ${name}`);
      if (entry.isDirectory()) await scan(name); else files.push(name);
    }
  }
  for (const directory of FOLDERS) await scan(directory);
  if (!files.includes('public/index.html')) throw new Error('Run npm run build before archiving.');
  const names = [...new Set(files)].sort();
  if (names.length > 65535) throw new Error('Distribution exceeds ZIP32 entry limit.');
  const local = [], central = []; let offset = 0;
  // Stable timestamp/modes make identical input bytes yield identical output.
  const date = ((2026 - 1980) << 9) | (11 << 5) | 13;
  for (const filename of names) {
    if (!(await lstat(path.join(root, filename))).isFile()) throw new Error(`Not a regular distribution file: ${filename}`);
    const name = Buffer.from(filename), data = await readFile(path.join(root, filename)), compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    if (name.length > 65535 || offset + compressed.length + name.length + 30 > 0xffffffff || data.length > 0xffffffff) throw new Error('Distribution exceeds ZIP32 size limit.');
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(date, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(date, 14); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28);
    const mode = filename.endsWith('.sh') ? 0o100755 : 0o100644; directory.writeUInt32LE((mode * 65536) >>> 0, 38); directory.writeUInt32LE(offset, 42); central.push(directory, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  if (offset + directory.length + end.length > 0xffffffff) throw new Error('Distribution exceeds ZIP32 size limit.');
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return { archive: Buffer.concat([...local, directory, end]), files: names };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { archive, files } = await createSourceArchive();
  const destination = path.join(ROOT, 'artifacts/666-streaming-javascript-source.zip'); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, archive);
  const digest = createHash('sha256').update(archive).digest('hex');
  await writeFile(`${destination}.sha256`, `${digest}  ${path.basename(destination)}\n`);
  console.log(`${destination}\n${files.length} files; ${archive.length} bytes; SHA256 ${digest}`);
}
