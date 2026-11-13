# Audit dan provenance

Audit aktif untuk migrasi **total Node.js22 / ES Modules / discord.js14** ada di
[**AUDIT-JAVASCRIPT.md**](AUDIT-JAVASCRIPT.md). Dokumen tersebut dibuat sebelum
penggantian kode aplikasi, memetakan setiap modul Python ke padanan JavaScript,
dan menguraikan keputusan kompatibilitas serta persetujuan yt-dlp mandiri.

Implementasi Python/web sebelumnya dan hasil269 tes Python adalah riwayat, bukan
runtime atau bukti lulus migrasi JavaScript. Artefak/source distribusi versi2.0
berisi aplikasi JavaScript, tanpa launcher Python/pip/requirements. Source asal
tersedia di baseline Git `8ba7e071fd89ccc2410b726ff1a99553ba50f554`.

Arsitektur provider/store/frontend dipertahankan. API native Go Live/camera dan
private RTP dari kode akun pengguna tidak mempunyai padanan official Bot API;
tidak di-port diam-diam menjadi selfbot JS. Lihat [matriks fitur](FEATURES.md),
[protokol historis](PROTOCOL-REFERENCE.md), [pipeline](../STREAMING.md) dan
[laporan tes JavaScript](TESTING.md).
