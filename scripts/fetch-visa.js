/**
 * Visa requirements: passport-index-dataset → data/visa/{PASSPORT_ISO2}.json
 *
 * Source: https://github.com/ilyankou/passport-index-dataset (free)
 * Tidy ISO-2 CSV columns: Passport,Destination,Requirement
 *
 * Output row format (compact keys, sorted by destination for stable diffs):
 *   { "d": "JP", "r": "vf", "days": 90 }
 *   r ∈ vf (visa-free) | voa (visa on arrival) | ev (e-visa) | eta | vr (visa required) | na (no admission)
 *
 * FAILS LOUDLY (exit 1, nothing written) on: HTTP error, unexpected header,
 * any unknown requirement value. NOTE: the dataset README announced a new data
 * location from Feb 2026 — if this script starts failing, check
 * https://github.com/ilyankou/passport-index-dataset for the new location and
 * update CSV_URL below.
 */
import { fetchWithRetry, writeJsonStable, fail } from './lib/util.js';

const CSV_URL =
  'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-tidy-iso2.csv';

function mapRequirement(raw) {
  const v = raw.trim().toLowerCase();
  if (v === '-1') return 'skip';
  if (/^\d+$/.test(v)) return { r: 'vf', days: parseInt(v, 10) };
  if (v === 'visa free' || v === 'visa-free') return { r: 'vf' };
  if (v === 'visa on arrival') return { r: 'voa' };
  if (v === 'e-visa' || v === 'evisa') return { r: 'ev' };
  if (v === 'eta') return { r: 'eta' };
  if (v === 'visa required') return { r: 'vr' };
  if (v === 'no admission') return { r: 'na' };
  return 'unknown';
}

async function main() {
  console.log(`Fetching ${CSV_URL} …`);
  const res = await fetchWithRetry(CSV_URL, {
    headers: { 'User-Agent': 'anansi-travel-data/1.0 (github.com/anansi-travel-data)' },
  }).catch((e) => fail(`Could not download visa CSV: ${e.message}`));
  const text = await res.text();

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const header = lines.shift() ?? '';
  if (header.toLowerCase().replace(/\s/g, '') !== 'passport,destination,requirement') {
    fail(
      `Unexpected CSV header "${header}". The dataset format may have changed or moved ` +
      `(a relocation was announced for Feb 2026) — check the README at ` +
      `https://github.com/ilyankou/passport-index-dataset and update CSV_URL.`
    );
  }

  const byPassport = new Map();
  const unknown = new Map();
  let total = 0;
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const passport = parts[0].trim().toUpperCase();
    const destination = parts[1].trim().toUpperCase();
    const requirement = parts.slice(2).join(',');
    if (!/^[A-Z]{2}$/.test(passport) || !/^[A-Z]{2}$/.test(destination)) continue;
    if (passport === destination) {
      skipped++;
      continue;
    }
    const mapped = mapRequirement(requirement);
    if (mapped === 'skip') {
      skipped++;
      continue;
    }
    if (mapped === 'unknown') {
      unknown.set(requirement.trim(), (unknown.get(requirement.trim()) ?? 0) + 1);
      continue;
    }
    const row = { d: destination, r: mapped.r };
    if (mapped.days !== undefined) row.days = mapped.days;
    if (!byPassport.has(passport)) byPassport.set(passport, []);
    byPassport.get(passport).push(row);
    total++;
  }

  if (unknown.size > 0) {
    for (const [value, count] of unknown) console.error(`  UNKNOWN requirement value: "${value}" ×${count}`);
    fail(`${unknown.size} unknown requirement value(s) — add mappings to mapRequirement() before committing.`);
  }
  if (byPassport.size < 150) {
    fail(`Only ${byPassport.size} passports parsed — expected ~199. Refusing to write a partial dataset.`);
  }

  for (const [passport, rows] of byPassport) {
    rows.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    await writeJsonStable(new URL(`../data/visa/${passport}.json`, import.meta.url).pathname, rows);
  }

  console.log(`OK: ${byPassport.size} passport files, ${total} rows (${skipped} self/skip rows).`);
}

main();
