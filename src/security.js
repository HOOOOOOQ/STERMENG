import { randomBytes, pbkdf2 as callbackHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './errors.js';
import { log } from './log.js';

const hash = promisify(callbackHash);
export const COOKIE = 'streaming666_session';
export function cookies(request) {
  const result = {};
  for (const entry of (request.headers.cookie || '').split(';')) {
    const index = entry.indexOf('=');
    if (index < 0) continue;
    try { result[entry.slice(0, index).trim()] = decodeURIComponent(entry.slice(index + 1).trim()); } catch { /* malformed cookie */ }
  }
  return result;
}
export function checkOrigin(request) {
  const value = request.headers.origin;
  if (!value) return;
  try {
    const origin = new URL(value);
    if (['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host && origin.origin === value) return;
  } catch { /* rejected below */ }
  throw new HttpError(403, 'Permintaan lintas origin ditolak.');
}
export class Auth {
  constructor(salt, digest) {
    this.salt = salt; this.digest = digest;
    this.sessions = new Map(); this.attempts = new Map(); this.activeHashes = 0;
  }
  static async create(password, dataDir) {
    if (!password) {
      const filename = path.join(dataDir, 'initial-password');
      try { password = (await readFile(filename, 'utf8')).trim(); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        password = randomBytes(24).toString('base64url');
        try { await writeFile(filename, `${password}\n`, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; password = (await readFile(filename, 'utf8')).trim(); }
      }
      if (!password) throw new TypeError('File initial-password kosong; isi APP_PASSWORD atau pulihkan file.');
      await chmod(filename, 0o600);
      log.warn('APP_PASSWORD belum diset. Password awal ada di DATA_DIR/initial-password; hanya administrator host boleh membacanya.');
    }
    if (typeof password !== 'string' || password.length > 1024) throw new TypeError('APP_PASSWORD maksimum 1024 karakter.');
    const salt = randomBytes(32);
    return new Auth(salt, await hash(password, salt, 200000, 32, 'sha256'));
  }
  async login(password, remote) {
    const now = Date.now();
    if (this.attempts.size >= 4096 && !this.attempts.has(remote)) this.attempts.delete(this.attempts.keys().next().value);
    const attempts = (this.attempts.get(remote) || []).filter((stamp) => stamp > now - 60000);
    this.attempts.set(remote, attempts);
    if (attempts.length >= 5 || this.activeHashes >= 8) throw new HttpError(429, 'Terlalu banyak percobaan. Tunggu 1 menit.');
    attempts.push(now);
    this.activeHashes++;
    let digest;
    try { digest = await hash(password, this.salt, 200000, 32, 'sha256'); } finally { this.activeHashes--; }
    if (!timingSafeEqual(digest, this.digest)) throw new HttpError(401, 'Password tidak sesuai.');
    for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
    if (this.sessions.size >= 128) this.sessions.delete(this.sessions.keys().next().value);
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, Date.now() + 86400000);
    this.attempts.delete(remote);
    return token;
  }
  authenticated(request) { return (this.sessions.get(cookies(request)[COOKIE]) || 0) > Date.now(); }
  revoke(token) { this.sessions.delete(token); }
}
