import { Role, requireRole } from '../permissions.js';
import { requiredText, MediaError } from '../../errors.js';
import { send, safeLabel, choose } from '../ui.js';
export async function sourcesCommand(bot, interaction) {
  const catalog = bot.state.catalog;
  if (interaction.commandName === 'add-source') {
    await catalog.addSource(requiredText({ name: interaction.options.getString('name') }, 'name', 80), requiredText({ url: interaction.options.getString('url') }, 'url', 8192), catalog.options(bot.controller.signal));
    return send(interaction, 'Sumber M3U disimpan. URL/credential tidak dipublikasikan.');
  }
  if (interaction.commandName === 'delete-source') {
    const index = interaction.options.getInteger('index');
    const entry = index === null ? await choose(interaction, catalog.sourceList(), 'Pilih sumber yang akan dihapus') : catalog.sourceList().find((item) => item.index === index - 1);
    if (!entry) return send(interaction, 'Sumber tidak dipilih atau tidak ditemukan.');
    const name = await catalog.sources.remove(entry.index); catalog.invalidate(); return send(interaction, `Sumber **${safeLabel(name)}** dihapus.`);
  }
  const action = interaction.options.getString('action') || 'list';
  if (action !== 'list') {
    requireRole(bot, interaction, Role.ADMIN);
    const name = interaction.options.getString('name')?.trim();
    if (!name) throw new MediaError('Isi name dengan nama sumber atau tvheadend.');
    if (name.toLowerCase() === 'tvheadend') await catalog.sources.setTvhEnabled(action === 'enable');
    else {
      const index = catalog.sources.getSources().findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
      if (index < 0) throw new MediaError('Sumber tidak ditemukan.');
      await catalog.sources.setEnabled(index, action === 'enable');
    }
    catalog.invalidate();
  }
  const entries = catalog.sourceList();
  return send(interaction, `**Sumber 666 Streaming**\n${catalog.tvh ? `TVheadend: ${catalog.sources.tvhEnabled ? 'aktif' : 'nonaktif'}\n` : ''}${entries.map((entry) => `${entry.index + 1}. [${entry.enabled ? '✓' : '×'}] ${safeLabel(entry.name)} — ${entry.channels} channel`).join('\n') || 'Belum ada sumber IPTV.'}`);
}
