import { Client, GatewayIntentBits, Events, SlashCommandBuilder, MessageFlags, ActivityType } from 'discord.js';
import { Role, loadIds, requireRole } from './permissions.js';
import { VoiceController } from './voice.js';
import { general } from './commands/general.js';
import { sourcesCommand } from './commands/sources.js';
import { tvCommand } from './commands/tv.js';
import { jellyfinCommand } from './commands/jellyfin.js';
import { send } from './ui.js';
import { HttpError, MediaError } from '../errors.js';
import { log } from '../log.js';

export function commandDefinitions() {
  const command = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
  return [
    command('help', 'Bantuan 666 Streaming dan batas Discord resmi'),
    command('ping', 'Periksa koneksi bot'), command('hello', 'Tes akses administrator'),
    command('join', 'Hubungkan bot ke voice channel Anda'), command('leave', 'Keluar dan bersihkan sesi'), command('stop', 'Hentikan audio, companion video, dan jadwal'),
    command('play', 'Putar URL, local:path, nomor/nama/ID channel').addStringOption((option) => option.setName('query').setDescription('URL / local:namafile.mp4 / nama atau ID channel').setRequired(true).setMaxLength(6000)),
    command('channels', 'Channel IPTV/TVheadend dan now-playing').addStringOption((option) => option.setName('query').setDescription('Filter channel/sumber').setMaxLength(200)).addIntegerOption((option) => option.setName('page').setDescription('Halaman').setMinValue(1).setMaxValue(10000)),
    command('search', 'Cari EPG, putar acara aktif atau jadwalkan acara mendatang').addStringOption((option) => option.setName('query').setDescription('Judul acara atau channel IPTV').setRequired(true).setMaxLength(200)),
    command('media', 'Cari/pilih film, serial atau Judul S01E02 dari Jellyfin').addStringOption((option) => option.setName('query').setDescription('Judul media / Judul S01E02').setRequired(true).setMaxLength(200)),
    command('add-source', 'Admin: tambah/perbarui sumber M3U privat').addStringOption((option) => option.setName('name').setDescription('Nama sumber').setRequired(true).setMaxLength(80)).addStringOption((option) => option.setName('url').setDescription('URL M3U milik Anda (tidak ditampilkan lagi oleh bot)').setRequired(true).setMaxLength(6000)),
    command('sources', 'Daftar sumber; admin dapat mengubah statusnya').addStringOption((option) => option.setName('action').setDescription('Tindakan').addChoices({ name: 'list', value: 'list' }, { name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' })).addStringOption((option) => option.setName('name').setDescription('Nama sumber atau tvheadend').setMaxLength(80)),
    command('delete-source', 'Admin: hapus sumber M3U (tanpa menghapus file media)').addIntegerOption((option) => option.setName('index').setDescription('Nomor 1-based dari /sources; kosongkan untuk menu').setMinValue(1).setMaxValue(50)),
  ].map((entry) => entry.toJSON());
}
export function commandRole(name) {
  if (['hello', 'add-source', 'delete-source'].includes(name)) return Role.ADMIN;
  if (['join', 'leave', 'stop', 'play', 'search', 'media'].includes(name)) return Role.OPERATOR;
  return Role.VIEWER;
}
export class StreamingBot {
  constructor(state) {
    this.state = state; this.controller = new AbortController();
    this.adminIds = loadIds(state.settings.env, 'ALLOWED_USER_IDS'); this.operatorIds = loadIds(state.settings.env, 'OPERATOR_USER_IDS');
    this.guildIds = loadIds(state.settings.env, 'DISCORD_GUILD_IDS');
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates], allowedMentions: { parse: [], repliedUser: false }, rest: { timeout: 15000, retries: 2 } });
    this.voice = new VoiceController(state); this.schedules = new Map(); this.tasks = new Set();
    this.client.on(Events.Error, () => log.warn('Koneksi bot Discord mengalami error.'));
    this.client.on(Events.Warn, (message) => log.warn(message));
    this.client.on(Events.ShardDisconnect, () => { state.runtime.discord = 'reconnecting'; });
    this.client.on(Events.ShardResume, () => { state.runtime.discord = 'ready'; });
    this.client.on(Events.ClientReady, () => {
      this.track(this.ready()).catch(() => log.error('Registrasi slash command Discord gagal. Periksa scope applications.commands/izin guild.'));
    });
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (interaction.isChatInputCommand()) this.track(this.handle(interaction)).catch(() => {});
    });
    this.client.on(Events.VoiceStateUpdate, (before, after) => { this.track(this.voice.onVoiceState(before, after, this.client.user?.id)).catch(() => {}); });
  }
  track(promise) {
    this.tasks.add(promise); void promise.finally(() => this.tasks.delete(promise)).catch(() => {}); return promise;
  }
  async start() { this.state.runtime.discord = 'connecting'; await this.client.login(this.state.settings.env.DISCORD_BOT_TOKEN.trim()); }
  async ready() {
    if (this.controller.signal.aborted) return;
    this.state.runtime.discord = 'ready';
    this.client.user.setPresence({ activities: [{ type: ActivityType.Watching, name: '666 Streaming · /help' }], status: 'online' });
    const commands = commandDefinitions();
    if (this.guildIds.size) {
      for (const id of this.guildIds) { const guild = await this.client.guilds.fetch(id); await guild.commands.set(commands); }
    } else await this.client.application.commands.set(commands);
    log.info('666 Streaming: bot resmi siap; slash command diregistrasi. Video hanya melalui web player.');
  }
  async handle(interaction) {
    if (this.controller.signal.aborted) return;
    try {
      interaction.streamingSignal = this.controller.signal;
      requireRole(this, interaction, commandRole(interaction.commandName));
      // Source URLs may contain credentials. Keep ALL command replies private
      // to the invoker; they can explicitly share a password-protected watch URL.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (['ping', 'hello', 'help'].includes(interaction.commandName)) return await general(this, interaction);
      if (['sources', 'add-source', 'delete-source'].includes(interaction.commandName)) return await sourcesCommand(this, interaction);
      if (['channels', 'play', 'search'].includes(interaction.commandName)) return await tvCommand(this, interaction);
      if (interaction.commandName === 'media') return await jellyfinCommand(this, interaction);
      this.cancelSchedule(interaction.guildId);
      if (interaction.commandName === 'join') { await this.voice.join(interaction); return await send(interaction, 'Terhubung ke voice channel.'); }
      if (interaction.commandName === 'leave') { await this.voice.leave(interaction.guildId); return await send(interaction, 'Keluar dan sesi dibersihkan.'); }
      if (interaction.commandName === 'stop') { await this.voice.stop(interaction.guildId); return await send(interaction, 'Pemutaran dan jadwal dihentikan.'); }
      throw new MediaError('Perintah tidak dikenal. Gunakan /help.');
    } catch (error) {
      const safe = error instanceof MediaError || error instanceof HttpError || error instanceof TypeError || error instanceof RangeError ? error.message : 'Perintah gagal. Periksa konfigurasi provider, izin bot, dan koneksi server.';
      log.warn(`Discord ${interaction.commandName} gagal: ${error instanceof MediaError || error instanceof HttpError ? safe : error.name}`);
      try {
        if (interaction.deferred || interaction.replied) await send(interaction, safe);
        else await interaction.reply({ content: safe, flags: MessageFlags.Ephemeral });
      } catch { /* Interaction expired or transport is closing. */ }
    }
  }
  cancelSchedule(guildId) { clearTimeout(this.schedules.get(guildId)); this.schedules.delete(guildId); }
  scheduleGuide(interaction, descriptor, timestamp) {
    this.cancelSchedule(interaction.guildId);
    const timer = setTimeout(() => {
      this.schedules.delete(interaction.guildId);
      this.track((async () => {
        if (this.controller.signal.aborted) return;
        const guild = this.client.guilds.cache.get(interaction.guildId), channel = guild?.voiceStates.cache.get(interaction.user.id)?.channel;
        const notify = async (content) => {
          // Webhook interaction tokens expire after 15 minutes. DM the requester
          // instead of publishing a private command/URL into a guild channel.
          try { await interaction.user.send({ content, allowedMentions: { parse: [] } }); } catch { /* DMs can be disabled. */ }
        };
        if (!channel) { await notify('Jadwal 666 Streaming dibatalkan: Anda tidak lagi berada di voice channel.'); return; }
        await this.voice.playIn(guild, channel, descriptor, notify);
      })()).catch(() => log.warn('Jadwal Discord gagal dimulai; periksa sumber/voice.'));
    }, Math.max(0, timestamp * 1000 - Date.now()));
    timer.unref(); this.schedules.set(interaction.guildId, timer);
  }
  async close() {
    if (this.closing) return this.closing;
    this.controller.abort();
    this.closing = (async () => {
      for (const timer of this.schedules.values()) clearTimeout(timer); this.schedules.clear();
      // Abort owner-bound collectors and in-flight provider requests before
      // waiting, so shutdown never inherits their full 30/60-second timeouts.
      await this.voice.close(); await this.client.destroy();
      await Promise.allSettled([...this.tasks]);
      this.state.runtime.discord = 'disabled';
    })();
    return this.closing;
  }
}
