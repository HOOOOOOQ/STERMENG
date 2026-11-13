import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, stat, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { atomicJson, validatePlaylists, validateSources, SourceStore, PlaylistStore } from '../src/storage.js';
import { migrate } from '../scripts/migrate-data.mjs';
import { temporary } from './helpers.js';

const original = [{ name: 'Original', url: 'http://provider.invalid/private', enabled: true, channels: [{ name: 'TV', stream_url: 'http://provider.invalid/live', tvg_id: 'tv', group: 'News' }] }];
test('atomic private JSON refuses overwrite when requested (including dangling symlink)', async (t) => {
  const directory = await temporary(t), filename = path.join(directory, 'sources.json');
  await atomicJson(filename, original); assert.equal((await stat(filename)).mode & 0o777, 0o600);
  await assert.rejects(() => atomicJson(filename, [], { overwrite: false }), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), original);
  await symlink(path.join(directory, 'nonexistent'), path.join(directory, 'link.json'));
  await assert.rejects(() => atomicJson(path.join(directory, 'link.json'), [], { overwrite: false }), { code: 'EEXIST' });
  await assert.rejects(() => atomicJson(filename, { value: NaN }), /non-finite/);
});
test('legacy source list migrates in place without losing enable state, EPG or channel IDs', async (t) => {
  const directory = await temporary(t), filename = path.join(directory, 'sources.json');
  await writeFile(filename, JSON.stringify(original)); const store = await SourceStore.open(filename);
  assert.equal(store.tvhEnabled, true); assert.equal(store.iptvChannels()[0].source, 'Original');
  await store.setEnabled(0, false); await store.add('ORIGINAL', 'http://provider.invalid/new', original[0].channels, 'http://provider.invalid/epg');
  assert.equal(store.getSources().length, 1); assert.equal(store.getSources()[0].enabled, false);
  assert.deepEqual(store.iptvChannels(), []); await store.setEnabled(0, true);
  assert.deepEqual(store.epgSources(), [['ORIGINAL', 'http://provider.invalid/epg']]);
  await store.setTvhEnabled(false); assert.equal((await SourceStore.open(filename)).tvhEnabled, false);
  assert.equal(await store.remove(0), 'ORIGINAL'); assert.equal(store.getSources().length, 0);
});
test('concurrent source/playlist writes serialize and failed edits roll back memory', async (t) => {
  const directory = await temporary(t), source = await SourceStore.open(path.join(directory, 'sources.json'));
  await Promise.all(Array.from({ length: 20 }, (_, index) => source.add(`Source ${index}`, `https://provider.invalid/${index}`, [])));
  assert.equal(source.sources.length, 20); assert.equal((await SourceStore.open(source.filename)).sources.length, 20);
  await assert.rejects(() => source.setEnabled(0, 'yes')); assert.equal(source.sources[0].enabled, true);
  const playlist = await PlaylistStore.open(path.join(directory, 'playlists.json'));
  await Promise.all(Array.from({ length: 10 }, (_, index) => playlist.update((next) => next.push({ id: String(index), name: `List ${index}`, items: [] }))));
  assert.equal(playlist.playlists.length, 10);
  await assert.rejects(() => playlist.update((next) => next.push({ id: '0', name: 'Duplicate', items: [] })));
  assert.equal(playlist.playlists.length, 10);
});
for (const value of [null, {}, { sources: [], tvh_enabled: 1 }, [null], [{ name: 'bad' }], [{ name: 'bad', url: 'x', enabled: 'true' }], [{ name: 'bad', url: 'x', channels: [null] }]]) test(`source schema rejects ${JSON.stringify(value)}`, () => assert.throws(() => validateSources(value)));
for (const value of [null, {}, [null], [{ id: 'a', name: 'List', items: [{ kind: 'file', path: 'x' }] }], [{ id: 'a', name: 'List', items: [{ kind: 'url' }] }], [{ id: 'a', name: 'List', items: [] }, { id: 'a', name: 'Duplicate', items: [] }]]) test(`playlist schema rejects ${JSON.stringify(value)}`, () => assert.throws(() => validatePlaylists(value)));
test('corrupt stores fail closed, never replace original data with an empty store', async (t) => {
  const directory = await temporary(t);
  for (const [name, Store] of [['sources.json', SourceStore], ['playlists.json', PlaylistStore]]) {
    const filename = path.join(directory, name); await writeFile(filename, '{corrupt');
    await assert.rejects(() => Store.open(filename), /rusak/); assert.equal(await readFile(filename, 'utf8'), '{corrupt');
  }
});
test('data migration validates ALL inputs before copying, preserves originals, no-clobber', async (t) => {
  const directory = await temporary(t), source = path.join(directory, 'old'), target = path.join(directory, 'new'); await mkdir(source);
  await writeFile(path.join(source, 'sources.json'), JSON.stringify(original)); await writeFile(path.join(source, 'playlists.json'), '{}');
  await assert.rejects(() => migrate(source, target), /Invalid JSON/); await assert.rejects(() => stat(target), { code: 'ENOENT' });
  await writeFile(path.join(source, 'playlists.json'), JSON.stringify([{ id: 'p', name: 'Old list', items: [{ kind: 'local', path: 'video.mp4', title: 'Local' }] }]));
  assert.equal((await migrate(source, target)).length, 2); assert.deepEqual(JSON.parse(await readFile(path.join(target, 'sources.json'), 'utf8')), original);
  assert.equal((await stat(path.join(target, 'playlists.json'))).mode & 0o777, 0o600);
  assert.ok(await stat(path.join(source, 'sources.json'))); await assert.rejects(() => migrate(source, target), /Refusing to overwrite/);
});
