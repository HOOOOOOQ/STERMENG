import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Auth, COOKIE, cookies, checkOrigin } from '../src/security.js';
import { redact } from '../src/log.js';
import { temporary } from './helpers.js';

test('bootstrap password stays private and stable across restarts', async (t) => {
  const directory = await temporary(t), auth = await Auth.create('', directory);
  const password = (await readFile(path.join(directory, 'initial-password'), 'utf8')).trim();
  assert.ok(password.length >= 24); assert.equal((await stat(path.join(directory, 'initial-password'))).mode & 0o777, 0o600);
  const token = await auth.login(password, 'one'); assert.equal(auth.authenticated({ headers: { cookie: `${COOKIE}=${token}` } }), true);
  const second = await Auth.create('', directory); await second.login(password, 'two');
  assert.equal((await readFile(path.join(directory, 'initial-password'), 'utf8')).trim(), password);
  auth.revoke(token); assert.equal(auth.authenticated({ headers: { cookie: `${COOKIE}=${token}` } }), false);
});
test('wrong passwords are limited; sessions expire and token map is bounded', async (t) => {
  const directory = await temporary(t), auth = await Auth.create('correct', directory);
  for (let index = 0; index < 5; index++) await assert.rejects(() => auth.login('wrong', 'abuse'), { status: 401 });
  await assert.rejects(() => auth.login('correct', 'abuse'), { status: 429 });
  const token = await auth.login('correct', 'normal'); auth.sessions.set(token, Date.now() - 1);
  assert.equal(auth.authenticated({ headers: { cookie: `${COOKIE}=${token}` } }), false);
  for (let index = 0; index < 128; index++) auth.sessions.set(String(index), Date.now() + 10000);
  await auth.login('correct', 'normal'); assert.equal(auth.sessions.size, 128);
});
test('origin matches exact request host/port, including preview and IPv6', () => {
  for (const host of ['8080-sandbox.e2b.app', '[::1]:8080', 'media.example.com']) checkOrigin({ headers: { host, origin: `https://${host}` } });
  for (const origin of ['null', 'https://attacker.invalid', 'file://media.example.com', 'https://media.example.com/path', 'https://media.example.com:8443']) assert.throws(() => checkOrigin({ headers: { host: 'media.example.com', origin } }), { status: 403 });
  checkOrigin({ headers: { host: 'media.example.com' } });
});
test('cookie parser tolerates malformed input without authenticating it', () => {
  assert.deepEqual(cookies({ headers: { cookie: 'foo=bar; bad=%zz; other=one%20two' } }), { foo: 'bar', other: 'one two' });
});
test('redaction removes provider URL paths/query/userinfo and configured secrets', () => {
  const output = redact('Failed https://user:pass@provider.invalid/private/token?key=secret SECRET', { DISCORD_BOT_TOKEN: 'SECRET' });
  assert.equal(output, 'Failed https://provider.invalid/[redacted] [redacted]');
});
