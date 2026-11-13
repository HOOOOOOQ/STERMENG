import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
async function visit(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.name === '__pycache__') continue;
    if (item.name.endsWith('.py')) throw new Error(`Python application/test file must not remain: ${filename}`);
    if (item.isDirectory()) await visit(filename);
    else if (/\.(?:m?js)$/.test(item.name)) {
      execFileSync(process.execPath, ['--check', filename], { stdio: 'pipe' }); count++;
      if (directory.startsWith(path.join(root, 'src'))) await import(pathToFileURL(filename));
    }
  }
}
for (const directory of ['src', 'scripts', 'tests', 'frontend']) await visit(path.join(root, directory));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.type !== 'module' || pkg.scripts.start !== 'node src/index.js') throw new Error('Runtime must be direct Node ESM, not an interpreter launcher.');
console.log(`666 Streaming: ${count} JavaScript files syntax checked; all backend modules/dependencies imported without starting servers or logging in.`);
