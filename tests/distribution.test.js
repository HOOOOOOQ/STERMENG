import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { ROOT, loadSettings } from '../src/config.js';
import { createSourceArchive } from '../scripts/archive.mjs';

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename)); else files.push(filename);
  }
  return files;
}
test('source has a real Node ESM entrypoint, locked dependencies and no active Python code/wrapper', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')), lock = JSON.parse(await readFile(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.type, 'module'); assert.equal(pkg.scripts.start, 'node src/index.js'); assert.equal(pkg.dependencies['discord.js'].split('.')[0], '14'); assert.match(pkg.engines.node, /22/); assert.equal(lock.packages[''].version, pkg.version);
  assert.doesNotMatch(JSON.stringify(pkg), /python|pip |discord\.py|ytdlp-nodejs|yt-dlp-wrap/i);
  const ignore = await readFile(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /^\/public\/$/m); assert.doesNotMatch(ignore, /^public\/$/m, 'Do not ignore required frontend/public source assets in clean Git installs.');
  for (const directory of ['src', 'scripts', 'tests', 'frontend']) for (const file of await sourceFiles(path.join(ROOT, directory))) assert.notEqual(path.extname(file), '.py', file);
  for (const file of ['app.py', 'bot.py', 'requirements.txt', 'requirements.lock', 'pyproject.toml', 'scripts/start.mjs', 'scripts/migrate_data.py']) await assert.rejects(() => stat(path.join(ROOT, file)), { code: 'ENOENT' });
});
test('original license hash and author attribution survive total rebranding', async () => {
  assert.equal(createHash('sha256').update(await readFile(path.join(ROOT, 'LICENSE'))).digest('hex'), '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986');
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8'); assert.match(readme, /topsoil \/ dev-topsoil/); assert.match(readme, /Slopsoil/);
  for (const file of ['frontend/index.html', 'frontend/app.js', 'frontend/styles.css', 'frontend/public/logo.svg', 'frontend/public/favicon.svg']) {
    const content = await readFile(path.join(ROOT, file), 'utf8');
    const publicIdentity = content.split('\n').filter((line) => !/turunan Slopsoil|dev-topsoil\/slopsoil/.test(line)).join('\n');
    assert.doesNotMatch(publicIdentity, /slopsoil|discord\.py|python3/i, file);
  }
});
test('Pterodactyl egg is Node22/direct Node, entrypoint and CI shell scripts parse', async () => {
  const egg = JSON.parse(await readFile(path.join(ROOT, 'deploy/pterodactyl/egg-666-streaming.json'), 'utf8'));
  assert.equal(egg.meta.version, 'PTDL_v2'); assert.equal(egg.startup, 'node src/index.js'); assert.match(egg.scripts.installation.container, /node:22/);
  assert.equal(JSON.parse(egg.config.startup).done, '666 Streaming siap');
  assert.doesNotMatch(egg.scripts.installation.script, /^\s*(?:pip3?\s+install\b|python3?\s+-)/m);
  for (const file of ['deploy/pterodactyl/entrypoint.sh', 'ci/test/run.sh', 'ci/test/coverage-report.sh', 'ci/test/post-coverage-comment.sh', 'ci/docker/labels.sh', 'ci/docker/tags.sh', '.github/actions/docker-meta/run.sh']) execFileSync('bash', ['-n', path.join(ROOT, file)], { stdio: 'pipe' });
  const docker = await readFile(path.join(ROOT, 'Dockerfile'), 'utf8'); assert.equal((docker.match(/FROM node:22/g) || []).length, 2); assert.doesNotMatch(docker, /FROM python|pip install|python -/); assert.match(docker, /CMD \["node", "src\/index.js"\]/);
  assert.match(docker, /mkdir -p \/home\/container\/data/); assert.match(docker, /chown -R node:node \/home\/container/);
});
test('Pterodactyl panel preset keeps allocated port and hosting secrets, uses CPU/one stream', async () => {
  const preset = dotenv.parse(await readFile(path.join(ROOT, 'deploy/pterodactyl/.env.example')));
  assert.equal(preset.PORT, ''); assert.ok(!Object.hasOwn(preset, 'SERVER_PORT'));
  for (const name of ['APP_PASSWORD', 'DISCORD_BOT_TOKEN', 'JELLYFIN_API_KEY', 'TVHEADEND_PASS']) assert.equal(preset[name], '');
  const env = { SERVER_PORT: '27931', APP_PASSWORD: 'runtime-fixture-only', YTDLP_PATH: '/opt/666-streaming/bin/yt-dlp' };
  dotenv.populate(env, preset); const settings = loadSettings(env);
  assert.equal(settings.port, 27931); assert.equal(settings.host, '0.0.0.0'); assert.equal(settings.password, 'runtime-fixture-only'); assert.equal(settings.ytdlp, '/opt/666-streaming/bin/yt-dlp');
  assert.equal(settings.dataDir, '/home/container/data'); assert.equal(settings.mediaDir, '/home/container/data/media');
  assert.equal(settings.maxStreams, 1); assert.equal(settings.threads, 1); assert.equal(settings.encoder, 'libx264'); assert.equal(settings.profile.quality, '720p'); assert.equal(settings.maxCacheMb, 512);
});
test('dependency package metadata and required license files really exist', async () => {
  for (const name of ['discord.js', '@discordjs/voice', 'opusscript', 'express', 'ws', 'busboy', 'saxes', 'dotenv', 'hls.js', '@fontsource-variable/manrope', '@fontsource/barlow-condensed']) {
    const pkg = JSON.parse(await readFile(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')); assert.equal(pkg.name, name);
  }
  for (const filename of ['hls.js-LICENSE.txt', 'Manrope-OFL.txt', 'Barlow-Condensed-OFL.txt']) assert.ok((await stat(path.join(ROOT, 'public/licenses', filename))).size > 0);
});

test('source ZIP is reproducible, excludes stale Python/private files, rejects symlinks and missing assets', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), '666-archive-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['src', 'scripts', 'frontend', 'public', 'images', 'docs', 'tests', 'deploy', 'ci', '.github', 'scripts/__pycache__', 'tests/__pycache__', 'docs/data', 'docs/node_modules']) await mkdir(path.join(root, directory), { recursive: true });
  for (const filename of ['package.json', 'package-lock.json', '.env.example', '.gitignore', '.dockerignore', 'eslint.config.mjs', 'README.md', 'STREAMING.md', 'THIRD_PARTY.md', 'LICENSE', 'Dockerfile', 'docker-compose.yml', 'public/index.html', 'deploy/run.sh']) await writeFile(path.join(root, filename), 'fixture');
  for (const filename of ['scripts/__pycache__/old.pyc', 'tests/__pycache__/old.pyc', 'scripts/old.py', 'docs/.env', 'docs/.env.production', 'docs/data/private.json', 'docs/node_modules/private.js', '.env']) await writeFile(path.join(root, filename), 'PRIVATE');
  await writeFile(path.join(root, 'src/index.js'), '123456789');
  const first = await createSourceArchive(root), second = await createSourceArchive(root); assert.deepEqual(first.archive, second.archive);
  assert.ok(first.files.includes('.env.example')); assert.ok(first.files.includes('public/index.html'));
  assert.ok(first.files.every((name) => !/\.py[co]?$|__pycache__|node_modules|(?:^|\/)data\//.test(name)));
  assert.ok(!first.files.includes('.env') && !first.files.includes('docs/.env') && !first.files.includes('docs/.env.production'));
  const names = []; let offset = 0;
  while (first.archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = first.archive.readUInt32LE(offset + 18), nameSize = first.archive.readUInt16LE(offset + 26), extraSize = first.archive.readUInt16LE(offset + 28);
    const filename = first.archive.subarray(offset + 30, offset + 30 + nameSize).toString(), start = offset + 30 + nameSize + extraSize;
    const data = inflateRawSync(first.archive.subarray(start, start + compressedSize)); assert.deepEqual(data, await readFile(path.join(root, filename))); names.push(filename);
    if (filename === 'src/index.js') assert.equal(first.archive.readUInt32LE(offset + 14), 0xcbf43926);
    offset = start + compressedSize;
  }
  assert.deepEqual(names, first.files); assert.equal(first.archive.readUInt32LE(offset), 0x02014b50);
  assert.equal(first.archive.readUInt32LE(first.archive.length - 22), 0x06054b50); assert.equal(first.archive.readUInt16LE(first.archive.length - 12), names.length);
  await rm(path.join(root, 'public/index.html')); await assert.rejects(() => createSourceArchive(root), /Run npm run build/);
  await writeFile(path.join(root, 'public/index.html'), 'fixture'); await symlink(path.join(root, '.env'), path.join(root, 'docs/leak'));
  await assert.rejects(() => createSourceArchive(root), /Refusing symlink/); await rm(path.join(root, 'docs/leak'));
  await rm(path.join(root, 'package.json')); await symlink(path.join(root, '.env'), path.join(root, 'package.json'));
  await assert.rejects(() => createSourceArchive(root), /Not a regular distribution file/);
});
