import { SaxesParser } from 'saxes';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { requestBytes } from './http.js';

export function parseXmltvDate(input) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/.exec(String(input).trim());
  if (!match) throw new TypeError('XMLTV date tidak valid.');
  const [, year, month, day, hour, minute, second, sign, offsetHour = '0', offsetMinute = '0'] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  if (+offsetHour > 23 || +offsetMinute > 59 || +month < 1 || +month > 12 || +day < 1 || +day > 31 || +hour > 23 || +minute > 59 || +second > 59) throw new TypeError('XMLTV date di luar rentang.');
  const utc = new Date(0); utc.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); utc.setUTCHours(...parts.slice(3), 0);
  if (utc.getUTCMonth() !== +month - 1 || utc.getUTCDate() !== +day) throw new TypeError('XMLTV date di luar rentang.');
  const offset = (+offsetHour * 60 + +offsetMinute) * 60000 * (sign === '-' ? -1 : 1);
  return (utc.getTime() - offset) / 1000;
}
export async function parseXmltv(raw, now = Date.now() / 1000, { signal } = {}) {
  const result = {};
  const parser = new SaxesParser();
  let programme, readingTitle = false, depth = 0;
  parser.on('doctype', () => { throw new TypeError('DOCTYPE XMLTV tidak diperbolehkan.'); });
  parser.on('opentag', (tag) => {
    depth++; if (depth > 64) throw new RangeError('XMLTV terlalu dalam.');
    if (tag.name === 'programme') programme = { ...tag.attributes, title: '' };
    if (tag.name === 'title' && programme && !programme.title) readingTitle = true;
  });
  const append = (value) => { if (readingTitle && programme) { programme.title += value; if (programme.title.length > 4096) programme.title = programme.title.slice(0, 4096); } };
  parser.on('text', append); parser.on('cdata', append);
  parser.on('closetag', (tag) => {
    depth--;
    if (tag.name === 'title') readingTitle = false;
    if (tag.name !== 'programme' || !programme) return;
    try {
      if (parseXmltvDate(programme.start) <= now && now < parseXmltvDate(programme.stop) && programme.channel && !Object.hasOwn(result, programme.channel) && programme.title.trim()) {
        Object.defineProperty(result, programme.channel, { value: programme.title.trim(), enumerable: true, configurable: true });
      }
    } catch { /* Invalid per-programme timestamps must not discard the guide. */ }
    programme = undefined;
  });
  const decoder = new TextDecoder('utf-8');
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  for (let i = 0; i < buffer.length; i += 65536) {
    signal?.throwIfAborted(); parser.write(decoder.decode(buffer.subarray(i, i + 65536), { stream: true })); await yieldLoop();
  }
  parser.write(decoder.decode()).close();
  return result;
}
export async function fetchXmltvNowPlaying(url, { signal, now } = {}) {
  const response = await requestBytes(url, { maximum: 32 * 1024 * 1024, expandedMaximum: 64 * 1024 * 1024, timeout: 15000, signal });
  return parseXmltv(response.data, now, { signal });
}
