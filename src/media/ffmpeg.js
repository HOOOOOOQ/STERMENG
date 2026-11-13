import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { MediaError } from '../errors.js';
import { output } from './processes.js';

export const PROTOCOLS = 'http,https,tcp,tls,crypto,httpproxy,rtsp,rtp,udp,rtmp,rtmps';
export function inputOptions(source, remote) {
  if (!remote) return [];
  return ['-rw_timeout', '15000000', '-protocol_whitelist', PROTOCOLS,
    ...(/^https?:\/\//i.test(source) ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '3'] : [])];
}
export async function preflight(settings, { signal } = {}) {
  for (const executable of [settings.ffmpeg, settings.ffprobe]) {
    try { await output(executable, ['-version'], { timeout: 10000, signal }); }
    catch { throw new MediaError('FFmpeg/FFprobe tidak tersedia. Pasang binary OS atau atur FFMPEG_PATH/FFPROBE_PATH.'); }
  }
  const args = ['-hide_banner', '-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1', '-frames:v', '1', '-threads', '1'];
  if (settings.encoder === 'h264_vaapi') args.unshift('-vaapi_device', settings.vaapiDevice);
  if (settings.encoder === 'h264_vaapi') args.push('-vf', 'format=nv12,hwupload');
  args.push('-c:v', settings.encoder);
  try { await output(settings.ffmpeg, [...args, '-f', 'null', '-'], { signal }); }
  catch { throw new MediaError(`Encoder ${settings.encoder} gagal. Pilih libx264 untuk hosting tanpa GPU.`); }
  try { await output(settings.ffmpeg, ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '0.1', '-threads', '1', '-c:a', 'aac', '-f', 'null', '-'], { timeout: 10000, signal }); }
  catch { throw new MediaError('Encoder audio AAC gagal; periksa build FFmpeg runtime.'); }
  const directory = await mkdtemp(path.join(settings.cacheDir, 'preflight-'));
  try {
    const playlist = path.join(directory, 'index.m3u8');
    await output(settings.ffmpeg, [...args, '-f', 'hls', playlist], { signal });
    await output(settings.ffprobe, ['-v', 'error', '-show_streams', playlist], { timeout: 10000, signal });
    await output(settings.ffmpeg, ['-v', 'error', '-nostdin', '-i', playlist, '-t', '0.1', '-f', 'null', '-'], { timeout: 10000, signal });
  } catch { throw new MediaError('FFmpeg/FFprobe gagal membaca HLS/MPEG-TS hasil encoding. Gunakan build sistem yang sehat dan jalankan npm run check lagi.'); }
  finally { await rm(directory, { recursive: true, force: true }); }
  return { ffmpeg: true, ffprobe: true, encoder: settings.encoder, node: process.versions.node };
}
export async function probe(settings, source, remote, { signal } = {}) {
  const args = ['-v', 'error', ...(remote ? ['-rw_timeout', '15000000', '-protocol_whitelist', PROTOCOLS] : []), '-show_streams', '-show_format', '-print_format', 'json', source];
  let data;
  try { data = JSON.parse((await output(settings.ffprobe, args, { timeout: 30000, signal })).toString('utf8')); }
  catch (error) { if (signal?.aborted) throw error; throw new MediaError('Metadata media tidak dapat dibaca. Periksa koneksi dan format sumber.'); }
  const streams = data.streams || [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  if (!video && !audio) throw new MediaError('Tidak ada track video atau audio pada sumber ini.');
  const duration = Number(data.format?.duration);
  const rate = String(video?.avg_frame_rate || '0/1').split('/').map(Number);
  return { duration: Number.isFinite(duration) ? Math.max(0, duration) : 0, has_video: Boolean(video), has_audio: Boolean(audio), width: video?.width || 0, height: video?.height || 0, codec: video?.codec_name || '', audio_codec: audio?.codec_name || '', fps: rate[1] && Number.isFinite(rate[0] / rate[1]) ? rate[0] / rate[1] : 0, has_b_frames: Boolean(video?.has_b_frames) };
}
export function hlsCommand(settings, session, source, remote) {
  const { width, height, fps, bitrate } = settings.profile;
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  if (settings.encoder === 'h264_vaapi') args.push('-vaapi_device', settings.vaapiDevice);
  args.push(...inputOptions(source, remote), '-re', '-i', source, '-map', '0:v:0?', '-map', '0:a:0?', '-threads', String(settings.threads), '-c:v', settings.encoder);
  const scale = `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  if (settings.encoder === 'libx264') args.push('-preset', 'veryfast', '-tune', 'zerolatency');
  args.push('-vf', settings.encoder === 'h264_vaapi' ? `${scale},format=nv12,hwupload` : `${scale},format=yuv420p`,
    '-r', String(fps), '-g', String(Math.round(fps * 2)), '-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bitrate,
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-af', `aresample=async=1:first_pts=0,asetpts=PTS-(${settings.avSyncMs / 1000})/TB`,
    '-f', 'hls', '-hls_time', '2', '-hls_segment_filename', path.join(session.directory, 'seg%06d.ts'));
  if (session.live) args.push('-hls_list_size', '8', '-hls_flags', 'independent_segments+delete_segments+temp_file');
  else args.push('-hls_playlist_type', 'event', '-hls_flags', 'independent_segments+temp_file');
  return args.concat(path.join(session.directory, 'index.m3u8'));
}
