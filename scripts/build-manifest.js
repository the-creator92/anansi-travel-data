/**
 * Builds manifest.json from the generated data, with a keep-last-good guard:
 * if either dataset shrank by >30% vs the previously committed manifest, the
 * script exits 1 so the GitHub Action never commits a gutted dataset.
 */
import { readdir, readFile } from 'node:fs/promises';
import { writeJsonStable, readJsonOrNull, fail } from './lib/util.js';

const DROP_GUARD = 0.7;

async function countDir(relDir) {
  const dir = new URL(relDir, import.meta.url).pathname;
  let files = 0;
  let rows = 0;
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return { files: 0, rows: 0 };
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    files++;
    try {
      const arr = JSON.parse(await readFile(`${dir}/${name}`, 'utf8'));
      if (Array.isArray(arr)) rows += arr.length;
    } catch {
      fail(`Corrupt JSON in ${relDir}/${name}`);
    }
  }
  return { files, rows };
}

async function main() {
  const visa = await countDir('../data/visa/');
  const emb = await countDir('../data/embassies/');

  if (visa.files === 0) fail('No visa files generated.');
  if (emb.files === 0) fail('No embassy files generated.');

  const manifestPath = new URL('../manifest.json', import.meta.url).pathname;
  const prev = await readJsonOrNull(manifestPath);
  if (prev) {
    if (visa.rows < DROP_GUARD * (prev.visaCount ?? 0)) {
      fail(`Visa rows dropped ${prev.visaCount} → ${visa.rows} (> 30%) — keeping last good dataset.`);
    }
    if (emb.rows < DROP_GUARD * (prev.embassyCount ?? 0)) {
      fail(`Embassy entries dropped ${prev.embassyCount} → ${emb.rows} (> 30%) — keeping last good dataset.`);
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    visaCount: visa.rows,
    visaFiles: visa.files,
    embassyCount: emb.rows,
    embassyFiles: emb.files,
  };
  await writeJsonStable(manifestPath, manifest);
  console.log('OK:', JSON.stringify(manifest));
}

main();
