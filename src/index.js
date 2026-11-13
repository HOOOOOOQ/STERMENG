#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { ROOT, APP_NAME, VERSION, loadSettings, prepareSettings } from './config.js';
import { createApplication } from './server.js';
import { preflight } from './media/ffmpeg.js';
import { checkExtractor } from './media/extractor.js';
import { closeChildren } from './media/processes.js';
import { log } from './log.js';

export async function main(argv = process.argv.slice(2)) {
  dotenv.config({ path: path.join(ROOT, '.env'), quiet: true }); // hosting env wins
  if (argv.includes('--help')) {
    console.log(`${APP_NAME} ${VERSION}\nnode src/index.js [--check]\n--check: real video/AAC encoding + HLS readback + standalone yt-dlp check, no Discord login.`); return;
  }
  if (argv.some((argument) => argument !== '--check')) throw new TypeError('Opsi tidak dikenal. Gunakan --help.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 22 || minor < 17) throw new Error('666 Streaming memerlukan Node.js 22 (minimal 22.17).');
  const settings = await prepareSettings(loadSettings());
  if (argv.includes('--check')) {
    const runtime = await preflight(settings);
    let version;
    try { version = await checkExtractor(settings); }
    catch (error) { log.error(error.message); process.exitCode = 1; }
    console.log(`${APP_NAME}: video=${runtime.encoder}, AAC/HLS/FFprobe OK; Node ${runtime.node}; yt-dlp=${version || 'UNAVAILABLE (YouTube/Twitch disabled until installed)'}.`);
    await closeChildren(); return;
  }
  const state = await createApplication(settings);
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return; shuttingDown = true;
    log.info(`${APP_NAME}: ${signal}, menghentikan bot, koneksi dan proses media…`);
    const force = setTimeout(() => { log.error('Shutdown melampaui 25 detik.'); process.exit(1); }, 25000); force.unref();
    try { await state.close(); log.info(`${APP_NAME}: shutdown bersih.`); }
    catch (error) { log.error(error); process.exitCode = 1; }
    finally { clearTimeout(force); }
  };
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  try {
    await state.start();
    // Do not log credentials, provider URLs, or bootstrap passwords.
    log.info(`${APP_NAME} siap — Node.js ${process.versions.node}, ${settings.host}:${settings.port}`);
  } catch (error) { await state.close(); if (!shuttingDown) throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(async (error) => { log.error(error); await closeChildren(); process.exitCode = 1; });
}
