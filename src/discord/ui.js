import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType, MessageFlags, escapeMarkdown } from 'discord.js';
import { randomUUID } from 'node:crypto';

export const safeLabel = (value) => escapeMarkdown(String(value).slice(0, 300));
export function awaitComponent(message, options, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const collector = message.createMessageComponentCollector({ ...options, max: 1 });
    const abort = () => collector.stop('shutdown');
    signal?.addEventListener('abort', abort, { once: true });
    collector.once('collect', resolve);
    collector.once('end', (collected) => { signal?.removeEventListener('abort', abort); if (!collected.size) reject(new Error('Collector ended')); });
    if (signal?.aborted) abort();
  });
}
export async function send(interaction, content) {
  const payload = typeof content === 'string' ? { content: content.slice(0, 1950) } : content;
  if (interaction.deferred && !interaction.replied) return interaction.editReply(payload);
  if (interaction.replied) return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral, fetchReply: true });
}
// A bounded, owner-bound component collector replaces the original numeric reply
// prompts. No Message Content intent, user relationships or message interception.
export async function choose(interaction, items, label, formatter = (item) => item.title || item.Name || item.name) {
  if (!items.length) { await send(interaction, 'Tidak ada hasil.'); return null; }
  if (items.length === 1) return items[0];
  const nonce = randomUUID().slice(0, 8); let page = 0;
  const render = () => {
    const offset = page * 25, batch = items.slice(offset, offset + 25);
    const select = new StringSelectMenuBuilder().setCustomId(`${nonce}-select`).setPlaceholder('Pilih item…').addOptions(batch.map((item, index) => ({ label: formatter(item).slice(0, 100) || 'Media', value: String(offset + index) })));
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${nonce}-prev`).setLabel('Sebelumnya').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${nonce}-next`).setLabel('Berikutnya').setStyle(ButtonStyle.Secondary).setDisabled(offset + 25 >= items.length),
      new ButtonBuilder().setCustomId(`${nonce}-cancel`).setLabel('Batal').setStyle(ButtonStyle.Danger));
    return { content: `${label.slice(0, 500)} — halaman ${page + 1}/${Math.ceil(items.length / 25)} (${items.length} hasil)`, components: [new ActionRowBuilder().addComponents(select), buttons] };
  };
  const message = await send(interaction, render());
  let result = null;
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const component = await awaitComponent(message, { filter: (item) => item.user.id === interaction.user.id && item.customId.startsWith(nonce), time: Math.max(1, deadline - Date.now()) }, interaction.streamingSignal);
      if (component.customId.endsWith('-cancel')) { await component.update({ content: 'Dibatalkan.', components: [] }); return null; }
      if (component.isStringSelectMenu()) { result = items[Number(component.values[0])]; await component.update({ content: `Dipilih: ${safeLabel(formatter(result))}`, components: [] }); return result; }
      page += component.customId.endsWith('-next') ? 1 : -1;
      await component.update(render());
    }
  } catch { await interaction.editReply({ content: 'Pilihan kedaluwarsa atau bot sedang berhenti.', components: [] }).catch(() => {}); }
  return result;
}
export async function confirm(interaction, prompt) {
  const nonce = randomUUID();
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${nonce}-yes`).setLabel('Ya, jadwalkan').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`${nonce}-no`).setLabel('Batal').setStyle(ButtonStyle.Secondary));
  const message = await send(interaction, { content: prompt.slice(0, 1900), components: [row] });
  try {
    const answer = await awaitComponent(message, { componentType: ComponentType.Button, filter: (item) => item.user.id === interaction.user.id && item.customId.startsWith(nonce), time: 30000 }, interaction.streamingSignal);
    const yes = answer.customId.endsWith('-yes'); await answer.update({ content: yes ? 'Jadwal dikonfirmasi.' : 'Jadwal dibatalkan.', components: [] }); return yes;
  } catch { await interaction.editReply({ content: 'Konfirmasi kedaluwarsa.', components: [] }).catch(() => {}); return false; }
}
