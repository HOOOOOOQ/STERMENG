# Konfigurasi dan keamanan — Node.js

Environment hosting menang terhadap `.env` di root aplikasi. Tidak ada secret dalam source/default. Relative data/media paths dihitung dari direktori aplikasi, bukan direktori shell. File config provider ada dalam DATA_DIR privat; jangan membuat folder tersebut static.

## Listener / akses

| Environment | Default / fungsi |
|---|---|
| HOST | `0.0.0.0`; menerima host proxy/preview yang valid |
| PORT / SERVER_PORT | PORT nonblank menang; lalu SERVER_PORT; lalu8080; range1..65535 |
| PUBLIC_URL | kosong; root origin HTTP(S) untuk watch links, tanpa path/query/credential |
| APP_PASSWORD | kosong → random bootstrap `DATA_DIR/initial-password` mode600; maksimum1024 karakter |
| COOKIE_SECURE | `false`, set`true` untuk HTTPS; hanya true/false |
| DATA_DIR | `./data`, JSON privat dan cache |
| MEDIA_DIR | `DATA_DIR/media`; tidak boleh di dalam/menjadi parent cache |
| TIMEZONE | UTC jika kosong/invalid; contoh`Asia/Jakarta` untuk waktu bot |
| LOG_LEVEL | INFO; DEBUG/INFO/WARN/ERROR |

Login memakai PBKDF2-SHA256 async200000 iterasi, salt random per proses, constant-time comparison,5 percobaan/IP/menit, maksimal8 hash paralel,128 sesi login/24jam. Cookie HttpOnly, SameSiteStrict, origin write/WS harus sama dengan Host. Proxy-IP tidak dipercaya secara otomatis; bila semua traffic datang dari satu proxy IP, rate-limit tersebut terbagi antarpengguna. Hindari menambahkan trust-proxy luas tanpa daftar jaringan yang benar.

API, manifest dan segmen memerlukan cookie. Watch URL hanya memilih room—**bukan** token akses anonim. Sesi auth/jadwal tidak persisten; restart mewajibkan login lagi. Bukan platform multitenant/ACL per-pelanggan: semua pemegang password dianggap operator tepercaya dan dapat stop/edit/upload/akses URL jaringan termasuk LAN. Jangan memberi password ke pihak yang tidak dipercaya atau mengekspos aplikasi tanpa TLS/rate limiting perimeter.

## Media / resource

| Environment | Default / validasi |
|---|---|
| FFMPEG_PATH / FFPROBE_PATH | `ffmpeg` / `ffprobe`, binary OS; harus benar-benar sehat |
| YTDLP_PATH | `bin/yt-dlp` (`.exe` Windows); standalone saja |
| VIDEO_ENCODER | `libx264`; juga libopenh264/h264_nvenc/h264_vaapi |
| VAAPI_DEVICE | `/dev/dri/renderD128`, hanya bila VAAPI dan host mengizinkan |
| FFMPEG_THREADS |2;1..32 |
| STREAM_QUALITY |720p;720p/1080p/4k |
| STREAM_RESOLUTION |preset; W:H atau WxH, dimensi genap64..3840×64..2160 |
| STREAM_FPS |30; finite1..60 |
| STREAM_VIDEO_BITRATE |3500k;64k..100M, integer + optional k/M |
| STREAM_AV_SYNC_MS |0;-5000..5000; positif audio maju, negatif delay |
| MAX_STREAMS |3;1..20; stop sebelum membuka yang baru bila cap tercapai |
| STREAM_IDLE_SECONDS |900;30..86400 |
| MAX_CACHE_MB |1024 per sesi;32..102400; pruner10s sehingga burst sementara mungkin |
| MAX_UPLOAD_MB |1024;1..102400; file + parsing stream bounded;3 upload paralel |
| MAX_DOWNLOAD_MB |1024;1..102400; total unduhan dipantau250ms termasuk fragment/A/V sementara |
| RESOLVE_TIMEOUT |300s;10..3600; metadata+download extractor |
| YTDLP_FORMAT |`bv*[height<=?1080]+ba/b[height<=?1080]` |

Tidak ada unlimited VOD seek. Output HLS event memungkinkan seek pada bagian yang sudah dihasilkan. Live rolling8 segmen; sesi maksimal6jam. Cache disk harus mengakomodasi MAX_STREAMS×MAX_CACHE_MB **ditambah** media upload dan temporary download. CPU default720p tetap perlu pengukuran pada resource hosting. GPU encoder harus lulus preflight, bukan sekadar terdaftar.

JSON request128KiB; playlist100 dengan500 item; source50 dengan maksimal10000 channel saat import; local listing1000 file; M3U8MiB; XMLTV32MiB compressed/64MiB expanded; XML DOCTYPE ditolak. Sumber tersimpan lama yang sangat besar perlu dirapikan administrator. WS4KiB/message,30 peers/session, bounded send-buffer dan rate limit.

## Provider opsional

- `JELLYFIN_URL` + `JELLYFIN_API_KEY`: keduanya untuk enable. API key ada di server/private JSON saja, tidak di dashboard listing. Media PlaybackInfo mengandung key internal agar FFmpeg dapat mengambil segmen.
- `TVHEADEND_URL` + `TVHEADEND_USER` + `TVHEADEND_PASS`: ketiganya untuk enable. Toggle status tersimpan di sources.json; auth URL hanya dipakai di server/proses FFmpeg.
- IPTV source URL diimport melalui API/dashboard/admin slash, disimpan mode600; public listing hanya nama/count/status, channel tanpa URL upstream. XMLTV diperbarui15menit; channel/TVH guide cache60detik.
- Provider tidak otomatis dianggap terhubung hanya karena env diisi. UI menampilkan *dikonfigurasi*; error media/provider tetap nyata.

## Discord

| Environment | Fungsi |
|---|---|
| DISCORD_BOT_TOKEN | hanya token application bot resmi; kosong = dashboard tanpa bot |
| ALLOWED_USER_IDS | admin user IDs dipisahkan koma |
| OPERATOR_USER_IDS | operator playback IDs dipisahkan koma |
| DISCORD_GUILD_IDS | opsional guild IDs untuk registrasi slash per-guild; kosong global |

Anggota guild lain viewer. Tidak memakai hubungan friend/user-account, Message Content atau privileged Members intent. Intents hanya Guilds+GuildVoiceStates. `DISCORD_TOKEN` diabaikan. Bot tidak menyediakan native screenshare/camera; /watch video terpisah. Jadwal≤24h mulai30sawal dan membutuhkan peminta masih di voice.

## Privasi operasional

- Redaction menghapus path/query/userinfo URL serta env secret dari log; raw stderr utilitas tidak dipublikasikan. Jangan aktifkan logging debug proxy yang menyimpan credential source/request body.
- URL dikirim ke yt-dlp melalui stdin; FFmpeg/FFprobe masih membutuhkan URL pada argv. Administrator OS/proses dengan UID sama dapat melihat command arguments dan DATA_DIR. Shared UID bukan isolasi secret.
- Semua input utilitas menggunakan args array tanpa shell. Selfbot/protocol patch tidak disertakan runtime. Hanya binary yt-dlp mandiri yang merupakan pengecualian CPython internal yang disetujui.
- Tidak ada database secret, token atau password test produksi bawaan. Synthetic credentials di test adalah fixture sementara, bukan account nyata.
