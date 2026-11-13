import { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus, NoSubscriberBehavior } from '@discordjs/voice';
import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { MediaError } from '../errors.js';
import { Mutex } from '../async.js';
import { REMOTE } from '../config.js';
import { spawnTracked, terminate } from '../media/processes.js';
import { inputOptions } from '../media/ffmpeg.js';
import { log } from '../log.js';

export class VoiceController {
  constructor(state) { this.state = state; this.slots = new Map(); this.locks = new Map(); this.generations = new Map(); this.controller = new AbortController(); this.closed = false; }
  lock(guildId) { if (!this.locks.has(guildId)) this.locks.set(guildId, new Mutex()); return this.locks.get(guildId); }
  resolve(interaction) {
    const guild = interaction.guild;
    const channel = guild?.voiceStates.cache.get(interaction.user.id)?.channel;
    if (!channel) throw new MediaError('Anda harus berada di voice channel.');
    return { guild, channel };
  }
  async ensure(guild, channel) {
    if (this.closed) throw new MediaError('Bot sedang shutdown.');
    const permissions = channel.permissionsFor(guild.members.me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) throw new MediaError('Bot membutuhkan izin View Channel, Connect, dan Speak di voice channel.');
    let slot = this.slots.get(guild.id);
    if (slot?.connection.state.status === VoiceConnectionStatus.Destroyed) { this.slots.delete(guild.id); slot = null; }
    if (slot && slot.connection.joinConfig.channelId !== channel.id) slot.connection.rejoin({ channelId: channel.id, selfDeaf: true, selfMute: false });
    if (!slot) {
      const connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      connection.subscribe(player);
      slot = { connection, player, current: null };
      this.slots.set(guild.id, slot);
      connection.on('error', () => log.warn(`Voice Discord terputus di guild ${guild.id}.`));
      player.on('error', () => { log.warn(`Audio Discord gagal di guild ${guild.id}.`); void this.stop(guild.id); });
      player.on(AudioPlayerStatus.Idle, () => {
        const current = slot.current;
        if (current?.child) { void terminate(current.child); current.audioEnded = true; }
      });
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try { await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5000), entersState(connection, VoiceConnectionStatus.Connecting, 5000)]); }
        catch { await this.leave(guild.id); }
      });
      connection.on(VoiceConnectionStatus.Destroyed, () => { if (this.slots.get(guild.id) === slot) { void this.stop(guild.id); this.slots.delete(guild.id); } });
    }
    try {
      await entersState(slot.connection, VoiceConnectionStatus.Ready, AbortSignal.any([this.controller.signal, AbortSignal.timeout(20000)]));
      if (this.closed) throw new MediaError('Bot sedang shutdown.');
      if (channel.type === ChannelType.GuildStageVoice) {
        // Stage API is official; without moderator permission an admin must make
        // the bot a speaker. Never claim an inaudible connection is playback.
        try { await guild.members.me.voice.setSuppressed(false); }
        catch { throw new MediaError('Jadikan bot speaker di Stage channel atau gunakan voice channel biasa.'); }
      }
      return slot;
    } catch (error) { if (slot.connection.state.status !== VoiceConnectionStatus.Destroyed) slot.connection.destroy(); throw error instanceof MediaError ? error : new MediaError('Koneksi voice Discord melewati batas waktu. Periksa UDP/izin channel.'); }
  }
  async join(interaction) {
    const { guild, channel } = this.resolve(interaction);
    return this.lock(guild.id).run(() => this.ensure(guild, channel));
  }
  async play(interaction, descriptor, notify) {
    const { guild, channel } = this.resolve(interaction);
    return this.playIn(guild, channel, descriptor, notify);
  }
  async playIn(guild, channel, descriptor, notify) {
    const generation = this.bump(guild.id);
    // Preempt a resolving/downloading session BEFORE waiting for the guild
    // lock; a second /play must not inherit the old RESOLVE_TIMEOUT.
    await this.stopCurrent(guild.id);
    return this.lock(guild.id).run(async () => {
      if (this.closed || this.generations.get(guild.id) !== generation) throw new MediaError('Pemutaran dibatalkan.');
      const slot = await this.ensure(guild, channel);
      if (this.closed || this.generations.get(guild.id) !== generation) throw new MediaError('Pemutaran dibatalkan.');
      const session = await this.state.media.create(descriptor);
      if (this.closed || this.generations.get(guild.id) !== generation) { await this.state.media.stop(session.id); throw new MediaError('Pemutaran dibatalkan.'); }
      const current = { session, child: null, audioEnded: false }; slot.current = current;
      session.once('stopped', () => { if (slot.current === current) { slot.player.stop(true); void terminate(current.child); slot.current = null; } });
      // Resolve/download once for browser AND Discord. No duplicate yt-dlp job.
      const touch = setInterval(() => { if (slot.current === current && !current.audioEnded) session.touched = Date.now(); }, 10000); touch.unref();
      const prepared = await session.prepared;
      if (prepared.error || this.closed || this.generations.get(guild.id) !== generation || session.controller.signal.aborted) { clearInterval(touch); await this.state.media.stop(session.id); throw new MediaError(prepared.error || 'Pemutaran dibatalkan.'); }
      if (prepared.metadata.has_audio) {
        const child = spawnTracked(this.state.settings.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputOptions(prepared.source, REMOTE.test(prepared.source)), '-i', prepared.source, '-vn', '-threads', String(this.state.settings.threads), '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { signal: session.controller.signal });
        current.child = child; child.stderr.resume();
        slot.player.play(createAudioResource(child.stdout, { inputType: StreamType.Raw }));
        void child.result.then(async (result) => {
          if (result.code !== 0 && !session.controller.signal.aborted && slot.current === current) await notify('Audio Discord terputus. Periksa sumber dan koneksi voice.').catch(() => {});
        });
      } else current.audioEnded = true;
      void session.task.finally(() => { clearInterval(touch); if (session.state === 'error' && slot.current === current) { slot.player.stop(true); void terminate(current.child); } });
      const base = this.state.settings.publicUrl;
      await notify(`▶ **${session.title.replace(/[*_`~|\\]/g, '')}**\n${base ? `Video: ${base}/watch/${session.id}` : 'Video tersedia di dashboard. Atur PUBLIC_URL untuk link tontonan.'}\n${prepared.metadata.has_audio ? 'Audio melalui bot resmi.' : 'Sumber tidak memiliki audio.'} Tidak ada screenshare native; audio bot tidak dijamin lip-sync dengan browser.`);
      return session;
    });
  }
  bump(guildId) { const value = (this.generations.get(guildId) || 0) + 1; this.generations.set(guildId, value); return value; }
  async stop(guildId) { this.bump(guildId); await this.stopCurrent(guildId); }
  async stopCurrent(guildId) {
    const slot = this.slots.get(guildId); if (!slot) return;
    const current = slot.current; slot.current = null;
    slot.player.stop(true); await terminate(current?.child);
    if (current) await this.state.media.stop(current.session.id);
  }
  async leave(guildId) {
    const generation = this.bump(guildId), slot = this.slots.get(guildId);
    await this.stopCurrent(guildId);
    if (!slot || this.generations.get(guildId) !== generation) return;
    this.slots.delete(guildId);
    if (slot.connection.state.status !== VoiceConnectionStatus.Destroyed) slot.connection.destroy();
  }
  async onVoiceState(before, after, botId) {
    if (!before.channelId || before.channelId === after.channelId) return;
    const slot = this.slots.get(before.guild.id);
    if (!slot || slot.connection.joinConfig.channelId !== before.channelId) return;
    if (after.id === botId && !after.channelId) { await this.leave(before.guild.id); return; }
    const channel = before.guild.channels.cache.get(before.channelId);
    if (channel && !channel.members.some((member) => member.id !== botId)) await this.leave(before.guild.id);
  }
  async close() {
    this.closed = true; this.controller.abort();
    await Promise.all([...this.slots.keys()].map((id) => this.leave(id)));
    // In-flight starts see closed before acquiring voice; await locks to ensure
    // no deferred extraction can resurrect a stream after shutdown.
    await Promise.all([...this.locks.values()].map((lock) => lock.run(async () => {})));
    await sleep(0);
  }
}
