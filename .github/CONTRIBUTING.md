# Contributing to 666 Streaming

Use Node.js22 and JavaScript ES Modules. Preserve provider behavior, existing JSON
formats and GPL LICENSE; credit topsoil/dev-topsoil in THIRD_PARTY.md. See the
pre-migration mapping in docs/AUDIT-JAVASCRIPT.md. Do not add application Python,
user-account Discord login, selfbots/private video gateway patches, secrets,
placeholder media passed off as real streams or unsupported native Go Live claims.

- Use official discord.js v14 and @discordjs/voice. The approved standalone yt-dlp
  utility embeds CPython internally; never hide that or substitute a Python zipapp.
- Run npm ci, npm run check:source, npm run lint, npm test, npm run build and
  npm run test:browser with actual FFmpeg/FFprobe/standalone yt-dlp available.
- Add unit and real media tests; controlled HTTP adapter contracts are not proof
  external YouTube/Twitch/Jellyfin/Discord accounts work.
- Update configuration, migration, deployment and feature/test matrices together.
- Keep credentials, media, caches, standalone binaries, node_modules, test output
  and generated archives out of Git. Preserve original LICENSE and provenance.
- Follow the repository integration flow; work on the assigned branch and do not
  rewrite other contributors' history. No published image/hosting success claims
  without an actual deployment result.
