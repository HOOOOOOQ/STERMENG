# Instalasi, update, dan migrasi data

## Persyaratan aktual

- Node.js **22.17+ dalam major22**, npm dan OS64-bit. Backend native JavaScript ES Modules, bukan TypeScript yang perlu compile runtime atau launcher Python.
- FFmpeg **dan** FFprobe yang benar-benar bekerja; H.264 (`libx264` default), AAC, HLS/MPEG-TS dan protokol sumber. GPU bukan prasyarat.
- yt-dlp **standalone** bila ingin YouTube/Twitch/extractor situs. Pengguna sudah menyetujui CPython internal dalam utilitas ini; tidak membutuhkan Python sistem/pip. Adapter menolak shebang/zipapp.
- Storage writable untuk JSON/media/cache, jaringan upstream yang memang boleh diakses. Tidak memerlukan MongoDB/Redis/Jellyfin/TVheadend lokal untuk start.
- Linux glibc (Debian/Ubuntu/image yang disediakan) adalah target Pterodactyl. Opus/WASM dan native DAVE dipasang lewat npm; hindari image Alpine/musl tanpa menguji ketersediaan paket platform.

## Source checkout atau arsip

Ekstrak ZIP JavaScript terbaru ke satu folder sehingga `package.json`, `src/`, `frontend/` berada di level sama. Tidak perlu `.git` untuk menjalankan/build/tes. Jangan ekstrak di atas instalasi lama tanpa backup. Gunakan `npm ci` (lockfile), bukan memodifikasi versi dependency secara acak.

```bash
# Debian/Ubuntu, melalui admin OS:
sudo apt-get update && sudo apt-get install -y ffmpeg ca-certificates
node --version      # v22.x, minimum22.17
ffmpeg -version
ffprobe -version

npm ci --include=dev
npm run build
npm run install:ytdlp
cp .env.example .env
# Edit .env, minimal password + port, jangan upload .env ke Git.
npm run check
node src/index.js
```

`npm start` ekuivalen untuk penggunaan terminal. Untuk supervisor/Pterodactyl, jalankan **`node src/index.js` langsung** agar SIGTERM menuju proses yang mengelola FFmpeg, bukan hanya proses npm di depannya. Bind default0.0.0.0, port `PORT` → `SERVER_PORT` →8080. Endpoint `/healthz` hanya identitas/status listener, bukan tes credential provider.

Build menghasilkan `public/` termasuk hls.js/font/license lokal; tak ada CDN runtime. ZIP JavaScript menyertakan aset yang sudah dibuild: jika tidak mengubah frontend, cukup `npm ci --omit=dev` untuk menjalankan tanpa esbuild/Chromium. Instalasi production-only ini telah diuji dari ZIP bersih; binary media tetap harus disediakan terpisah. Sesudah build, `npm prune --omit=dev` opsional untuk produksi. Instalasi yang sudah prune perlu `npm ci --include=dev && npm run build` sebelum rebuild; Chromium/esbuild tidak diperlukan saat serving.

## yt-dlp mandiri

Installer [scripts/install-ytdlp.mjs](../scripts/install-ytdlp.mjs) pin rilis **2026.10.26**, memilih asset Linux x64/arm64, macOS universal atau Windows x64, mencocokkan SHA-256 dari `SHA2-256SUMS`, kemudian memasang executable ke `bin/yt-dlp` (Windows`.exe`). `YTDLP_PATH` dapat menunjuk lokasi lain. Tidak ada npm wrapper yt-dlp yang menjalankan Python.

Jika GitHub release assets diblokir:

1. Dari mesin admin dengan internet yang diizinkan, buka [rilis resmi](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26).
2. Linux x64: unduh **`yt-dlp_linux`**, ARM64:`yt-dlp_linux_aarch64`. Unduh `SHA2-256SUMS` dari rilis sama.
3. Cocokkan checksum SHA-256 dengan baris nama asset. Upload binary, rename ke `bin/yt-dlp`, lalu `chmod 755` melalui terminal/file manager.
4. Atur `YTDLP_PATH` bila lokasi berbeda dan jalankan `npm run check`.

**Jangan memakai asset generik `yt-dlp` (zipapp/shebang Python), pip, atau mematikan verifikasi TLS.** Untuk CA perusahaan gunakan CA host yang benar/`NODE_EXTRA_CA_CERTS`, bukan `NODE_TLS_REJECT_UNAUTHORIZED=0`. Node22 terbaru mendukung `NODE_USE_SYSTEM_CA=1`. Installer di sandbox ini terhalang release-assets, bukan bukti jaringan hosting Anda sama.

Ekstraktor situs berubah; update secara terencana melalui rilis resmi + checksum, uji ulang. Binary eksternal tidak dimasukkan ZIP/Git source. Defaultformat mengecualikan known-height>1080p, mengizinkan unknown-height; batas file/timeout/cache tetap berlaku. Tidak ada dukungan cookies/login/DRM bypass otomatis.

## Migrasi dari data Python/proyek asli

Format `sources.json` lama berupa list maupun envelope `{sources,tvh_enabled}` tetap diterima. ID channel memakai hash yang sama. `playlists.json` dan descriptor `kind/path/id/url/title` dipertahankan. JSON corrupt membuat startup **gagal tertutup**, bukan diam-diam menimpa dengan data kosong.

1. Hentikan server lama. Backup `.env`, `sources.json`, `playlists.json` dan semua media pada penyimpanan privat.
2. Instal source Node di folder baru. Jangan meng-copy venv, cache, node_modules, artifact Python atau token user Discord.
3. Bila `DATA_DIR` baru berbeda, salin data dengan migrator tanpa overwrite:

```bash
npm run migrate:data -- --source /path/old/data --target /path/new/data
```

Semua input/destinasi diperiksa sebelum menulis. Publikasi memakai hard-link atomik no-clobber sehingga file/symlink tujuan yang muncul bersamaan tetap tidak ditimpa. Error filesystem pada file kedua masih memerlukan pemeriksaan admin terhadap file pertama yang sudah sukses; ini bukan transaksi database lintas-file. Original tidak dihapus. Script tidak mencetak isi/URL/secret.

4. Salin/pindahkan **media** sendiri, jaga path relatif sama dengan descriptor playlist. Cache/HLS disposable tidak perlu dipindah.
5. Review `.env.example` baru. `DISCORD_TOKEN` lama sengaja diabaikan. Gunakan application `DISCORD_BOT_TOKEN` resmi + allowlists. Command prefix lama digantikan slash; private video tidak dipindah.
6. Set `DATA_DIR`/`MEDIA_DIR`, binary paths, port dan password. Preflight → tes library/upload/playlist/channel sendiri. Setelah yakin, arsipkan instalasi lama; jangan biarkan startup lama tetap aktif.

## Reverse proxy / HTTPS

Proxy HTTP dan upgrade WebSocket menuju satu allocation. Public-facing JavaScript memakai relative API URLs dan host saat ini, bukan localhost browser. Set `PUBLIC_URL=https://media.domain.tld`, `COOKIE_SECURE=true`, HTTP→HTTPS redirect di proxy. Pertahankan Host/Origin; write/WS cross-origin ditolak. Upload size dan timeout proxy harus cukup untuk konfigurasi MAX_UPLOAD_MB. Jangan expose DATA_DIR atau filesystem lewat static web server lain.

## Update

Backup JSON/media/env; stop proses; perbarui source pada branch/release yang Anda pakai; `npm ci --include=dev && npm run build`, update standalone binary bila perlu, preflight dan restart. Jangan overwrite data dari source/archive. Image Wings menyimpan seed immutable; instalasi volume yang sudah ada **tidak** otomatis di-upgrade hanya dengan mengganti image—review source/dependency secara eksplisit.

[Konfigurasi](CONFIGURATION.md) · [Pterodactyl](PTERODACTYL.md) · [Laporan tes](TESTING.md)
