import { validateUrl } from '../config.js';
import { requestJson } from './http.js';
import { MediaError } from '../errors.js';

export function parseEpisodeQuery(query) {
  const match = /\bs(\d+)e(\d+)\b/i.exec(query);
  return match ? { show: query.slice(0, match.index).trim(), season: +match[1], episode: +match[2] } : { show: query, season: null, episode: null };
}
export function formatJellyfinItem(item) {
  const name = item.Name || 'Unknown';
  if (item.Type === 'Episode') {
    const code = item.ParentIndexNumber != null && item.IndexNumber != null ? `S${String(item.ParentIndexNumber).padStart(2, '0')}E${String(item.IndexNumber).padStart(2, '0')} — ` : '';
    return `${item.SeriesName || ''} — ${code}${name}`;
  }
  return item.ProductionYear ? `${name} (${item.ProductionYear})` : name;
}
export class JellyfinClient {
  constructor(url, apiKey) {
    this.baseUrl = validateUrl(url.replace(/\/+$/, ''), true); this.apiKey = apiKey; this.userId = null;
    this.headers = { Authorization: `MediaBrowser Token="${apiKey}"` };
  }
  async request(endpoint, params = {}, options = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return requestJson(url.href, { headers: this.headers, ...options });
  }
  async getUserId(options) {
    if (this.userId) return this.userId;
    const users = await this.request('Users', {}, options);
    this.userId = users?.[0]?.Id ?? null; return this.userId;
  }
  async getStreamUrl(itemId, options = {}) {
    let userId;
    try { userId = await this.getUserId(options); } catch (error) { if (options.signal?.aborted) throw error; }
    const json = {
      SubtitleStreamIndex: -1,
      DeviceProfile: {
        MaxStreamingBitrate: 8000000,
        TranscodingProfiles: [{ Container: 'ts', Type: 'Video', Protocol: 'hls', AudioCodec: 'aac', VideoCodec: 'h264', MaxAudioChannels: 2, Context: 'Streaming' }],
        DirectPlayProfiles: [], CodecProfiles: [], SubtitleProfiles: [],
      },
      ...(userId ? { UserId: userId } : {}),
    };
    const data = await this.request(`Items/${encodeURIComponent(itemId)}/PlaybackInfo`, { DeviceId: '666-streaming-discord-bot', ...(userId ? { userId } : {}) }, { ...options, method: 'POST', json });
    const source = data.MediaSources?.[0];
    const raw = source?.TranscodingUrl || source?.DirectStreamUrl;
    if (!raw) throw new MediaError('Jellyfin tidak mengembalikan URL playback.');
    const url = new URL(raw.startsWith('/') ? `${this.baseUrl}${raw}` : raw, `${this.baseUrl}/`);
    validateUrl(url.href, true);
    url.searchParams.set('SubtitleStreamIndex', '-1'); url.searchParams.set('api_key', this.apiKey);
    return url.href;
  }
  async search(query, options = {}) {
    const parsed = parseEpisodeQuery(query);
    if (parsed.season !== null) return this.findEpisode(parsed.show, parsed.season, parsed.episode, options);
    return this.searchRaw(query, options);
  }
  async searchRaw(query, options = {}) {
    const data = await this.request('Items', { searchTerm: query, Recursive: true, Limit: 25, IncludeItemTypes: 'Movie,Series,Episode', Fields: 'ProductionYear,SeriesName,SeasonName,IndexNumber,ParentIndexNumber' }, options);
    return data.Items || [];
  }
  async findEpisode(show, season, episode, options) {
    const results = await this.searchRaw(show, options); const matches = [];
    for (const series of results.filter((item) => item.Type === 'Series')) {
      const seasons = await this.getSeasons(series.Id, options);
      const target = seasons.find((item) => item.IndexNumber === season);
      if (!target) continue;
      const episodes = await this.getEpisodes(series.Id, target.Id, options);
      matches.push(...episodes.filter((item) => item.IndexNumber === episode));
    }
    return matches;
  }
  async getSeasons(seriesId, options) {
    const data = await this.request(`Shows/${encodeURIComponent(seriesId)}/Seasons`, { Fields: 'Id,Name,IndexNumber' }, options);
    return (data.Items || []).sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
  }
  async getEpisodes(seriesId, seasonId = '', options) {
    const data = await this.request(`Shows/${encodeURIComponent(seriesId)}/Episodes`, { ...(seasonId ? { SeasonId: seasonId } : {}), Fields: 'Id,Name,IndexNumber,ParentIndexNumber,SeriesName' }, options);
    return (data.Items || []).sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
  }
  static fromEnv(env = process.env) { return env.JELLYFIN_URL && env.JELLYFIN_API_KEY ? new JellyfinClient(env.JELLYFIN_URL, env.JELLYFIN_API_KEY) : null; }
}
