import { spawn } from 'node:child_process';
import { MediaError } from '../errors.js';

export const children = new Set();
const delay = (ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref(); });
function send(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
export function spawnTracked(executable, args, { signal, stdio = ['ignore', 'pipe', 'pipe'], ...options } = {}) {
  signal?.throwIfAborted();
  const child = spawn(executable, args, { ...options, detached: process.platform !== 'win32', shell: false, stdio });
  children.add(child);
  child.result = new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const abort = () => { void terminate(child); };
  signal?.addEventListener('abort', abort, { once: true });
  void child.result.then(() => { children.delete(child); signal?.removeEventListener('abort', abort); });
  if (signal?.aborted) abort();
  return child;
}
export function terminate(child) {
  if (!child) return Promise.resolve();
  if (child.termination) return child.termination;
  child.termination = (async () => {
    // Kill the group, even if a parent exited but descendants kept its pipes open.
    send(child, 'SIGTERM');
    let done = false;
    await Promise.race([child.result.then(() => { done = true; }), delay(5000)]);
    // A leader can exit on TERM while a grandchild ignores it and retains the
    // process group. Reap the remainder too, not only a still-running leader.
    if (!done || process.platform !== 'win32') send(child, 'SIGKILL');
    await child.result;
  })();
  return child.termination;
}
export async function output(executable, args, { timeout = 20000, signal, maximum = 8 * 1024 * 1024, stdin, ...options } = {}) {
  const controller = new AbortController();
  const combined = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]);
  const child = spawnTracked(executable, args, { ...options, signal: combined, stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  const chunks = []; let size = 0, tooLarge = false;
  child.stdout.on('data', (chunk) => {
    size += chunk.length;
    if (size > maximum) { tooLarge = true; controller.abort(); } else chunks.push(chunk);
  });
  child.stderr.resume(); // Never publish raw provider stderr (may contain secrets).
  if (stdin !== undefined) { child.stdin.on('error', () => {}); child.stdin.end(stdin); }
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const result = await child.result;
    signal?.throwIfAborted();
    if (tooLarge) throw new MediaError('Output utilitas media melebihi batas.');
    if (controller.signal.aborted) throw new MediaError('Koneksi media melewati batas waktu. Coba lagi.');
    if (result.error || result.code !== 0) throw new MediaError('Sumber media tidak dapat dibaca atau utilitas gagal memprosesnya.');
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); await terminate(child); }
}
export async function closeChildren() { await Promise.all([...children].map(terminate)); }
