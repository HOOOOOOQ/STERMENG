import { MediaError } from '../../errors.js';
import { formatJellyfinItem } from '../../services/jellyfin.js';
import { choose, send } from '../ui.js';
export async function jellyfinCommand(bot, interaction) {
  const client = bot.state.catalog.jellyfin;
  if (!client) throw new MediaError('Jellyfin belum dikonfigurasi. Isi JELLYFIN_URL dan JELLYFIN_API_KEY di server.');
  bot.voice.resolve(interaction);
  const query = interaction.options.getString('query', true).slice(0, 200);
  const options = bot.state.catalog.options(bot.controller.signal);
  const results = await client.search(query, options);
  let item = await choose(interaction, results, 'Pilih film/serial/episode Jellyfin', formatJellyfinItem);
  if (!item) return;
  if (item.Type === 'Series') {
    const seriesId = item.Id;
    const season = await choose(interaction, await client.getSeasons(seriesId, options), `Pilih season ${item.Name}`);
    if (!season) return;
    item = await choose(interaction, await client.getEpisodes(seriesId, season.Id, options), `Pilih episode ${season.Name}`, formatJellyfinItem);
    if (!item) return;
  }
  return bot.voice.play(interaction, { kind: 'jellyfin', id: item.Id, title: formatJellyfinItem(item).slice(0, 200) }, (content) => send(interaction, content));
}
