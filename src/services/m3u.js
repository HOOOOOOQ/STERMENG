import { requestBytes } from './http.js';
import { validateUrl } from '../config.js';

export function parseAttributes(line) { return Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])); }
export function epgUrl(text) {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]?.trim() || '';
  if (!header.startsWith('#EXTM3U')) return null;
  const attributes = parseAttributes(header);
  return attributes['url-tvg'] || attributes['x-tvg-url'] || null;
}
export function parseM3u(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines[0]?.trim().startsWith('#EXTM3U')) throw new TypeError('Playlist M3U tidak valid (header #EXTM3U tidak ditemukan).');
  const channels = []; let pending;
  for (const raw of lines.slice(1)) {
    const line = raw.trim(); if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const attributes = parseAttributes(line);
      // The display-name comma is outside quoted attributes (group names may contain commas).
      let quoted = false, comma = -1;
      for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; if (!quoted && line[i] === ',') { comma = i; break; } }
      pending = { name: (comma < 0 ? '' : line.slice(comma + 1).trim()) || attributes['tvg-name'] || 'unknown', tvg_id: attributes['tvg-id'] || '', group: attributes['group-title'] || '' };
    } else if (!line.startsWith('#') && pending) { channels.push({ ...pending, stream_url: line }); pending = undefined; }
  }
  return channels;
}
export async function fetchM3u(url, { signal } = {}) {
  validateUrl(url, true);
  const response = await requestBytes(url, { timeout: 30000, signal });
  const text = response.data.toString('utf8');
  const channels = parseM3u(text).map((channel) => ({ ...channel, stream_url: validateUrl(new URL(channel.stream_url, response.url).href) }));
  const rawEpg = epgUrl(text);
  return { channels, epgUrl: rawEpg ? validateUrl(new URL(rawEpg, response.url).href, true) : null };
}
export async function backfillEpgUrls(store, { signal } = {}) {
  const updates = [];
  for (const source of store.getSources()) {
    if (source.epg_url) continue;
    try {
      const response = await requestBytes(source.url, { maximum: 1024, prefix: true, timeout: 10000, signal });
      const raw = epgUrl(response.data.toString('utf8'));
      if (raw) updates.push([source.name, source.url, validateUrl(new URL(raw, response.url).href, true)]);
    } catch (error) { if (signal?.aborted) throw error; }
  }
  if (updates.length) await store.update((next) => {
    for (const [name, url, epg] of updates) {
      const current = next.sources.find((entry) => entry.name === name && entry.url === url);
      if (current && !current.epg_url) current.epg_url = epg;
    }
  });
  return updates.length;
}
