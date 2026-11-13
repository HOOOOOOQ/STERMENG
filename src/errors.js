export class HttpError extends Error {
  constructor(status, message) { super(message); this.name = 'HttpError'; this.status = status; }
}
// Only this error and validated input errors may cross the public API boundary.
export class MediaError extends Error {
  constructor(message) { super(message); this.name = 'MediaError'; }
}
export function requiredText(data, key, limit = 200) {
  const value = data?.[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw new TypeError(`${key} wajib diisi (maksimum ${limit} karakter).`);
  return value.trim();
}
export function objectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Body harus berupa objek JSON.');
  return value;
}
