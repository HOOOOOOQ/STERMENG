import { validateUrl } from '../config.js';
import { requestJson } from './http.js';
export class TVheadendClient {
  constructor(url, user, password) {
    this.baseUrl = validateUrl(url.replace(/\/+$/, ''), true);
    this.user = user; this.password = password;
    this.headers = { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` };
    this.nowPlayingCache = { at: 0, data: {} };
  }
  async request(endpoint, params, options) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return requestJson(url.href, { headers: this.headers, ...options });
  }
  async getChannels(options) {
    const data = await this.request('api/channel/grid', { limit: 99999 }, options);
    return (data.entries || []).filter((item) => item.enabled !== false).sort((a, b) => (a.number ?? 999999) - (b.number ?? 999999));
  }
  async getEpgEvents(query, limit = 100, options) {
    const data = await this.request('api/epg/events/grid', { limit, title: query }, options);
    return (data.entries || []).filter((item) => (item.title || '').toLowerCase().includes(query.toLowerCase()));
  }
  async getNowPlaying(options) {
    if (Date.now() - this.nowPlayingCache.at < 60000) return this.nowPlayingCache.data;
    const data = await this.request('api/epg/events/grid', { limit: 10000 }, options);
    const now = Date.now() / 1000; const result = {};
    for (const item of data.entries || []) if (item.start <= now && now < item.stop && item.channelUuid && !Object.hasOwn(result, item.channelUuid)) Object.defineProperty(result, item.channelUuid, { value: item.title || '', enumerable: true });
    this.nowPlayingCache = { at: Date.now(), data: result }; return result;
  }
  streamUrl(uuid) {
    const url = new URL(this.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/stream/channel/${encodeURIComponent(uuid)}`;
    url.username = this.user; url.password = this.password;
    url.search = ''; url.hash = ''; return url.href;
  }
  static fromEnv(env = process.env) { return env.TVHEADEND_URL && env.TVHEADEND_USER && env.TVHEADEND_PASS ? new TVheadendClient(env.TVHEADEND_URL, env.TVHEADEND_USER, env.TVHEADEND_PASS) : null; }
}
