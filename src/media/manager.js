import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import { REMOTE } from '../config.js';
import { HttpError, MediaError } from '../errors.js';
import { Mutex, isAbort } from '../async.js';
import { log } from '../log.js';
import { extract } from './extractor.js';
import { probe, hlsCommand } from './ffmpeg.js';
import { spawnTracked, terminate } from './processes.js';
import { extractHlsVariantUrl } from '../services/hls.js';

const directExtensions = new Set('.m3u8 .mp4 .mkv .webm .mov .avi .m4v .mp3 .m4a .aac .ts .m2ts .flac .wav .ogg .opus .cgi .mjpeg .mpd'.split(' '));
export const sessionId = () => randomUUID().replaceAll('-', '');
export class MediaSession extends EventEmitter {
  constructor(id, descriptor, directory) {
    super();
    Object.assign(this, { id, descriptor, directory, title: 'Menyiapkan tayangan…', state: 'preparing', error: '', metadata: {}, live: false, touched: Date.now(), process: null, sockets: new Set(), controller: new AbortController(), sync: { position: 0, playing: true, updated_at: Date.now() / 1000, sender: 'server' } });
    this.prepared = new Promise((resolve) => { this.resolvePrepared = resolve; });
  }
  public() { return { id: this.id, title: this.title, state: this.state, error: this.error, metadata: this.metadata, live: this.live, kind: this.descriptor.kind, manifest: existsSync(path.join(this.directory, 'index.m3u8')) ? `/media/${this.id}/index.m3u8` : null }; }
}
export async function directorySize(directory) {
  let total = 0;
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    try { if (item.isFile()) total += (await stat(filename)).size; else if (item.isDirectory()) total += await directorySize(filename); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return total;
}
export class MediaManager {
  constructor(settings, catalog) {
    this.settings = settings; this.catalog = catalog;
    this.sessions = new Map(); this.schedules = new Map(); this.scheduleTimers = new Map(); this.slots = new Mutex(); this.closed = false; this.pruning = false;
  }
  async start() {
    if (this.closed) throw new MediaError('Server sedang shutdown.');
    for (const item of await readdir(this.settings.cacheDir, { withFileTypes: true })) {
      if (item.isDirectory() && /^[a-f0-9]{32}$/.test(item.name)) await rm(path.join(this.settings.cacheDir, item.name), { recursive: true, force: true });
    }
    this.pruner = setInterval(() => { if (!this.pruning) { this.pruning = true; this.pruneTask = this.pruneOnce().catch(() => log.warn('Cache tidak dapat diperiksa; periksa akses storage.')).finally(() => { this.pruning = false; }); } }, 10000);
    this.pruner.unref();
  }
  async create(descriptor) {
    const clean = await this.catalog.validateDescriptor(descriptor);
    return this.slots.run(async () => {
      if (this.closed) throw new MediaError('Server sedang shutdown.');
      if (this.sessions.size >= this.settings.maxStreams) throw new MediaError('Batas stream tercapai. Hentikan tayangan lain terlebih dahulu.');
      const id = sessionId(), directory = path.join(this.settings.cacheDir, id);
      await mkdir(directory, { mode: 0o700 });
      const session = new MediaSession(id, clean, directory); this.sessions.set(id, session);
      session.task = this.run(session); // all errors handled within run
      return session;
    });
  }
  get(id) {
    const session = this.sessions.get(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan atau telah kedaluwarsa.');
    session.touched = Date.now(); return session;
  }
  async resolve(session) {
    const signal = session.controller.signal;
    let result = await this.catalog.resolve(session.descriptor, { signal });
    if (session.descriptor.kind === 'url') {
      const parsed = new URL(result.source);
      if (['http:', 'https:'].includes(parsed.protocol) && !directExtensions.has(path.extname(parsed.pathname).toLowerCase())) result = await extract(this.settings, result.source, session.directory, { signal });
    }
    // Preserve the original variant workaround for embedded A/V playlists.
    if (REMOTE.test(result.source) && new URL(result.source).pathname.toLowerCase().endsWith('.m3u8')) result.source = await extractHlsVariantUrl(result.source, { signal });
    return result;
  }
  async run(session) {
    const signal = session.controller.signal;
    try {
      const resolved = await this.resolve(session); signal.throwIfAborted();
      session.title = resolved.title;
      const remote = REMOTE.test(resolved.source);
      session.metadata = await probe(this.settings, resolved.source, remote, { signal });
      session.live = resolved.live ?? session.metadata.duration <= 0;
      session.source = resolved.source; session.state = 'buffering';
      session.resolvePrepared({ source: resolved.source, metadata: session.metadata, live: session.live });
      const child = spawnTracked(this.settings.ffmpeg, hlsCommand(this.settings, session, resolved.source, remote), { signal, stdio: ['ignore', 'ignore', 'pipe'] });
      session.process = child; child.stderr.resume();
      const started = Date.now(); let finished = false;
      void child.result.then(() => { finished = true; });
      while (!finished) {
        signal.throwIfAborted();
        if (existsSync(path.join(session.directory, 'index.m3u8'))) session.state = 'playing';
        else if (Date.now() - started > 45000) throw new MediaError('FFmpeg belum menghasilkan video. Periksa sumber atau kapasitas CPU.');
        if (Date.now() - started > 21600000) throw new MediaError('Batas durasi sesi 6 jam tercapai. Buka ulang stream.');
        await sleep(250, undefined, { signal });
      }
      signal.throwIfAborted();
      const result = await child.result;
      if (result.code !== 0 || result.error) throw new MediaError('Pemutaran terputus. Sumber tidak tersedia atau FFmpeg gagal memproses media.');
      session.state = 'ended';
    } catch (error) {
      if (signal.aborted || isAbort(error)) session.state = 'stopped';
      else {
        session.state = 'error';
        session.error = error instanceof MediaError || error instanceof TypeError || error instanceof RangeError ? error.message : 'Terjadi kesalahan media. Periksa koneksi dan log server.';
        log.warn(`Sesi ${session.id} gagal: ${session.error}`);
      }
      session.resolvePrepared({ error: session.error || 'Pemutaran dibatalkan.' });
    } finally {
      await terminate(session.process);
      session.emit('finished');
    }
  }
  async stop(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.stopping) return session.stopping;
    session.stopping = (async () => {
      session.controller.abort();
      for (const socket of session.sockets) { socket.close(1001, 'Session stopped'); socket.terminate(); }
      session.sockets.clear();
      await session.task; await terminate(session.process);
      await rm(session.directory, { recursive: true, force: true });
      if (this.sessions.get(id) === session) this.sessions.delete(id);
      session.emit('stopped');
    })();
    return session.stopping;
  }
  async pruneOnce() {
    for (const [id, session] of this.sessions) {
      if (Date.now() - session.touched > this.settings.idleSeconds * 1000) { await this.stop(id); continue; }
      if (await directorySize(session.directory) > this.settings.maxCacheMb * 1024 * 1024 && ['preparing', 'buffering', 'playing'].includes(session.state)) {
        session.controller.abort(); await session.task;
        session.state = 'error'; session.error = 'Batas cache media tercapai. Kurangi bitrate atau durasi tayangan.';
      }
    }
  }
  async schedule(descriptor, timestamp) {
    const now = Date.now() / 1000;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < now || timestamp > now + 604800) throw new RangeError('Waktu jadwal harus dalam 7 hari ke depan.');
    const clean = await this.catalog.validateDescriptor(descriptor);
    if (this.closed || this.schedules.size >= 50) throw new RangeError('Maksimum 50 jadwal atau server sedang shutdown.');
    const id = sessionId(), entry = { id, title: clean.title || 'Tayangan terjadwal', timestamp, state: 'scheduled', session_id: null };
    this.schedules.set(id, entry);
    const timer = setTimeout(async () => {
      this.scheduleTimers.delete(id);
      try { const session = await this.create(clean); entry.state = 'started'; entry.session_id = session.id; }
      catch { entry.state = 'error'; }
    }, Math.max(0, timestamp * 1000 - Date.now()));
    timer.unref(); this.scheduleTimers.set(id, timer); return entry;
  }
  cancelSchedule(id) { clearTimeout(this.scheduleTimers.get(id)); this.scheduleTimers.delete(id); this.schedules.delete(id); }
  async close() {
    if (this.closing) return this.closing;
    this.closed = true; clearInterval(this.pruner);
    this.closing = (async () => {
      for (const timer of this.scheduleTimers.values()) clearTimeout(timer);
      this.scheduleTimers.clear(); await this.pruneTask;
      await this.slots.run(async () => { await Promise.all([...this.sessions.keys()].map((id) => this.stop(id))); });
    })();
    return this.closing;
  }
}
