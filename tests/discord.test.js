// Unit/codec verification only. No claim of authenticated Discord transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import OpusScript from 'opusscript';
import { generateDependencyReport } from '@discordjs/voice';
import { GatewayIntentBits, MessageFlags } from 'discord.js';
import { Role, loadIds, userRole, requireRole } from '../src/discord/permissions.js';
import { StreamingBot, commandDefinitions, commandRole } from '../src/discord/bot.js';
import { VoiceController } from '../src/discord/voice.js';
import { awaitComponent, send } from '../src/discord/ui.js';
import { findChannel, selectGuideEvent } from '../src/discord/commands/tv.js';
import { testSettings, waitFor } from './helpers.js';

test('official discord.js v14 command payloads are valid and every original command family is mapped', () => {
  const commands = commandDefinitions(); const names = commands.map((command) => command.name);
  for (const name of ['ping', 'hello', 'help', 'join', 'leave', 'stop', 'play', 'channels', 'search', 'media', 'sources', 'add-source', 'delete-source']) assert.ok(names.includes(name));
  assert.equal(new Set(names).size, names.length); assert.equal(commandRole('play'), Role.OPERATOR); assert.equal(commandRole('add-source'), Role.ADMIN); assert.equal(commandRole('channels'), Role.VIEWER);
  for (const command of commands) { assert.ok(command.description.length < 101); assert.equal(command.dm_permission, false); }
});
test('snowflake allowlists are exact strings; invalid IDs fail closed', () => {
  const id = '1234567890123456789'; assert.equal(loadIds({ USERS: `${id},42` }, 'USERS').has(id), true);
  for (const input of ['0', '-1', '1.2', 'abc', '42,', '1e10']) assert.throws(() => loadIds({ USERS: input }, 'USERS'));
  const bot = { adminIds: new Set([id]), operatorIds: new Set(['42']) };
  assert.equal(userRole(bot, id), Role.ADMIN); assert.equal(userRole(bot, '42'), Role.OPERATOR); assert.equal(userRole(bot, '123', true), Role.VIEWER); assert.equal(userRole(bot, '123'), Role.NONE);
  assert.throws(() => requireRole(bot, { user: { id: '123' }, member: {}, guildId: 'g' }, Role.OPERATOR), { status: 403 });
  assert.throws(() => requireRole(bot, { user: { id } }, Role.ADMIN), { status: 403 });
  requireRole(bot, { user: { id }, guildId: 'g' }, Role.ADMIN);
});
test('bot instantiates without network, uses minimal official intents, and destroys without login', async (t) => {
  const settings = await testSettings(t, { ALLOWED_USER_IDS: '1234567890123456789' });
  const state = { settings, runtime: {}, media: {} }; const bot = new StreamingBot(state);
  assert.equal(bot.client.options.intents.has(GatewayIntentBits.Guilds), true); assert.equal(bot.client.options.intents.has(GatewayIntentBits.GuildVoiceStates), true);
  assert.equal(bot.client.options.intents.has(GatewayIntentBits.MessageContent), false); assert.equal(bot.client.options.intents.has(GatewayIntentBits.GuildMembers), false);
  await bot.close(); await bot.close(); assert.equal(state.runtime.discord, 'disabled');
});
test('permission denial never invokes playback or leaks secrets', async (t) => {
  const settings = await testSettings(t), bot = new StreamingBot({ settings, runtime: {}, media: {} });
  let response;
  await bot.handle({ commandName: 'play', guildId: 'g', member: {}, user: { id: '1' }, reply: async (payload) => { response = payload; } });
  assert.match(response.content, /Akses ditolak/); assert.equal(bot.voice.slots.size, 0); await bot.close();
});
test('component choice is cancellable immediately at shutdown instead of waiting for timeout', async () => {
  const controller = new AbortController(), collector = new EventEmitter();
  collector.stop = () => collector.emit('end', new Map());
  const message = { createMessageComponentCollector: () => collector };
  const pending = awaitComponent(message, {}, controller.signal); controller.abort(); await assert.rejects(pending, /ended/);
});
test('channel/EPG matching retains original number, substring, airing and 24h horizon behavior', () => {
  const channels = [{ title: 'News One', number: 1 }, { title: 'Sport', number: 2 }];
  assert.equal(findChannel(channels, '2').title, 'Sport'); assert.equal(findChannel(channels, 'news').number, 1); assert.equal(findChannel(channels, 'missing'), undefined);
  const events = [{ title: 'Future', start: 1200, stop: 1300 }, { title: 'Now', start: 900, stop: 1100 }, { title: 'Too late', start: 100000, stop: 101000 }];
  const result = selectGuideEvent(events, 1000); assert.equal(result.airing.title, 'Now'); assert.equal(result.upcoming.title, 'Future');
});
test('voice resolution reads voiceStates, missing voice is clear, and stop/leave clean without private connections', async () => {
  const controller = new VoiceController({});
  const channel = { id: 'voice' }, guild = { id: 'g', voiceStates: { cache: new Map([['user', { channel }]]) } };
  assert.equal(controller.resolve({ guild, user: { id: 'user' } }).channel, channel);
  assert.throws(() => controller.resolve({ guild, user: { id: 'missing' } }), /voice/);
  await controller.stop('g'); await controller.leave('g'); await controller.close();
});
test('EPG timer checks current voice state; cancelled schedules do not fire', async (t) => {
  const settings = await testSettings(t), bot = new StreamingBot({ settings, runtime: {}, media: {} });
  let notice = '', played = false;
  bot.voice.playIn = async () => { played = true; };
  const interaction = { guildId: 'g', user: { id: 'u', send: async ({ content }) => { notice = content; } } };
  bot.scheduleGuide(interaction, { kind: 'channel', id: 'a' }, Date.now() / 1000);
  await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(played, false); assert.match(notice, /dibatalkan/);
  bot.scheduleGuide(interaction, {}, Date.now() / 1000 + 100); bot.cancelSchedule('g'); assert.equal(bot.schedules.size, 0); await bot.close();
});
test('real PCM frames encode AND decode through the installed Opus implementation; DAVE dependency loads', () => {
  const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  const pcm = Buffer.alloc(960 * 2 * 2);
  for (let index = 0; index < 960; index++) { const sample = Math.round(Math.sin(index * 2 * Math.PI * 440 / 48000) * 10000); pcm.writeInt16LE(sample, index * 4); pcm.writeInt16LE(sample, index * 4 + 2); }
  try { const packet = encoder.encode(pcm, 960); assert.ok(packet.length > 0); const decoded = encoder.decode(packet); assert.equal(decoded.length, pcm.length); }
  finally { encoder.delete(); }
  const report = generateDependencyReport(); assert.match(report, /native crypto support for aes-256-gcm: yes/); assert.match(report, /@snazzah\/davey: 0\./);
});

test('all slash follow-ups stay ephemeral, not just the initial deferred reply', async () => {
  let response;
  await send({ replied: true, followUp: async (payload) => { response = payload; } }, 'Private watch URL');
  assert.equal(response.flags, MessageFlags.Ephemeral);
});
test('voice /stop preempts pending resolution instead of waiting for the guild lock (unit lifecycle)', async () => {
  const session = new EventEmitter(); session.id = 'pending'; session.controller = new AbortController();
  let resolve, created = false, stopped = false;
  session.prepared = new Promise((done) => { resolve = done; });
  const controller = new VoiceController({ media: {
    create: async () => { created = true; return session; },
    stop: async () => { stopped = true; session.controller.abort(); resolve({ error: 'Pemutaran dibatalkan.' }); session.emit('stopped'); },
  } });
  const slot = { current: null, player: { stop: () => {} } };
  controller.ensure = async () => { controller.slots.set('g', slot); return slot; };
  const pending = controller.playIn({ id: 'g' }, {}, {}, async () => {}), rejected = assert.rejects(pending, /dibatalkan/);
  await waitFor(() => created); await controller.stop('g'); await rejected; assert.equal(stopped, true);
  controller.slots.clear(); await controller.close();
});
test('voice /leave cancels a not-yet-created connection/session (unit lifecycle)', async () => {
  let ready, ensuring = false, created = false;
  const gate = new Promise((resolve) => { ready = resolve; });
  const controller = new VoiceController({ media: { create: async () => { created = true; } } });
  controller.ensure = async () => { ensuring = true; await gate; return {}; };
  const pending = controller.playIn({ id: 'g' }, {}, {}, async () => {}), rejected = assert.rejects(pending, /dibatalkan/);
  await waitFor(() => ensuring); await controller.leave('g'); ready(); await rejected; assert.equal(created, false); await controller.close();
});
