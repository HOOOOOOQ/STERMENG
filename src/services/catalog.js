import { createHash } from 'node:crypto';
import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { MEDIA_EXTENSIONS, validateUrl, within } from '../config.js';
import { SourceStore } from '../storage.js';
import { Mutex } from '../async.js';
import { MediaError } from '../errors.js';
import { fetchM3u, backfillEpgUrls } from './m3u.js';
import { fetchXmltvNowPlaying } from './epg.js';
import { TVheadendClient } from './tvheadend.js';
import { JellyfinClient } from './jellyfin.js';

export const channelKey = (source, name, url) => createHash('sha256').update(`${source}\0${name}\0${url}`).digest('hex').slice(0, 24);
export class Catalog {
  constructor(settings, sources) {
    this.settings = settings; this.sources = sources;
    this.tvh = TVheadendClient.fromEnv(settings.env); this.jellyfin = JellyfinClient.fromEnv(settings.env);
    this.channels = new Map(); this.epg = new Map(); this.cache = { at: 0, data: {} }; this.channelLock = new Mutex(); this.controller = new AbortController();
  }
  static async open(settings) { return new Catalog(settings, await SourceStore.open(path.join(settings.dataDir, 'sources.json'))); }
  options(signal) { return { signal: AbortSignal.any([this.controller.signal, ...(signal ? [signal] : [])]) }; }
  invalidate() { this.cache.at = 0; }
  start() { this.backfill = backfillEpgUrls(this.sources, this.options()).then(() => this.invalidate()).catch(() => {}); }
  async close() { this.controller.abort(); await this.backfill; }
  async localPath(relative) {
    if (typeof relative !== 'string' || !relative || relative.length > 1024 || relative.includes('\0') || path.isAbsolute(relative)) throw new TypeError('Path media tidak valid.');
    const candidate = path.resolve(this.settings.mediaDir, relative);
    if (!within(this.settings.mediaDir, candidate)) throw new TypeError('Path berada di luar MEDIA_DIR.');
    try {
      const resolved = await realpath(candidate);
      if (!within(this.settings.mediaDir, resolved)) throw new TypeError('Path berada di luar MEDIA_DIR.');
      if (!MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase()) || !(await stat(resolved)).isFile()) throw new TypeError('Format media tidak didukung.');
      return resolved;
    } catch (error) { if (error instanceof TypeError) throw error; throw new TypeError('File media tidak ditemukan atau format tidak didukung.', { cause: error }); }
  }
  async localFiles() {
    const result = []; let visited = 0;
    const visit = async (directory) => {
      const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (result.length >= 1000 || visited++ >= 20000) return;
        const absolute = path.join(directory, entry.name);
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) { await visit(absolute); continue; }
        if (!MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
        const relative = path.relative(this.settings.mediaDir, absolute).split(path.sep).join('/');
        try {
          const resolved = await this.localPath(relative), details = await stat(resolved);
          result.push({ kind: 'local', path: relative, title: path.parse(entry.name).name, extension: path.extname(entry.name).slice(1).toUpperCase(), size: details.size });
        } catch { /* Escaping symlinks and vanished files are not exposed. */ }
      }
    };
    await visit(this.settings.mediaDir); return result;
  }
  sourceList() { return this.sources.getSources().map((source, index) => ({ index, name: source.name, enabled: source.enabled ?? false, channels: source.channels?.length || 0 })); }
  async addSource(name, url, { signal } = {}) {
    validateUrl(url, true);
    try {
      const result = await fetchM3u(url, this.options(signal));
      await this.sources.add(name, url, result.channels.slice(0, 10000), result.epgUrl);
      this.invalidate();
    } catch (error) {
      if (signal?.aborted || error instanceof TypeError || error instanceof RangeError) throw error;
      throw new MediaError('Playlist tidak dapat diambil. Periksa URL/koneksi provider.');
    }
  }
  async channelList(refresh = false, { signal } = {}) {
    return this.channelLock.run(async () => {
      this.controller.signal.throwIfAborted(); signal?.throwIfAborted();
      if (!refresh && Date.now() - this.cache.at < 60000) return this.cache.data;
      const items = [], warnings = [], internal = new Map(), guide = {};
      for (const [name, url] of this.sources.epgSources()) {
        let cached = this.epg.get(name) || { at: 0, data: {} };
        if (Date.now() - cached.at > 900000) {
          try { cached = { at: Date.now(), data: await fetchXmltvNowPlaying(url, this.options(signal)) }; this.epg.set(name, cached); }
          catch (error) { if (this.controller.signal.aborted || signal?.aborted) throw error; warnings.push(`EPG ${name} tidak tersedia.`); }
        }
        Object.assign(guide, cached.data);
      }
      for (const channel of this.sources.iptvChannels()) {
        const id = channelKey(channel.source, channel.name, channel.stream_url);
        internal.set(id, { ...channel, provider: 'iptv' });
        items.push({ id, title: channel.name, kind: 'channel', group: channel.group || '', provider: 'iptv', source: channel.source, now_playing: Object.hasOwn(guide, channel.tvg_id) ? guide[channel.tvg_id] : '' });
      }
      if (this.tvh && this.sources.tvhEnabled) {
        const [channels, nowPlaying] = await Promise.allSettled([this.tvh.getChannels(this.options(signal)), this.tvh.getNowPlaying(this.options(signal))]);
        if (channels.status === 'rejected') warnings.push('TVheadend tidak terhubung. Sumber IPTV lain tetap tersedia.');
        else for (const channel of channels.value) {
          const id = channelKey('tvheadend', channel.name, channel.uuid);
          internal.set(id, { ...channel, provider: 'tvheadend', stream_url: this.tvh.streamUrl(channel.uuid) });
          items.push({ id, title: channel.name, kind: 'channel', provider: 'tvheadend', source: 'TVheadend', group: 'TVheadend', number: channel.number, now_playing: nowPlaying.status === 'fulfilled' && Object.hasOwn(nowPlaying.value, channel.uuid) ? nowPlaying.value[channel.uuid] : '' });
        }
      }
      this.controller.signal.throwIfAborted(); signal?.throwIfAborted();
      this.channels = internal; const data = { items, warnings }; this.cache = { at: Date.now(), data }; return data;
    });
  }
  async validateDescriptor(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Media harus berupa objek JSON.');
    const kind = data.kind ?? 'url', title = data.title ?? '';
    if (typeof title !== 'string' || title.length > 200) throw new TypeError('Judul maksimum 200 karakter.');
    const result = { kind, title: title.trim() };
    if (kind === 'url') result.url = validateUrl(data.url);
    else if (kind === 'local') { await this.localPath(data.path); result.path = data.path; }
    else if (['channel', 'jellyfin'].includes(kind)) {
      if (typeof data.id !== 'string' || !/^[a-zA-Z0-9]{1,128}$/.test(data.id)) throw new TypeError('ID media tidak valid.');
      result.id = data.id;
    } else throw new TypeError('Jenis sumber media tidak didukung.');
    return result;
  }
  async resolve(descriptor, { signal } = {}) {
    if (descriptor.kind === 'local') {
      const source = await this.localPath(descriptor.path); return { source, title: descriptor.title || path.parse(source).name, live: false };
    }
    if (descriptor.kind === 'channel') {
      await this.channelList(false, { signal }); // honor source toggles even for an already-known ID
      const channel = this.channels.get(descriptor.id);
      if (!channel) throw new MediaError('Channel tidak tersedia. Muat ulang daftar IPTV.');
      return { source: validateUrl(channel.stream_url), title: channel.name, live: true };
    }
    if (descriptor.kind === 'jellyfin') {
      if (!this.jellyfin) throw new MediaError('Jellyfin belum dikonfigurasi di environment server.');
      return { source: await this.jellyfin.getStreamUrl(descriptor.id, this.options(signal)), title: descriptor.title || 'Jellyfin media', live: false };
    }
    return { source: descriptor.url, title: descriptor.title || 'URL stream', live: null };
  }
}
