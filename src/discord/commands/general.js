import { send } from '../ui.js';
export async function general(bot, interaction) {
  if (interaction.commandName === 'ping') return send(interaction, `666 Streaming: pong — gateway ${Math.round(bot.client.ws.ping)} ms.`);
  if (interaction.commandName === 'hello') return send(interaction, '666 Streaming siap, administrator.');
  return send(interaction, '**666 Streaming · official bot**\nViewer: /help /ping /channels /sources\nOperator: /join /leave /stop /play /search /media\nAdmin: /hello /add-source /delete-source /sources action:enable|disable\n/play: URL, local:namafile.mp4, channel ID, nomor, atau nama channel.\n/media: judul film/serial atau Judul S01E02; pilihan season/episode memakai menu.\nVideo di player web; tidak ada Go Live/screenshare native. Penonton membutuhkan password workspace.');
}
