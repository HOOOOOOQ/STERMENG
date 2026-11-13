# Audit sebelum migrasi JavaScript — 666 Streaming

Tanggal: 13 November 2026. Baseline asli: `8ba7e071fd89ccc2410b726ff1a99553ba50f554`. Audit dilakukan kembali terhadap baseline **dan** working tree implementasi Python/web yang sudah ada, sebelum mengubah kode aplikasi untuk migrasi Node. Dokumen ini adalah rencana/pemetaan, bukan laporan tes JavaScript yang telah lulus.

## 1. Ruang lingkup yang diperiksa

- Entry point `bot.py` asli, `app.py`, metadata Python, requirements produksi/dev/lock, Docker/Compose, environment, seluruh folder `cogs/`, `services/`, `streaming/`, `webapp/`, `tests/`, `tools/`, frontend, scripts, dokumentasi, CI/actions dan aset.
- Inventaris seluruh modul Python beserta class/function/import diperiksa. Modul kosong `__init__.py` hanya namespace, bukan fitur yang perlu dijalankan.
- Runtime saat audit: Node 22.22.3/npm 10.9.8. FFmpeg/FFprobe/yt-dlp sistem dan Docker tidak tersedia melalui PATH sandbox. Binary FFmpeg/FFprobe khusus pengujian dari verifikasi sebelumnya tersedia terpisah; bukan dependency produksi atau alasan menganggap binary hosting sudah benar.
- Tidak ada server MongoDB pada arsitektur lama: data berupa JSON privat dan media di filesystem. Menambahkan MongoDB tidak diperlukan dan justru menambah ketergantungan hosting. Format JSON dipertahankan.

## 2. Arsitektur dan hubungan fitur

Baseline adalah bot Python, memakai library akun pengguna, patch gateway/voice privat, DAVE shim dan pengiriman RTP H.264; tidak mempunyai dashboard HTTP. Implementasi working tree menambahkan dashboard HLS/aiohttp serta bot resmi discord.py, tetapi `npm start` masih menjalankan Python. **Launcher tersebut harus diganti, bukan dipoles menjadi seolah-olah migrasi JavaScript.**

Alur yang akan dipertahankan saat memindahkan runtime:

```text
frontend yang sudah ada → Express / HTTP + WebSocket (satu port)
                         ├─ katalog → M3U/XMLTV, TVheadend, Jellyfin, file lokal
                         ├─ playlist/sources JSON atomik
                         └─ media manager → ekstraktor → FFprobe → FFmpeg HLS
bot discord.js v14 → handler perintah / permission → katalog/media manager
                  └─ @discordjs/voice → audio voice resmi
```

Kontrak API, descriptor media, ID channel SHA-256, JSON sumber lama (list/envelope), playlist, upload dan UI dipertahankan agar migrasi tidak mengharuskan pembuangan data atau penggantian dashboard dengan mock.

## 3. Pemetaan per modul

| Modul Python / bagian source | Tanggung jawab yang ditemukan | Tujuan JavaScript / keputusan |
|---|---|---|
| `app.py` | env, logging, preflight, listener, signals | `src/index.js`, entrypoint `node src/index.js` |
| `bot.py` | setup cogs, intents, dispatch, lifecycle | `src/discord/bot.js`, discord.js **v14** resmi |
| `permissions.py` | viewer/operator/admin bit masks, allowlists | `src/discord/permissions.js`; ID sebagai string agar tidak kehilangan presisi snowflake |
| `cogs/general.py` | help/ping/hello sesuai role | `src/discord/commands/general.js` |
| `cogs/voice.py`, `cogs/utils.py` | join/move/leave/stop, resolve voice, auto-leave | `src/discord/voice.js`, handler perintah voice |
| `cogs/iptv.py` | tambah/list/toggle/delete source | `src/discord/commands/sources.js`, SourceStore bersama HTTP |
| `cogs/tv.py` | play URL/live/VOD/channel, listing/filter/pagination, EPG search, konfirmasi jadwal, 30 detik early start, pemeriksaan voice saat jadwal firing | `src/discord/commands/tv.js`, jadwal bot dan media manager |
| `cogs/jellyfin.py` | search, `sXXeYY`, pemilihan season/episode, playback | `src/discord/commands/jellyfin.js` |
| `services/m3u.py` | parse EXTINF, attrs, EPG header, relative URL, bounded download | `src/services/m3u.js`, `src/services/http.js` |
| `services/epg.py` | XMLTV, gzip, timezone offset, now-playing, bounded parsing | `src/services/epg.js`; parser XML streaming, bukan regex XML |
| `services/hls.py` | master → highest-bandwidth variant | `src/services/hls.js`; pertahankan batas read/fallback |
| `services/probe.py` | metadata video/audio/fps/codec | `src/media/ffmpeg.js` |
| `services/sources.py` | format JSON lama/baru, toggles, EPG backfill, channel merge | `src/storage.js`, `src/services/catalog.js` |
| `services/tvheadend.py` | Basic Auth, channel, EPG/current programme, stream URL | `src/services/tvheadend.js`; cache dan enable/disable tetap ada |
| `services/jellyfin.py` | auth API key, Users/PlaybackInfo, search/seasons/episodes | `src/services/jellyfin.js`; secret tetap di server |
| `services/ytdlp.py`, `webapp/extractor.py` | metadata/live/VOD, format/size/timeout/cleanup | `src/media/extractor.js`; keputusan binary yt-dlp di bagian 5 |
| `webapp/config.py` | validasi port/path/codec/quality/FPS/bitrate/resource | `src/config.js`; PORT → SERVER_PORT → 8080 |
| `webapp/security.py` | password hash, session, limiter, origin, log redaction | `src/security.js`, crypto async Node; bukan password dalam source |
| `webapp/storage.py` | atomic JSON, schema playlist, no-clobber | `src/storage.js`, fs/promises, private permissions |
| `webapp/catalog.py` | adapter provider, local path confinement, descriptor | `src/services/catalog.js` |
| `webapp/ffmpeg.py` | bounded subprocesses/process groups, real encode/AAC/HLS preflight | `src/media/processes.js`, `src/media/ffmpeg.js` |
| `webapp/media.py` | session HLS, resource caps, cancellation, scheduling, bridge bot | `src/media/manager.js`; AbortController, tracked child processes |
| `webapp/server.py` | seluruh API, upload, auth, static, room WebSocket, lifecycle | `src/server.js`; Express + ws, API kompatibel frontend |
| `streaming/engine.py` aktif | official voice audio + link browser, cancellation | `src/discord/voice.js`; FFmpeg PCM → Opus melalui library resmi |
| `scripts/migrate_data.py` | validasi/copy privat tanpa overwrite/original deletion | `scripts/migrate-data.mjs` |
| `frontend/*`, logo/gambar | player hls.js, controls, queue/playlist, mobile/sync/errors | Dipertahankan dan dihubungkan ke backend Node, bukan dibangun ulang sebagai demo |
| `scripts/start.mjs` | launcher interpreter | Dihapus; npm start langsung Node entrypoint |
| `scripts/build.mjs` | esbuild + font/hls.js licenses | Tetap JavaScript; output pindah dari package Python ke `public/` |
| `requirements*.txt`, `pyproject.toml` | dependency/runtime Python | Digantikan package.json/lock ESM; tidak dibawa sebagai dependency runtime |
| `Dockerfile`, Compose, egg/entrypoint | Python/Node/apt FFmpeg, signal handling, volume seed | Image Node 22, startup Node, FFmpeg/FFprobe nyata, tanpa pip/system Python prerequisite |
| Python unit/integration suites | parser, provider, config/auth, media, bot lifecycle, private RTP tests | Diterjemahkan ke node:test + real integration tests; hasil 269 tes Python sebelumnya **bukan** bukti lulus migrasi JS |
| `tests/browser.mjs` | actual HLS playback/sync/error/mobile/SIGTERM | Dipertahankan, server/fixture discovery diubah sepenuhnya ke Node |
| CI shell/actions/coverage | pip/Ruff/pytest dan frontend | npm ci, syntax/import/lint, node:test, build, browser |
| README/STREAMING/docs/THIRD_PARTY | Python deployment, hasil tes lama, provenance | Ditulis ulang untuk Node, status tes baru dipisahkan dari hasil lama |

## 4. Kode protokol privat yang tidak boleh menjadi fitur runtime baru

- `streaming/golive.py`: gateway STREAM_CREATE/DELETE dan koneksi video akun pengguna.
- `streaming/video_player.py`: Annex-B/SPS/VUI rewrite, RTP/FU-A fragmentation/encryption, FIFO PCM/thread pacing dan encoder probing khusus video privat.
- `streaming/legacy_engine.py`: orkestrasi camera/Go Live privat yang sudah tidak aktif.
- `video_compat.py`: monkey patch video pada library akun pengguna.
- `davey_compat.py`: shim Python untuk DAVE/private voice internals.
- `tools/analyze_dave.py`: alat forensik PCAP/RTP/DAVE, bukan fitur player; bergantung pada packet key/protokol lama.

Modul-modul ini tidak dapat dijanjikan setara melalui API bot resmi. Tidak akan dipanggil atau diam-diam di-port menjadi selfbot JavaScript. FFmpeg menangani encoding/mux/timing browser, @discordjs/voice menangani transport/enkripsi voice resmi. Penelitian/provenance tetap dirujuk melalui Git baseline dan arsip protokol. Perbedaan ini harus ada pada matriks fitur, bukan disembunyikan sebagai “100% native Discord video”. Embedded App SDK juga bukan API Go Live; tidak perlu dipasang sekadar menampilkan tombol activity yang tidak berfungsi.

## 5. Keputusan yang perlu jelas: yt-dlp vs nol interpreter

**yt-dlp sendiri ditulis dalam Python.** Wrapper npm yang menjalankan `python -m yt_dlp`, zipapp `yt-dlp`, atau executable dengan shebang Python tidak memenuhi permintaan tanpa interpreter. Binary resmi **standalone** `yt-dlp_linux` tidak memerlukan instalasi Python sistem, namun membawa CPython secara internal. Itu utilitas eksternal, bukan aplikasi Python yang dibungkus Node, tetapi tetap bukan “nol interpreter termasuk dalam semua binary”.

**Keputusan pengguna (13 November 2026): mengizinkan yt-dlp mandiri.** Aplikasi/startup/dependency backend sepenuhnya Node.js dan tidak membutuhkan `python`/`pip`; hanya binary extractor eksternal yang membawa CPython internal. Installer memilih asset platform resmi, mengecek SHA-256, dan adapter menolak script/shebang Python. Ini bukan klaim bahwa seluruh utilitas pihak ketiga bebas interpreter.

## 6. Keterbatasan, keamanan, dan verifikasi yang direncanakan

- Semua source URL/credentials diproses server-side, tidak dikembalikan di daftar channel/source; shared password tetap berarti shared trusted operator, bukan ACL pelanggan.
- Tidak ada shell interpolation untuk media URL. Child timeout/abort mengakhiri process group; manifest dan segmen harus tetap memerlukan login.
- Sesi/jadwal sementara dan cache memiliki batas seperti sebelumnya. Persistensi sumber/playlist/media harus kompatibel, tidak menghapus data saat rebranding.
- Binary muncul pada `-encoders` belum membuktikan encoder bekerja: tes encode video, AAC, dan round-trip HLS tetap wajib.
- JS Node 22, Discord v14, Express, voice, XML parser, upload/WS dan dependency codec harus dipasang/diperiksa nyata, bukan hanya ditulis di manifest.
- FFmpeg/FFprobe bukan paket JavaScript. Image/hosting tetap perlu binary OS yang berfungsi. GPU opt-in, CPU libx264 default.
- Internet sandbox dibatasi; provider eksternal/Discord token/guild, Docker daemon dan Wings tidak tersedia. Pengujian jaringan fixture tidak akan disebut sebagai tes YouTube/Twitch/Jellyfin/Discord eksternal.
- Lisensi asli tidak disentuh. SHA-256 LICENSE: `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.

Urutan implementasi setelah audit: core config/storage/security/processes → provider/catalog/media → HTTP/WebSocket reuse UI → discord.js commands/voice → deployment & migration → npm install/lint/import/build → real media/browser/shutdown tests → audit sisa dependency Python dan distribusi source bersih.
