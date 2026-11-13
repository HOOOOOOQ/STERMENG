# Atribusi dan dependency

## Proyek asal dan lisensi

666 Streaming diturunkan dari **Slopsoil**, karya **topsoil / dev-topsoil**:

- Source: https://github.com/dev-topsoil/slopsoil
- Dukungan pembuat asli: https://www.buymeacoffee.com/devtopsoil
- Checkout turunan: https://github.com/HOOOOOOQ/STERMENG
- Baseline sebelum perubahan: `8ba7e071fd89ccc2410b726ff1a99553ba50f554`.

**LICENSE GPLv3 asli tidak diubah.** SHA-256:`3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. Identitas publik diganti menjadi 666 Streaming; atribusi tidak dihapus. Perpindahan Python→JavaScript mempertahankan logika provider, schema, kontrak media dan alur perintah yang dapat dilakukan melalui API resmi; [pemetaan](docs/AUDIT-JAVASCRIPT.md) menjelaskan sisanya. Source lama/penelitian tersedia melalui Git baseline dan [arsip protokol](docs/PROTOCOL-REFERENCE.md), bukan runtime aktif.

## Dependency JavaScript produksi

Versi aktual dan seluruh dependency transitif dipin di `package-lock.json`; gunakan `npm ci`. Masing-masing lisensi berlaku, tidak diganti dengan lisensi proyek ini.

| Package langsung | Versi | Lisensi / fungsi |
|---|---|---|
| discord.js |14.28.1|Apache-2.0; official bot |
| @discordjs/voice |0.19.2|Apache-2.0; official voice, crypto/DAVE transport |
| opusscript |0.1.1|MIT package + libopus BSD3; Opus/WASM |
| express |5.3.0|MIT; HTTP API |
| ws |8.23.0|MIT; watch synchronization |
| busboy |1.6.0|MIT; bounded multipart upload |
| saxes |6.0.0|ISC; streaming XML parser |
| dotenv |18.0.10|BSD-2-Clause; environment loader |
| hls.js |1.7.4|Apache-2.0; browser HLS |
| @fontsource-variable/manrope |5.3.0|font SIL OFL1.1 |
| @fontsource/barlow-condensed |5.3.0|font SIL OFL1.1 |

Voice memasang `@snazzah/davey`/native platform dependency melalui npm; tidak memakai shim DAVE Python historis. Instalasi sandbox teruji pada Linux x64/glibc dan Node22. Voice network/Discord E2EE nyata tetap perlu credential/guild/UDP dan belum diverifikasi.

Font dan hls.js dibundel lokal, tanpa CDN. Build menyalin lisensinya ke `public/licenses/`. Logo SVG 666 Streaming adalah aset rebranding source sendiri, bukan logo Discord/YouTube/Twitch. Nama provider hanya menjelaskan integrasi, bukan endorsement.

## Utilitas eksternal

- **FFmpeg/FFprobe**: https://ffmpeg.org — lisensi bergantung opsi build, LGPL/GPL (libx264 membuat build GPL). Bukan runtime Python. Image memakai paket OS; uji encoder/demuxer aktual dan patuhi kewajiban redistribusi binary yang Anda pilih. Binary pengujian tidak dibundel dalam source/Git/ZIP.
- **yt-dlp**: https://github.com/yt-dlp/yt-dlp — source yt-dlp Unlicense; binary standalone juga menggabungkan dependency dengan lisensi masing-masing (rilis menandai executable distribusi sebagai GPLv3+). Gunakan lisensi/notice rilis resmi untuk binary tersebut, jangan mengklaim seluruh executable hanya Unlicense.
- Pengguna **secara eksplisit menyetujui yt-dlp mandiri**: tidak perlu Python sistem, tetapi membawa CPython internal. Aplikasi sendiri Node/JS. Installer pin2026.10.26, asset platform resmi+SHA256; tanpa wrapper npm/Python zipapp. Rilis belum dapat diunduh dari sandbox lokal karena egress release-assets, tetapi installer di GitHub Actions berhasil mengunduh/verifikasi versi pin2026.10.26 dan suite CI media/browser berhasil pada run43353189763. Test lokal menggunakan byte binary resmi2026.08.19 (hash cocok GitHub), diperoleh dari package registry sebagai **alat test cache**, bukan dependency produksi aplikasi.
- Test FFmpeg9/FFprobe8 dan versi yt-dlp dirinci di [TESTING](docs/TESTING.md). Jangan menganggap sandbox binary sebagai jalur path hosting.

## Tooling pengembangan saja

ESLint/@eslint/js (MIT), globals (MIT), esbuild (MIT), Playwright-core (Apache-2.0), @sparticuz/chromium (MIT package, Chromium dan komponen OS mempunyai lisensi tersendiri). Tidak dipakai backend produksi setelah build/prune. Node.js mempunyai lisensi/third-party notices sendiri dalam distribusi resminya. Tidak ada dependency pip, pytest, Ruff atau prasyarat interpreter Python sistem pada aplikasi/deployment JavaScript; pengecualian CPython internal utilitas yt-dlp tetap berlaku seperti dijelaskan di atas.
