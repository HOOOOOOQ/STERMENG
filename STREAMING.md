# Pipeline 666 Streaming — JavaScript

Backend: Node.js 22 / ES Modules. Source entrypoint `src/index.js`; bukan launcher bahasa lain. Lihat [pemetaan pra-migrasi](docs/AUDIT-JAVASCRIPT.md) untuk hubungan modul asli.

```text
Satu port HTTP(S) / reverse proxy
 ├─ Express: static UI, login, API, upload, protected HLS
 └─ ws: watch-room play/pause/seek dan heartbeat
             │
     Catalog / SourceStore / PlaylistStore
      ├─ M3U + XMLTV (Saxes SAX, gzip bounded)
      ├─ Jellyfin PlaybackInfo / TVheadend API
      ├─ file dalam MEDIA_DIR (realpath confinement)
      └─ URL → standalone yt-dlp bila perlu
                         │
                 FFprobe metadata
                         │
         FFmpeg H.264 + AAC → HLS MPEG-TS
                         │
          hls.js / native HLS pada browser

Optional discord.js v14 slash command
 └─ VoiceController → session Catalog/MediaManager yang sama
                     ├─ video/watch link di browser
                     └─ FFmpeg PCM 48k stereo → Opus → @discordjs/voice
```

## Resolusi sumber

- Local descriptor: hanya file berformat yang diizinkan di `MEDIA_DIR`. Traversal dan symlink keluar ditolak. API tidak menerima arbitrary filesystem `source`/bridge.
- Channel descriptor: hash kompatibel SHA-256 atas source/name/URL. URL provider dan credential tidak dikirim dalam listing publik API.
- Jellyfin: server-side API key, user lookup, PlaybackInfo H.264/AAC dengan subtitle index `-1`. Season ID selalu disertai series ID untuk endpoint episodes.
- HTTP(S) direct berekstensi media/HLS, RTSP/RTMP: langsung FFprobe/FFmpeg. HTTP MP4 memerlukan fast-start atau dukungan byte-range pada upstream untuk file dengan moov di akhir.
- URL halaman/provider: yt-dlp mandiri metadata → combined A/V live, atau bounded VOD download. Browser/Discord menggunakan hasil resolusi yang sama (tidak mengunduh dua kali). Input URL di stdin, tidak di shell. Format default menghindari video known-height >1080p; unknown-height masih diizinkan, output tetap di-downscale sesuai konfigurasi.
- Provider playlist massal tidak didownload; kelola item melalui antrean/playlist aplikasi (maks500).
- Helper master-HLS → highest-bandwidth combined variant dipertahankan untuk provider yang punya audio rendition terpisah rusak. Provider yang benar-benar memerlukan audio rendition eksternal perlu pengujian khusus; tidak ada janji semua master playlist identik.

## Encoding dan playback

- Default CPU libx264/veryfast, H.264 yuv420p, AAC128k stereo. GPU hanya konfigurasi opt-in yang preflight-nya harus berhasil.
- Satu proses HLS membaca video+audio sehingga timeline output bersama. Resolusi adalah ceiling dengan aspect ratio genap, tidak melakukan upscale.
- Segmen target2s, keyframe2s. Live: rolling8 segmen + delete; VOD: event playlist, seek hanya pada bagian yang telah dihasilkan. Sesi maksimum6 jam; bukan seek server-side ke VOD yang belum ditranscode.
- Audio-only dan video-only didukung dan diuji. Sumber tanpa audio tidak diumumkan sebagai Discord audio berhasil.
- Positif `STREAM_AV_SYNC_MS` memajukan audio, negatif menundanya di HLS. Ini tidak menyinkronkan voice Discord dan player browser.
- Dua jalur Discord/browser memiliki buffer berbeda. Jika menonton video di browser, gunakan audio browser untuk A/V sync. Tidak ada native Go Live/camera/private RTP.

## Lifecycle dan batas resource

`spawnTracked` tidak memakai shell. Setiap utilitas mempunyai process group di POSIX, bounded output, timeout/AbortSignal dan TERM→KILL fallback5s. Stderr provider dikuras, tidak disalin ke API. Session stop menunggu worker/probe/encoder berhenti sebelum cache dihapus. Tidak ada thread Python/FIFO privat.

Resource: stream cap, idle timeout, disk cache cap/pruner10s, limit upload/download, bounded XML/JSON, WS payload4KiB dan30 peers/session. Startup hanya membersihkan folder cache milik aplikasi ber-ID32hex; file media privat tidak disposable. Child command/FFmpeg args tidak tersusun dari shell interpolation.

SIGINT/SIGTERM: hentikan request baru, abort provider/extractor, tutup WS, bot/voice dan jadwal; reap proses, hapus cache sesi, lalu tutup listener. Batas shutdown25s; Wings/Compose diberi grace≥30s. Linux/Pterodactyl adalah target utama process groups. Windows tersedia untuk binary path, tetapi subtree termination dan hosting belum diverifikasi di sana.

## Sinkronisasi dan jadwal

WS menerima hanya position finite0..21600, playing boolean dan sender bounded, lalu broadcast timestamp server. Browser mengkompensasi drift dan remote command tidak dikirim ulang. Ini best-effort, bukan frame-perfect atau otorisasi per-penonton. Semua operator berpassword setara.

Jadwal dashboard≤7hari/50entry, disimpan di memori. Bot EPG≤24h, konfirmasi owner-bound, mulai30s awal, pemeriksaan voice saat firing, batal oleh playback/stop/leave/restart. Jadwal/antrean browser tidak tahan restart server/tab (playlist dan sumber tahan restart).

## Runtime preflight

`npm run check` menjalankan FFmpeg+FFprobe version, video encode, AAC encode, pembuatan HLS, pembacaan output dengan **kedua** binary, dan verifikasi yt-dlp benar executable mandiri. Encoder tercantum saja tidak cukup. Error HLS/MPEG-TS dapat disebabkan binary yang crash meski MP4 encode berhasil; pilih build OS yang sehat.

[Laporan tes](docs/TESTING.md) memisahkan media lokal/HTTP nyata dari provider eksternal atau Discord/Wings yang belum dapat diuji.
