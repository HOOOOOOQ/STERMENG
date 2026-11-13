import { mkdir, open, rename, link, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Mutex } from './async.js';

export async function atomicJson(filename, value, { overwrite = true } = {}) {
  const text = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('JSON tidak boleh mengandung angka non-finite.');
    return item;
  }, 2) + '\n';
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(filename), `.save-${randomUUID()}`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    if (overwrite) await rename(temporary, filename);
    else await link(temporary, filename); // same filesystem, atomic and NO clobber (including symlinks)
  } finally { await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}
export function validatePlaylists(value) {
  if (!Array.isArray(value)) throw new TypeError('Playlist data must be a list.');
  const seen = new Set();
  const references = { url: 'url', local: 'path', channel: 'id', jellyfin: 'id' };
  for (const playlist of value) {
    if (!playlist || typeof playlist !== 'object' || !['id', 'name'].every((key) => typeof playlist[key] === 'string' && playlist[key].trim())) throw new TypeError('Every playlist needs an id and name.');
    if (seen.has(playlist.id) || !Array.isArray(playlist.items)) throw new TypeError('Playlist ids must be unique and items must be a list.');
    seen.add(playlist.id);
    for (const item of playlist.items) {
      if (!item || typeof item !== 'object' || typeof (item.title ?? '') !== 'string') throw new TypeError('Playlist items must be media objects.');
      const kind = item.kind ?? 'url';
      const key = typeof kind === 'string' && Object.hasOwn(references, kind) ? references[kind] : undefined;
      if (!key || typeof item[key] !== 'string' || !item[key]) throw new TypeError('Playlist item has no supported media reference.');
    }
  }
  return value;
}
export function validateSources(value) {
  let sources, tvhEnabled;
  if (Array.isArray(value)) { sources = value; tvhEnabled = true; }
  else if (value && Array.isArray(value.sources)) { sources = value.sources; tvhEnabled = value.tvh_enabled ?? true; }
  else throw new TypeError('Source data must contain a list of sources.');
  if (typeof tvhEnabled !== 'boolean') throw new TypeError('TVheadend enabled state must be a boolean.');
  for (const source of sources) {
    if (!source || !['name', 'url'].every((key) => typeof source[key] === 'string' && source[key].trim())) throw new TypeError('Every source needs a name and URL.');
    if (source.enabled !== undefined && typeof source.enabled !== 'boolean') throw new TypeError('Source enabled state must be boolean.');
    if (source.epg_url !== undefined && typeof source.epg_url !== 'string') throw new TypeError('EPG URL must be a string.');
    if (source.channels !== undefined && !Array.isArray(source.channels)) throw new TypeError('Source channels must be a list.');
    for (const channel of source.channels || []) {
      if (!channel || !['name', 'stream_url'].every((key) => typeof channel[key] === 'string' && channel[key].trim())) throw new TypeError('Every channel needs a name and stream URL.');
    }
  }
  return { sources, tvhEnabled };
}
async function load(filename, validate, fallback, message) {
  try { return validate(JSON.parse(await readFile(filename, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new TypeError(message, { cause: error }); }
}
export class PlaylistStore {
  constructor(filename, playlists) { this.filename = filename; this.playlists = playlists; this.lock = new Mutex(); }
  static async open(filename) { return new PlaylistStore(filename, await load(filename, validatePlaylists, [], 'File playlist rusak; pulihkan dari backup.')); }
  async update(operation) {
    return this.lock.run(async () => {
      const next = structuredClone(this.playlists);
      const result = await operation(next);
      validatePlaylists(next);
      await atomicJson(this.filename, next);
      this.playlists = next; return result;
    });
  }
}
export class SourceStore {
  constructor(filename, { sources = [], tvhEnabled = true } = {}) { this.filename = filename; this.sources = sources; this.tvhEnabled = tvhEnabled; this.lock = new Mutex(); }
  static async open(filename) { return new SourceStore(filename, await load(filename, validateSources, {}, 'File sumber IPTV rusak; pulihkan dari backup.')); }
  getSources() { return structuredClone(this.sources); }
  iptvChannels() { return this.sources.filter((source) => source.enabled).flatMap((source) => (source.channels || []).map((channel) => ({ ...channel, source: source.name }))); }
  epgSources() { return this.sources.filter((source) => source.enabled && source.epg_url).map((source) => [source.name, source.epg_url]); }
  async update(operation) {
    return this.lock.run(async () => {
      const next = { sources: structuredClone(this.sources), tvh_enabled: this.tvhEnabled };
      const result = await operation(next);
      validateSources(next); await atomicJson(this.filename, next);
      this.sources = next.sources; this.tvhEnabled = next.tvh_enabled; return result;
    });
  }
  async add(name, url, channels, epgUrl) {
    return this.update((next) => {
      const index = next.sources.findIndex((source) => source.name.toLowerCase() === name.toLowerCase());
      if (index < 0 && next.sources.length >= 50) throw new RangeError('Maksimum 50 sumber IPTV.');
      const entry = { name, url, channels, enabled: index < 0 ? true : (next.sources[index].enabled ?? false) };
      if (epgUrl) entry.epg_url = epgUrl;
      if (index < 0) next.sources.push(entry); else next.sources[index] = entry;
    });
  }
  async setEnabled(index, enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled harus true atau false.');
    return this.update((next) => { if (!next.sources[index]) throw new RangeError('Sumber tidak ditemukan.'); next.sources[index].enabled = enabled; });
  }
  async remove(index) {
    return this.update((next) => { if (!next.sources[index]) throw new RangeError('Sumber tidak ditemukan.'); return next.sources.splice(index, 1)[0].name; });
  }
  async setTvhEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled harus true atau false.');
    return this.update((next) => { next.tvh_enabled = enabled; });
  }
}
