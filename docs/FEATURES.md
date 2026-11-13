# Matriks fitur dan paritas

**Implemented** di bawah berarti ada jalur kode JavaScript yang berfungsi dan tes yang disebutkan; bukan klaim provider eksternal sudah diverifikasi. Semua hasil Python lama tidak dihitung untuk versi2.0. Lihat [TESTING](TESTING.md).

| Fitur asal/kebutuhan | Padanan JavaScript saat ini | Verifikasi / batas |
|---|---|---|
| Entry point/runtime Python | Node22, ES Modules, Express/ws, discord.js14 | Syntax/import/npm/startup nyata; tidak menjalankan source Python |
| YouTube/Twitch/yt-dlp | Standalone extractor → live combined A/V atau VOD download | Binary resmi dan generic HTML5 download → FFmpeg nyata teruji; **YouTube/Twitch eksternal belum teruji**, akses jaringan sandbox terbatas |
| IPTV/M3U | EXTINF/attrs/groups, relative URLs, source toggles, refresh/import | Parser+HTTP dan channel→HLS video nyata teruji; tidak ada daftar channel ilegal/demo bawaan |
| XMLTV | SAX timezone/entity handling, gzip, now-playing/cache | HTTP gzip nyata dan parser teruji; feed provider eksternal belum |
| TVheadend | Basic auth, channels, EPG, now-playing, stream | Contract + BasicAuth stream→real HLS/decode pada HTTP terkontrol teruji; TVheadend eksternal belum |
| Jellyfin | API key, search film/series/episode, season/episode, SxxExx, PlaybackInfo H264/AAC | HTTP contract, PlaybackInfo→HLS/decode dan UI series/season/episode teruji pada layanan terkontrol; Jellyfin eksternal belum |
| File lokal/upload | Realpath confinement, format library, stream upload no-clobber | Video+A/V, audio-only, video-only, concurrent upload, overflow/cleanup teruji |
| Direct URL | HTTP(S), HLS, CGI/MJPEG, RTSP(S), RTMP(S) lewat FFmpeg | HTTP MP4/HLS input nyata teruji; RTSP/RTMP/MJPEG provider eksternal belum |
| FFmpeg encoding | CPU libx264, AAC, bounded process group, preflight actual HLS round-trip | Binary FFmpeg9/FFprobe8 khusus test; system/hosting harus diuji sendiri; GPU belum |
| Play/pause/seek/volume/fullscreen | HTML5+hls.js frontend yang dipertahankan | Chromium HLS playback/audio track metadata nyata; Safari/native HLS belum |
| Queue/playlist | Browser sessionStorage queue≤500;100 playlist JSON×500 item, reorder | Browser add/save dan API/persistence teruji; queue tab-local, bukan room-wide/Discord queue |
| Scheduling | Dashboard≤7hari, bot EPG≤24h, confirmation/30searly/voice check | Timer/start/cancel/voice-presence logic teruji; memori saja, restart menghapus jadwal |
| Watch synchronization | Password-protected same-origin WS play/pause/seek | Dua browser nyata teruji; best-effort, bukan frame-perfect, tidak sync voice Discord |
| Ping/help/hello | Slash `/ping /help /hello` | Payload/role tests; login Discord nyata belum |
| Join/move/leave/stop/auto-leave | @discordjs/voice official audio, lifecycle dan per-guild slot | Local codec Opus encode/decode+DAVE import teruji; authenticated guild/UDP/DAVE transport belum |
| Sumber admin dan listing | `/add-source /sources /delete-source /channels` dan dashboard | Store/API/role tests; ephemeral component UI belum diverifikasi pada guild nyata |
| Jellyfin selection prompt | Slash `/media`, owner-bound select/pagination60s | Service/command mapping teruji; component live interaction belum |
| Prefix `!`, DM voice lookup, friends/relationships | Diganti slash guild + explicit admin/operator allowlists | Disengaja: tidak memerlukan membaca pesan atau akun pengguna; DM notification hanya untuk jadwal lama |
| Native Go Live/camera/private video | **Tidak diimplementasikan/dilarang melalui selfbot** | API bot resmi tidak setara. Browser video+bot audio adalah pengganti yang dijelaskan, bukan native parity |
| H264 SPS/RTP/FU-A/DAVE shim/PCAP analyzer pribadi | Transport video kini HLS/FFmpeg; audio transport di library resmi | Algoritme/forensic legacy hanya provenance Git + arsip; bukan alat runtime JS yang diklaim telah dipindah |
| Embedded App SDK | **Tidak diintegrasikan** | Tidak dibutuhkan untuk browser watch; bukan cara mengaktifkan native bot screenshare. Perlu product/setup/OAuth Activity terpisah bila diinginkan |
| MongoDB | Tidak ditambah | JSON privat lama cukup; tidak menambah layanan yang belum tersedia |
| PterodactylNode22 | Dockerfile Node22, egg, direct Node startup, allocation port, signals | Shell/egg dan proses mirip panel lokal diuji; **Docker daemon/Wings deployment belum teruji** |
| 666 Streaming identity | Nama/package/logo/UI/startup/docs/config/errors | Branding audit + LICENSE identik; nama lama hanya atribusi/provenance |

## Yang tidak dijanjikan

- Akses DRM/paywall, premium login/cookies, mengatasi blokir geografis atau ketentuan provider.
- Semua situs extractor akan selalu bekerja; versi binary dan provider berubah.
- Video Go Live native dari official bot, private gateway, selfbot atau token user.
- Seek VOD ke bagian yang belum ditranscode, upload/storage tanpa batas, multi-tenant isolation, failover horizontal, distributed queue, persistensi jadwal.
- AV1/4K real-time di shared CPU, GPU tanpa device/driver, kemampuan OS/binary yang belum diperiksa.
- Zero-interpreter pada **yt-dlp**: standalone membawa CPython internal dengan izin pengguna; aplikasi/backend tetap JavaScript.

Source Python aplikasi yang sudah digantikan tidak dipakai/disertakan runtime; referensi asal per-modul dan alasan untuk kode yang tidak dapat di-port secara resmi ada pada [audit](AUDIT-JAVASCRIPT.md). Lisensi dan topsoil/dev-topsoil tetap dipertahankan.
