import { MediaError } from '../../errors.js';
import { REMOTE } from '../../config.js';
import { choose, send, safeLabel, confirm } from '../ui.js';

export function findChannel(items, query) {
  if (/^\d+$/.test(query)) { const result = items.find((item) => Number(item.number) === Number(query)); if (result) return result; }
  return items.find((item) => item.id === query) || items.find((item) => item.title.toLowerCase().includes(query.toLowerCase()));
}
export function selectGuideEvent(events, now = Date.now() / 1000) {
  return { airing: events.find((event) => event.start <= now && now < event.stop), upcoming: events.filter((event) => now < event.start && event.start <= now + 86400).sort((a, b) => a.start - b.start)[0] };
}
export async function tvCommand(bot, interaction) {
  const catalog = bot.state.catalog;
  const query = (interaction.options.getString('query') || '').trim().slice(0, 8192);
  if (interaction.commandName === 'channels') {
    const data = await catalog.channelList(false, { signal: bot.controller.signal });
    const matches = data.items.filter((item) => !query || `${item.title} ${item.source} ${item.group}`.toLowerCase().includes(query.toLowerCase()));
    const page = Math.max(1, interaction.options.getInteger('page') || 1), pages = Math.max(1, Math.ceil(matches.length / 12));
    const selected = matches.slice((page - 1) * 12, page * 12);
    return send(interaction, `**Channel · ${page}/${pages} (${matches.length})**\n${selected.map((item) => `${item.number ? `#${item.number} ` : ''}**${safeLabel(item.title)}** · ${safeLabel(item.source)}${item.now_playing ? ` — ${safeLabel(item.now_playing)}` : ''}\nID: \`${item.id}\``).join('\n') || 'Tidak ada channel. Tambahkan/aktifkan sumber M3U.'}\n${data.warnings.join('\n')}`);
  }
  if (!query) throw new MediaError('Isi query URL/nama channel/judul acara.');
  bot.voice.resolve(interaction);
  if (interaction.commandName === 'play') {
    bot.cancelSchedule(interaction.guildId);
    let descriptor;
    if (REMOTE.test(query)) descriptor = { kind: 'url', url: query };
    else if (query.startsWith('local:')) descriptor = { kind: 'local', path: query.slice(6).trim() };
    else {
      const data = await catalog.channelList(false, { signal: bot.controller.signal });
      const found = findChannel(data.items, query);
      if (!found) throw new MediaError('Channel tidak ditemukan. Gunakan /channels atau URL media.');
      descriptor = found;
    }
    return bot.voice.play(interaction, descriptor, (content) => send(interaction, content));
  }
  let events = [];
  if (catalog.tvh && catalog.sources.tvhEnabled) {
    try { events = await catalog.tvh.getEpgEvents(query.slice(0, 200), 100, catalog.options(bot.controller.signal)); }
    catch { /* Guide outage must not disable IPTV channel fallback. */ }
  }
  if (!events.length) {
    const data = await catalog.channelList(false, { signal: bot.controller.signal });
    const found = data.items.find((item) => item.provider === 'iptv' && item.title.toLowerCase().includes(query.toLowerCase()));
    if (!found) throw new MediaError('Tidak ada hasil EPG atau channel IPTV yang cocok.');
    bot.cancelSchedule(interaction.guildId);
    return bot.voice.play(interaction, found, (content) => send(interaction, content));
  }
  const { airing, upcoming } = selectGuideEvent(events);
  const event = airing || upcoming;
  if (!event) throw new MediaError('Acara tidak ditemukan dalam 24 jam ke depan.');
  if (!event.channelUuid) throw new MediaError('Acara tidak memiliki channel UUID; putar nama channel secara manual.');
  const channels = (await catalog.channelList(false, { signal: bot.controller.signal })).items;
  const descriptor = channels.find((item) => catalog.channels.get(item.id)?.uuid === event.channelUuid);
  if (!descriptor) throw new MediaError('Channel acara tidak tersedia. Muat ulang sumber.');
  if (airing) {
    bot.cancelSchedule(interaction.guildId);
    return bot.voice.play(interaction, descriptor, (content) => send(interaction, content));
  }
  const formatted = new Intl.DateTimeFormat('id-ID', { timeZone: bot.state.settings.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(upcoming.start * 1000));
  if (!await confirm(interaction, `**${safeLabel(upcoming.title)}** · ${safeLabel(descriptor.title)} · ${formatted}. Jadwalkan mulai 30 detik sebelum acara?`)) return;
  bot.scheduleGuide(interaction, descriptor, upcoming.start - 30);
  return send(interaction, 'Jadwal disimpan dalam memori. Dibatalkan oleh /play, /stop, /leave, restart, atau jika peminta tidak lagi berada di voice saat jadwal dimulai.');
}
export async function pickChannel(bot, interaction, query) {
  const data = await bot.state.catalog.channelList();
  return choose(interaction, data.items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), 'Pilih channel');
}
