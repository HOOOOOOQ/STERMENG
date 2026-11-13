import path from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { atomicJson, validateSources, validatePlaylists } from '../src/storage.js';

export async function migrate(sourceDir, targetDir) {
  const planned = [];
  for (const [name, validate] of [['sources.json', validateSources], ['playlists.json', validatePlaylists]]) {
    const source = path.join(sourceDir, name), target = path.join(targetDir, name);
    let data;
    try { data = await readFile(source, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try { await lstat(target); throw new Error(`Refusing to overwrite ${name}; back up/choose an empty target.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let value;
    try { value = JSON.parse(data); validate(value); } catch { throw new Error(`Invalid JSON/schema in ${name}; no files copied.`); }
    planned.push([target, value]);
  }
  if (!planned.length) throw new Error('No sources.json/playlists.json found. Nothing changed.');
  for (const [target, value] of planned) await atomicJson(target, value, { overwrite: false });
  return planned.map(([target]) => target);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { source: { type: 'string' }, target: { type: 'string', default: 'data' } } });
    if (!values.source) throw new Error('Usage: npm run migrate:data -- --source /old/data --target /new/data');
    for (const filename of await migrate(path.resolve(values.source), path.resolve(values.target))) console.log(`Copied ${path.basename(filename)} (private; original untouched).`);
  } catch (error) { console.error(`666 Streaming migration stopped: ${error.message}`); process.exitCode = 1; }
}
