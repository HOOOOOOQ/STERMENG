# Pterodactyl — 666 Streaming / Node.js22

**Target:** Linux64/glibc, satu primary allocation TCP, app berjalan sebagai UID1000 non-root, Node22.17+ (major22). Tidak ada Python/pip application install. yt-dlp mandiri tetap membawa CPython internal sebagai utilitas eksternal yang disetujui.

> Konfigurasi di repo siap untuk diuji di panel; **tidak ada Docker daemon/Wings di sandbox pengembangan**, jadi tidak diklaim sudah berhasil deploy di Wings. Lakukan checklist akhir di hosting Anda.

## A. Jalur rekomendasi: image kustom Node22

Administrator node/container:

```bash
# Pada mesin dengan Docker + akses npm/GitHub release assets:
docker build -t 666-streaming:local .
# Bila Wings berada di mesin lain, tag/push image ke registry milik Anda.
```

[Dockerfile](../Dockerfile) memakai `node:22-bookworm-slim` untuk build/runtime, apt FFmpeg/FFprobe+CA+tini, npm produksi, aset lokal, dan installer yt-dlp standalone checksum-verified. Build **gagal** bila asset resmi tidak dapat diunduh; tidak diam-diam beralih ke pip. Tidak ada image publik yang diklaim tersedia.

1. Import [egg-666-streaming.json](../deploy/pterodactyl/egg-666-streaming.json). Field author template `admin@example.com` diganti email administrator panel Anda bila diperlukan; ini bukan credential.
2. Pilih image yang benar-benar sudah dibangun/tersedia pada node. Ubah nama image di egg jika mempublikasikan tag sendiri.
3. Set primary allocation TCP. Pterodactyl menyuplai `SERVER_PORT`; biarkan `PORT` kosong. Startup **`node src/index.js`**.
4. Set `APP_PASSWORD`, `PUBLIC_URL` root HTTPS, dan `COOKIE_SECURE=true` di belakang reverse proxy. Atur provider/token bot melalui environment privat bila diperlukan. Jangan gunakan token user Discord.
5. Install/start. Volume kosong di-seed dari `/opt/666-streaming` **sekali**. `cp -rn` tidak menimpa instalasi/config/data yang ada. Source parsial ditolak agar tidak menyembunyikan file yang hilang.
6. Bila meng-upload source JS baru ke volume lama, lakukan `npm ci --include=dev && npm run build` (kemudian prune dev opsional); pastikan versi image/binary sesuai. **Mengganti image tidak otomatis meng-upgrade source/dependency di volume.**

Image menjalankan `tini` → entrypoint `exec` → Node, sehingga signal panel sampai ke pengelola child. Stop command egg `^C`/SIGINT didukung, juga SIGTERM. Grace period minimum30detik (Compose60detik); jangan langsung SIGKILL ketika FFmpeg/extractor masih membersihkan cache.

## B. Image Node22 lain / source upload manual

Boleh hanya bila administrator membuktikan image tersebut punya:

- Node22 dan npm; glibc-compatible native DAVE dari npm.
- `ffmpeg` **dan** `ffprobe` sehat, encoder libx264+AAC+HLS. Node image standar/yolk tidak otomatis menjamin FFmpeg tersedia.
- Standalone yt-dlp resmi, executable dan arsitektur sesuai. Set `YTDLP_PATH` ke absolute path; dapat dipasang via `npm run install:ytdlp` bila GitHub diizinkan atau upload binary terverifikasi.
- CA certificates dan permission baca/tulis pada `/home/container`/data.

Sebagai server user (bukan apt/root di console panel):

```bash
cd /home/container
npm ci --include=dev
npm run build
npm run install:ytdlp  # jika binary belum disediakan image
npm run check
# Set startup panel ke node src/index.js, lalu Start.
```

Jika build dependency dev dihilangkan oleh `NODE_ENV=production`, gunakan `npm ci --include=dev` untuk build lalu `npm prune --omit=dev`. Jangan mencoba memasang FFmpeg melalui npm wrapper Python; minta admin memperbaiki image atau upload build OS tepercaya dengan dependency lengkap. Tidak perlu MongoDB/Redis lokal.

## C. Isian egg Node.js generik seperti screenshot panel

Screenshot memakai **Nodejs 25** dan main file `index.js`. Keduanya tidak sesuai: aplikasi sengaja memerlukan **Node.js 22.17+ pada major 22** dan entrypoint **`src/index.js`**. Pilih image Node22 yang benar-benar menyediakan FFmpeg/FFprobe. Jika daftar image hanya berisi Node25 atau image Node22 tidak memiliki utilitas media, minta admin hosting menyediakan image dari bagian A/B; mengganti kolom paket npm tidak memasang FFmpeg sistem. Nama image/dropdown saja bukan bukti isinya.

Pilih **satu** metode instalasi berikut; jangan mencampur upload ZIP dengan auto-pull Git pada folder yang sama:

| Kolom pada screenshot | Upload ZIP JavaScript (lebih mudah) | Clone repo |
|---|---|---|
| DOCKER IMAGE | Node.js22 + FFmpeg/FFprobe; bukan Nodejs25 | Sama |
| GIT REPO ADDRESS | Kosong | `https://github.com/HOOOOOOQ/STERMENG.git` |
| INSTALL BRANCH | Kosong | Branch berisi source JavaScript yang sudah dipush; lihat catatan di bawah |
| USER UPLOADED FILES | **ON / 1** | **OFF / 0** |
| AUTO UPDATE | **OFF / 0** | **OFF / 0**; update source/dependency secara terencana |
| ADDITIONAL NODE PACKAGES | Kosong; dependency sudah di `package.json`/lockfile | Kosong |
| GIT USERNAME | Kosong | Kosong untuk repo publik ini |
| GIT ACCESS TOKEN | Kosong | Kosong untuk repo publik ini; jangan mengirim credential ke chat |
| UNINSTALL NODE PACKAGES | Kosong | Kosong |
| MAIN FILE | **`src/index.js`** | **`src/index.js`** |
| ADDITIONAL ARGUMENTS | Kosong pada startup normal | Kosong pada startup normal |

**Branch instalasi:** sebelum PR migrasi digabung, gunakan `arena/71b54402-stermeng` untuk mencoba source sesi ini. Setelah PR digabung ke branch default `develop`, `develop` dapat dipakai untuk instalasi berikutnya. Pada pemeriksaan 13 November 2026, repo hanya memiliki branch default `develop`, bukan `main`; jangan mengisi `main` yang belum ada atau menganggap PR otomatis sudah digabung.

### Upload ZIP lewat file manager

1. Stop server dan backup `.env`/JSON/media yang ada. Jangan klik reinstall pada data lama tanpa backup.
2. Upload dan ekstrak **`666-streaming-javascript-source.zip`** ke `/home/container`, bukan ZIP Python lama. Pastikan `package.json`, `package-lock.json`, `src/index.js` dan `public/index.html` langsung berada di root/struktur tersebut, tidak di subfolder ZIP tambahan.
3. ZIP sudah mempunyai aset web siap-serve. Instal dependency dengan `npm ci --omit=dev` lewat terminal/install script hosting. Jika egg otomatis menjalankan npm saat Start, cek lognya; jangan menganggap toggle USER UPLOADED FILES menginstal dependency. Toggle itu dapat melewati tahap instalasi egg. Jangan mengisi ADDITIONAL NODE PACKAGES dengan seluruh daftar dependency atau FFmpeg.
4. Melalui file manager, salin isi [preset panel](../deploy/pterodactyl/.env.example) ke file baru **`/home/container/.env`**. Mulai dengan satu stream/CPU encoder. Isi password privat atau baca password bootstrap di `data/initial-password` setelah Start. Template tidak menyimpan password/token nyata.
5. `PORT` tetap kosong. **Jangan menulis SERVER_PORT sembarang**: Wings menyuplai primary allocation melalui environment. `PUBLIC_URL` boleh kosong untuk tes awal; jika diisi, pakai root URL aplikasi yang diakses penonton, **bukan alamat halaman admin panel `/server/…`**. HTTP langsung memakai `COOKIE_SECURE=false`; di belakang HTTPS pakai `true`.
6. Sediakan standalone yt-dlp melalui image atau [instalasi manual terverifikasi](INSTALLATION.md#yt-dlp-mandiri). Bila binary diupload ke `bin/yt-dlp`, pastikan permission executable (755). FFmpeg/FFprobe tetap wajib; app tidak memasang paket OS dari console panel.
7. Jalankan `npm run check` dari terminal/install script. Jika hanya tersedia kolom pada screenshot, ADDITIONAL ARGUMENTS boleh **sementara** diisi `--check` **hanya bila** egg meneruskannya setelah nama file (`node …/src/index.js --check`); minta admin memeriksa command startup jika tidak terlihat. Hasil wajib menyebut `AAC/HLS/FFprobe OK` dan versi/status yt-dlp. `node --check …/src/index.js` hanya memeriksa syntax, **bukan** preflight media. Setelah pemeriksaan selesai, Stop dan **kosongkan lagi** kolom argumen. Mode check memang exit, bukan server yang harus dibiarkan auto-restart.
8. Start normal dengan MAIN FILE `src/index.js`, argumen kosong. Tunggu log `666 Streaming siap`; buka allocation HTTP aplikasi atau domain reverse proxy, bukan URL halaman console panel. `/healthz` harus menjawab identitas 666 Streaming. Lanjutkan checklist media di bawah.

**Console Pterodactyl bukan selalu shell Linux.** Jika server sedang menjalankan Node, mengetik `npm ci`, `apt` atau `chmod` di console dapat hanya mengirim teks ke stdin aplikasi. Gunakan fitur terminal/install script yang benar, file manager untuk upload/permission jika tersedia, atau minta admin menjalankan setup. Jika egg/image tidak bisa menginstal npm maupun menyediakan binary yang diperlukan, pengisian kolom startup saja belum cukup untuk menjalankan aplikasi.

### Bila memilih clone repo

Set kolom repo/branch seperti tabel lalu gunakan proses install egg pada volume kosong. **Clone dari Git tidak membawa `public/`** karena aset build tidak di-track. Administrator/install script wajib menjalankan `npm ci --include=dev && npm run build` lalu `npm prune --omit=dev` jika diinginkan, memasang standalone yt-dlp bila belum disediakan image, dan menjalankan preflight. Clone sukses atau `npm install` saja belum membuktikan dashboard selesai dibuild. Setelah itu buat `.env` dari preset panel dan Start seperti langkah di atas.

## Port / proxy / network

- `HOST=0.0.0.0`, urutan port **PORT → SERVER_PORT →8080**. Port dalam app harus allocation panel, bukan angka arbitrer frontend.
- HTTP API, media dan WebSocket ada pada satu listener. Proxy harus mempertahankan Host dan mengizinkan Upgrade/Connection untuk WS.
- Browser memanggil URL relatif, **tidak** `localhost` untuk backend. `PUBLIC_URL` harus alamat yang bisa dicapai penonton, bukan IP internal Wings.
- `COOKIE_SECURE=true` hanya bila client memakai HTTPS. Jika membuka langsung HTTP dengan secure cookie, login tampak tidak tersimpan.
- Jaringan perlu akses provider, GitHub/npm saat install/update, Discord HTTPS/WSS dan **outbound UDP** untuk voice. Tidak perlu allocation UDP inbound statis khusus untuk dashboard, tetapi NAT/firewall host tetap dapat menggagalkan voice.
- Jangan menganggap localhost Jellyfin/TVheadend di container adalah mesin host. Gunakan hostname/IP yang memang routable dan credential env.

## Resource / disk / izin

Awali `MAX_STREAMS=1`,720p/30FPS, FFmpeg threads1–2, resolusi lebih rendah bila sharedCPU. Belum ada benchmark universal; tambahkan stream setelah memonitorCPU/RAM. Encoding lambat/buffering bukan diperbaiki dengan tombol dummy.

Disk: JSON privat, library upload, MAX_STREAMS×cache cap, temporary VOD dan npm deps. Cache diperiksa10s, bukan hard quota filesystem realtime; beri margin. Data/media harus writable oleh UID server. Backup JSON/media/env secara privat, jangan cache. Image source root-readable tetapi runtime berjalan non-root.

GPU tidak default. NVENC membutuhkan perangkat NVIDIA/driver/container-runtime administrator. VAAPI membutuhkan `/dev/dri`, driver/permission dan VAAPI_DEVICE. Jangan menambahkan mount GPU pada shared panel tanpa dukungan host. Preflight akan benar-benar mencoba encoder.

## Checklist pengujian di hosting sebenarnya

1. `node --version`, `ffmpeg -version`, `ffprobe -version`; pastikan commandstartup Node langsung.
2. `npm run check` exit0: video, AAC, HLS readback dua binary dan yt-dlp mandiri.
3. Log `666 Streaming siap`; GET `/healthz`200 dari alamat publik/Host proxy.
4. Login HTTPS, cookie aman, upload file milik sendiri, video/audio terputar; manifest anonim401.
5. Uji satu URL YouTubeVOD, YouTubeLive, Twitch, IPTV+XMLTV sendiri; catat URL/waktu privat dan hasil tanpa membagikan credential.
6. Uji Jellyfin PlaybackInfo, season/episode dan TVheadend EPG/stream dengan server nyata.
7. Uji bot login/slash/guild/Connect/Speak dan suara terdengar; jangan mengharapkan video native. Coba auto-leave/move/stop.
8. Dua browser watch-room play/pause/seek, lalu Stop saat FFmpeg aktif. Restart/stop panel; pastikan tidak ada orphan `ffmpeg`/`ffprobe`/`yt-dlp`.
9. Backup/persistence sources/playlists/media setelah restart; jadwal in-memory memang hilang.

## Troubleshooting

| Gejala | Periksa |
|---|---|
| FFmpeg/FFprobe tidak tersedia | Image OS, absolute paths; keduanya diperlukan |
| HLS/MPEG-TS preflight gagal meski MP4 encode jalan | Build binary/reader crash; gunakan build sistem sehat |
| yt-dlp installer fetch failed | Egress release-assets/CA; pasang manual checksum-verified, bukan disableTLS |
| Login tidak bertahan | Secure cookie denganHTTP, reverseproxy/Host mismatch, restart sessions |
|403 saat POST/WS | Origin host/port tidak cocok dengan Host proxy |
| Bot commands tidak muncul | Scope applications.commands, guild ID/global propagation, token/izin |
| Bot joined tapi tidak ada audio | OutboundUDP, Speak/Stage suppression, track audio, actual media error |
| Cache/CPU penuh | Turunkan resolusi/bitrate/stream cap, hentikan sesi, periksa ruangdisk |
| Source lama tidak berubah setelah update image | Volume tidak ditimpa; update source/dependency secara eksplisit |

[Instalasi](INSTALLATION.md) · [Konfigurasi](CONFIGURATION.md) · [Batas fitur/tes](TESTING.md)
