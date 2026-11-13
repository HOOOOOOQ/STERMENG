export class Mutex {
  #tail = Promise.resolve();
  async run(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}
export function abortError() { return new DOMException('Operation cancelled', 'AbortError'); }
export function isAbort(error) { return error?.name === 'AbortError'; }
