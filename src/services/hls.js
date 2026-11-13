import { requestBytes } from './http.js';
import { validateUrl } from '../config.js';
export function highestVariant(text, master) {
  if (!text.includes('#EXTM3U') || !text.includes('#EXT-X-STREAM-INF')) return master;
  const lines = text.split(/\r?\n/); let best = master, bandwidth = -1;
  lines.forEach((line, index) => {
    if (!line.trim().startsWith('#EXT-X-STREAM-INF:')) return;
    const rate = Number(/(?:^|[,:])BANDWIDTH=(\d+)/i.exec(line)?.[1] || 0);
    const next = lines[index + 1]?.trim();
    if (rate > bandwidth && next && !next.startsWith('#')) {
      try { best = validateUrl(new URL(next, master).href, true); bandwidth = rate; } catch { /* invalid variant */ }
    }
  });
  return best;
}
export async function extractHlsVariantUrl(master, { signal } = {}) {
  try {
    const response = await requestBytes(master, { maximum: 8192, prefix: true, timeout: 10000, signal });
    return highestVariant(response.data.toString('utf8'), master);
  } catch (error) { if (signal?.aborted) throw error; return master; }
}
