import { HttpError } from '../errors.js';
export const Role = Object.freeze({ NONE: 0, VIEWER: 4, OPERATOR: 6, ADMIN: 7 });
export function loadIds(env, name) {
  const raw = String(env[name] || '').trim(); if (!raw) return new Set();
  const values = raw.split(',').map((part) => part.trim());
  if (values.some((part) => !/^[0-9]{1,22}$/.test(part) || BigInt(part) <= 0n)) throw new TypeError(`${name} harus berisi Discord ID yang dipisahkan koma.`);
  return new Set(values); // never coerce snowflakes to Number
}
export function userRole(bot, userId, member = false) {
  if (bot.adminIds.has(userId)) return Role.ADMIN;
  if (bot.operatorIds.has(userId)) return Role.OPERATOR;
  return member ? Role.VIEWER : Role.NONE;
}
export function requireRole(bot, interaction, role) {
  if (!interaction.guildId) throw new HttpError(403, 'Gunakan perintah ini di server Discord.');
  if ((userRole(bot, interaction.user.id, Boolean(interaction.member)) & role) !== role) throw new HttpError(403, 'Akses ditolak. Administrator host harus menambahkan ID Anda ke allowlist yang sesuai.');
}
