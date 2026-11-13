import http from 'node:http';
import https from 'node:https';
import { gunzip as unzip } from 'node:zlib';
import { promisify } from 'node:util';
import { validateUrl } from '../config.js';
import { MediaError } from '../errors.js';

const gunzip = promisify(unzip);
export async function requestBytes(input, { method = 'GET', headers = {}, json, maximum = 8 * 1024 * 1024, expandedMaximum = maximum, timeout = 15000, signal, prefix = false, redirects = 5 } = {}) {
  const url = new URL(validateUrl(input, true));
  const authentication = url.username || url.password ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}` : undefined;
  url.username = ''; url.password = '';
  const payload = json === undefined ? undefined : Buffer.from(JSON.stringify(json));
  const combined = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
  const requestHeaders = { 'User-Agent': '666-streaming/2.0', 'Accept-Encoding': 'identity', ...(authentication ? { Authorization: authentication } : {}), ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}) };
  try {
    return await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, { method, headers: requestHeaders, signal: combined }, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          if (redirects <= 0) { reject(new MediaError('Terlalu banyak redirect provider.')); return; }
          const destination = new URL(response.headers.location, url);
          const forwarded = { ...headers };
          if (destination.origin !== url.origin) {
            for (const key of Object.keys(forwarded)) if (/^(authorization|cookie)$/i.test(key)) delete forwarded[key];
          } else if (authentication) forwarded.Authorization = authentication;
          const get = response.statusCode === 303 || ([301, 302].includes(response.statusCode) && method === 'POST');
          resolve(requestBytes(destination.href, { method: get ? 'GET' : method, headers: forwarded, json: get ? undefined : json, maximum, expandedMaximum, timeout, signal: combined, prefix, redirects: redirects - 1 }));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) { response.resume(); reject(new MediaError(`Provider mengembalikan HTTP ${response.statusCode}.`)); return; }
        const buffers = []; let size = 0; let settled = false;
        const finish = async () => {
          if (settled) return; settled = true;
          try {
            let data = Buffer.concat(buffers);
            if (!prefix && data[0] === 0x1f && data[1] === 0x8b) data = await gunzip(data, { maxOutputLength: expandedMaximum });
            if (data.length > expandedMaximum) throw new MediaError('Respons provider terlalu besar.');
            const effectiveUrl = new URL(url.href);
            // urllib/urljoin in the original retained URL Basic credentials for
            // relative M3U/EPG references. Keep that behavior server-side, also
            // after a same-origin redirect. Cross-origin redirects strip auth.
            const auth = Object.entries(requestHeaders).find(([key]) => key.toLowerCase() === 'authorization')?.[1];
            if (typeof auth === 'string' && auth.startsWith('Basic ')) {
              const credentials = Buffer.from(auth.slice(6), 'base64').toString('utf8'), colon = credentials.indexOf(':');
              if (colon >= 0) { effectiveUrl.username = credentials.slice(0, colon); effectiveUrl.password = credentials.slice(colon + 1); }
            }
            resolve({ data, headers: response.headers, url: effectiveUrl.href });
          } catch { reject(new MediaError('Respons terkompresi provider rusak atau terlalu besar.')); }
        };
        response.on('data', (chunk) => {
          if (settled) return;
          size += chunk.length;
          if (size > maximum) {
            if (prefix) {
              const remaining = maximum - (size - chunk.length);
              if (remaining > 0) buffers.push(chunk.subarray(0, remaining));
              void finish(); response.destroy();
            } else { settled = true; reject(new MediaError('Respons provider terlalu besar.')); response.destroy(); }
          } else buffers.push(chunk);
        });
        response.once('end', finish);
        response.once('error', (error) => { if (!settled) reject(error); });
        response.once('aborted', () => { if (!settled) reject(new MediaError('Respons provider terputus.')); });
      });
      request.once('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof MediaError) throw error;
    throw new MediaError('Provider tidak dapat dihubungi atau melewati batas waktu.');
  }
}
export async function requestJson(url, options) {
  const response = await requestBytes(url, options);
  try { return JSON.parse(response.data.toString('utf8')); }
  catch { throw new MediaError('Provider mengembalikan JSON tidak valid.'); }
}
