# Laporan pengujian JavaScript — 666 Streaming 2.0.0

Tanggal: **13 November 2026 (UTC)**. Semua hasil di halaman ini untuk backend **Node.js**, bukan 269 tes Python dari pekerjaan sebelumnya. Runtime/source Python lama sudah digantikan; tidak dipakai sebagai bukti tes migrasi.

## Lingkungan yang benar-benar tersedia

- Linux x64/glibc, Node **22.22.3**, npm **10.9.8**.
- discord.js **14.28.1**, @discordjs/voice **0.19.2**, opusscript package **0.1.1**, @snazzah/davey **0.1.12**. Import produksi dan Opus encode/decode nyata berhasil. Dependency report library menampilkan versi internal opusscript 0.0.8, sedangkan metadata paket terpasang/lockfile 0.1.1.
- Express 5.3.0, ws 8.23.0, busboy 1.6.0, saxes 6.0.0, dotenv 18.0.10, hls.js 1.7.4; versi langsung/transitif lengkap di package-lock.json.
- FFmpeg **n9.0.2-17-g2a571b6068-20260930** dan FFprobe **n8.0.1-40-gabb609bb58-20260107** khusus test. Tidak ada FFmpeg/FFprobe sistem di PATH awal. Dipanggil langsung sebagai executable oleh Node, **bukan** melalui interpreter/paket Python pada aplikasi.
- yt-dlp standalone resmi **2026.08.19**, byte-for-byte SHA256 **`58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a`** cocok dengan digest rilis GitHub. Binary diperoleh dari tarball registry `@involvex/yt-dlp-binary-linux-x64@2026.8.22` sebagai alat test cache saja; **bukan dependency produksi**. Binary ini membawa CPython internal sesuai persetujuan pengguna.
- Installer produksi pin yt-dlp **2026.10.26**. Metadata/digest asset resmi dapat dibaca, tetapi download release-assets diblokir sandbox. `npm run install:ytdlp` dicoba dan **gagal karena jaringan**; tidak dicatat lulus dan tidak diganti zipapp/pip. Versi pin terbaru itu **belum dijalankan** di sini.
- Chromium 153 melalui Playwright-core 1.65.0/@sparticuz/chromium 153.0.0 untuk browser E2E. NSS/NSPR tambahan dari paket Chromium dipakai pada runner minimal. Tidak mematikan web security atau menambahkan flag single-process yang tidak stabil.

Binary test tidak dibundel di source/ZIP/Git. Hosting wajib menyediakan binary OS/arsitektur yang sesuai dan lulus preflight sendiri. FFmpeg 6-static tertentu yang diuji pada pekerjaan lama pernah crash membaca HLS; ini bukan klaim seluruh FFmpeg 6 rusak. Versi JS tetap menguji HLS **reader** sungguhan, bukan hanya encoder/version.

## Hasil eksekusi yang tercatat

| Pemeriksaan | Hasil |
|---|---|
| `npm ci --include=dev`, npm dependency tree | Lulus dari ZIP bersih tanpa `.git`; package-lock produksi/dev valid |
| Syntax check 45 file JS/MJS + import seluruh backend/dependency | Lulus; import tidak membuka port/login bot |
| ESLint seluruh src/scripts/tests/frontend | Lulus |
| Build aset lokal esbuild, font dan lisensi | Lulus |
| Node test runner (`node --test`, concurrency1) | **158 lulus, 0 gagal, 0 skip, 0 cancelled** |
| Run dengan V8 coverage (src saja) | **158 lulus dalam 60.35s**; line 86.52%, branch 82.01%, function 84.40% |
| Browser E2E nyata | Lulus; 5 kelompok pemeriksaan di bawah |
| `npm run check` dengan binary sehat | Lulus; video libx264, AAC, HLS dibuat dan dibaca FFmpeg+FFprobe, standalone yt-dlp |
| `npm run check` extractor/binary hilang | Gagal dengan pesan aman/exit 1 **sesuai harapan** |
| Preflight dengan PATH hanya node/ffmpeg/ffprobe/yt-dlp, **tanpa python/pip** | Lulus dari working directory lain |
| Port ala Pterodactyl (PORT kosong→SERVER_PORT), proxy Host, SIGINT | Lulus pada proses Node lokal, bukan deployment Wings |
| SIGTERM saat FFmpeg+WS aktif / saat yt-dlp metadata menunggu HTTP | Lulus; child direap, shutdown bersih |
| Process group stubborn grandchild, TERM→KILL | Lulus; tidak meninggalkan descendant yang berjalan |
| `npm audit --omit=dev` | **0 vulnerability produksi terlapor** saat diperiksa; bukan jaminan keamanan permanen |
| Shell syntax/egg JSON/startup/branding/license audit | Lulus; 7 shell scripts, 5 YAML configs + egg JSON parse; LICENSE SHA identik asli |
| Ekstrak ZIP tanpa `.git` → npm ci/build/tes/browser | Lulus, termasuk lokasi dengan parent tersembunyi `.cache` |
| `npm ci --omit=dev` → preflight + codec/API/lifecycle | Lulus; **31/31 tes**, tanpa esbuild/ESLint/Playwright/Chromium |
| Preset `.env` panel generik | Lulus; allocation Wings tidak ditimpa, env secret/image tetap menang, CPU/1 stream |
| ZIP integrity/exclusions/checksum/reproducibility | Lulus; built assets/source/lock/docs/attribution, tanpa secret/data/binary/cache Python |
| Docker build/Compose runtime/Wings deployment | **Belum diuji**; Docker daemon/Wings tidak tersedia |

Coverage bukan bukti integrasi eksternal. Bagian slash handlers/component UI/voice transport live mempunyai coverage lebih rendah; tidak ada token/guild untuk mengujinya. Test unit yang memakai stub interaction hanya menguji izin/routing/lifecycle, **bukan** menggantikan streaming atau mengklaim Discord online.

## Distribusi bersih, bukan bergantung checkout developer

Source ZIP dibangun oleh `npm run archive`, diuji CRC dengan `unzip -t`, diperiksa daftar file dan SHA-256, lalu diekstrak ke direktori baru **tanpa Git maupun node_modules**. Dari hasil ekstraksi tersebut dijalankan `npm ci --include=dev`, source/import/lint/build, seluruh **158 tes** dengan coverage, dan browser E2E. Setelah itu dependency diganti lewat `npm ci --omit=dev`: preflight dan **31 tes** Discord codec/lifecycle/API/media kembali lulus. Tes Discord ini tetap tidak melakukan login jaringan.

Smoke test semula menemukan Express menolak index pada direktori parent tersembunyi. Penyajian index/HLS kini memakai root eksplisit yang dibatasi; tes API menjalankan aset **dan cache media** di direktori tersembunyi dan memastikan permintaan dotfile tetap ditolak. Regresi arsip juga memverifikasi cache `__pycache__`/`.pyc`, file Python, `.env`, runtime data dan dependency tidak ikut, symlink ditolak, built assets wajib, dan input identik menghasilkan ZIP identik pada toolchain yang sama.

Salinan output (hanya spasi akhir baris dirapikan) disertakan di [verification/node-test-report.txt](verification/node-test-report.txt), [browser-test-report.txt](verification/browser-test-report.txt), [production-install-smoke.txt](verification/production-install-smoke.txt), dan [deployment-inspection.txt](verification/deployment-inspection.txt). Ini log test lokal, **bukan hasil GitHub Actions, Docker atau Wings**.

## Bukti media dan browser nyata

Tes membuat media temporer melalui FFmpeg (test pattern + sine 440Hz) di folder test lalu benar-benar memproses/decode byte tersebut. Fixture tidak ditambahkan ke library produksi/source atau disebut sebagai konten provider nyata.

### Media / provider pipeline

- Video+audio, **audio-only**, **video-only** lokal → FFprobe → FFmpeg HLS → FFprobe metadata dan FFmpeg decode. Output manifest endlist, track dan cleanup diverifikasi.
- HTTP HLS input: upstream playlist **dan segmen.ts benar-benar diminta**; output HLS baru dibaca ulang. Bukan API mengembalikan status playing palsu.
- IPTV channel descriptor → stored network URL → real FFmpeg A/V/HLS. M3U/EPG/auth/toggles/private listing juga dites terpisah.
- **yt-dlp mandiri sungguhan** mengekstrak halaman HTML5 HTTP lokal, mengunduh video, lalu hasil unduhan diputar melalui FFmpeg/HLS. Ini memverifikasi generic extraction/worker/format/disk/lifecycle, **bukan akses YouTube/Twitch**.
- Controlled Jellyfin HTTP API → Users/PlaybackInfo → authenticated HLS+segments nyata → FFmpeg output/decode. Controlled TVheadend channel/EPG/BasicAuth → stream byte A/V nyata → output/decode. Ini tes kontrak end-to-end lokal, **bukan server provider eksternal**.
- M3U BOM/attrs/quoted comma/relative URL, EPG backfill, Basic URL credentials dan cross-origin redirect auth stripping.
- XMLTV timezone +0700/-0500/UTC, invalid dates, entities, gzip, expanded size bounds, DOCTYPE rejection. Streaming SAX parser tidak membuat DOM seluruh guide.
- Jellyfin search/series→season→episode/SxxExx, user cache, H.264/AAC profile, subtitle suppression, API key internal; TVH channel sorting/disable/client-side EPG filter/cache/IPv6 credentials.
- HTTP404 sungguhan, corrupt local media, slow HTTP/cancel, invalid schema, auth/origin/file traversal, stream cap/cache/idle limits dan no-clobber file migration/upload.

### Browser E2E — lima kelompok yang lulus

1. Login, layout desktop 1440×1000/mobile 390×844 tanpa horizontal overflow, create/save playlist, upload A/V 24 detik melalui UI, queue add dan **HLS video currentTime>0.3/videoWidth=320**.
2. Dua browser/context pada room berpassword, real WebSocket pause dan seek. Manifest anonim ditolak 401.
3. Stop menunggu cleanup, playlist tetap tersimpan, actual URL 404 menampilkan error tanpa crash server.
4. Jalur Jellyfin **series→season→episode** melalui UI benar-benar memakai seriesId+SeasonId dan memutar video nyata dari controlled service. Memperbaiki pemanggilan episode lama yang memakai season ID sebagai series route.
5. Shutdown SIGTERM dengan active FFmpeg dan WS: exit 0 dan PID child tidak tersisa. Dilakukan terhadap **Node entrypoint**, bukan server lama.

### Discord yang feasible tanpa credential

- Seluruh payload slash asli tervalidasi builder discord.js14, allowlist snowflakes string-presisi, bitmask viewer/operator/admin, penolakan DM/guild yang salah.
- Client diinstansiasi/destroy tanpa login; hanya intents Guilds/GuildVoiceStates, tanpa Members/MessageContent/selfbot.
- PCM asli di-encode **dan decode Opus**, crypto AES256GCM tersedia dan DAVE native module dapat di-import.
- EPG horizon/airing/number/substring, cancel timer/voice-presence check; collector abort, ephemeral follow-up, stop/leave membatalkan pekerjaan yang menunggu tanpa deadlock guild-lock.
- **Tidak** mencakup login Bot API, register command secara live, suara terdengar pada guild, koneksi UDP, Stage, moving/kick/reconnect/auto-leave atau DAVE transport Discord nyata.

## Perbaikan yang ditemukan selama migrasi

- Menghapus launcher npm→Python; semua aktif backend/start/build/migrator/CI beralih Node.
- Format extractor semula menolak tinggi video yang belum diketahui; selector memakai `height<=?1080` agar generic media tetap valid tanpa mengunduh known 4K.
- Upstream MP4 test tanpa faststart/range tidak bisa diputar dari HTTP; fixture diperbaiki menjadi faststart (syarat server HTTP dijelaskan, bukan mengklaim memecahkan semua source seekless).
- Stop UI semula mengumumkan idle sebelum server selesai cleanup; status akhir kini menunggu respons stop.
- Season→episode Jellyfin memakai kedua ID yang tepat.
- Semua follow-up slash tetap ephemeral, bukan hanya deferred reply pertama.
- Voice play baru/stop/leave membatalkan resolusi lama sebelum guild lock; collector dapat dibatalkan saat shutdown.
- Termination tetap KILL sisa process group jika parent sudah exit tetapi grandchild mengabaikan TERM.
- Serving index/HLS dari direktori parent tersembunyi diperbaiki dengan root eksplisit; dotfile tetap terlarang.
- Cache bytecode Python lama dikecualikan dari ZIP; symlink/kehilangan aset diblokir. Docker source kini membuat data directory milik non-root sebelum named-volume mounting (runtime Docker tetap belum diuji).
- Private listing/toggle invalidation, path-portability executable, CA error/install failure reporting dan no-Python-PATH startup diuji nyata.

## Yang belum dapat diuji / tidak diimplementasikan

**Belum diuji eksternal:** YouTube VOD/live, Twitch, feed IPTV/XMLTV publik/private sebenarnya, Jellyfin/TVheadend milik pengguna; token Discord/guild/UDP/DAVE nyata; Docker/Compose/Wings; GPU/NVENC/VAAPI/OpenH264; Safari/iOS/native HLS; Windows/macOS/ARM runtime; long-running6jam/load multi-user/beban hosting.

**Sengaja tidak diimplementasikan:** selfbot/user token, native bot Go Live/screenshare/camera, private H264/RTP/gateway patch/PCAP forensic runtime, Embedded App SDK integration tanpa setup Activity, DRM/login/cookies bypass, MongoDB yang tidak dibutuhkan, persistent/distributed scheduling atau frame-perfect sync. Lihat [matriks fitur](FEATURES.md).

Tidak ada pernyataan “100% semua provider/hosting sudah berhasil”. [Checklist tes hosting](PTERODACTYL.md#checklist-pengujian-di-hosting-sebenarnya) tetap wajib.

## Reproduksi

```bash
npm ci --include=dev
npm run build
npm run install:ytdlp     # atau upload standalone resmi yang checksum-nya cocok
npm run check
npm run check:source
npm run lint
npm test
npm run test:browser
npm audit --omit=dev
```

Gunakan env `FFMPEG_PATH`, `FFPROBE_PATH`, `YTDLP_PATH` untuk binary yang benar pada mesin Anda. `npm test` sengaja gagal jika utilitas media wajib tidak tersedia; tidak ada skip diam-diam yang dianggap sukses. Runtime standalone yang disetujui tidak memerlukan Python/pip dalam PATH.

CI [ci/test/run.sh](../ci/test/run.sh) menyiapkan npm/build, menginstal standalone lalu menjalankan Node coverage+browser. Konfigurasi CI disiapkan tetapi belum dijalankan sebagai GitHub Actions eksternal pada sesi ini. Log mentah lokal ada di `artifacts/`; salinan hasil terakhir disertakan pada `docs/verification/`, bukan dependency atau data produksi. Arsip Python lama dan log intermediate dipisahkan ke `artifacts/historical-python/` yang tidak ikut distribusi JavaScript.
