/**
 * Embassy contacts: OpenStreetMap (Overpass) → data/embassies/{SENDING_ISO2}.json
 *
 * One worldwide query for office=diplomatic. Free, no key — be a good citizen:
 * proper User-Agent, generous timeout, mirror fallback, monthly cadence only.
 *
 * Per element:
 *   sending country = tags.country  (ISO2; element skipped + counted if absent)
 *   host country    = addr:country → target → offline point-in-polygon (lat/lon)
 *   skipped when host === sending (ministries at home tagged office=diplomatic)
 *
 * Output row (per sending country, sorted by dest then city):
 *   { dest, city, type, address?, phone?, emergency?, website?, hours?, lat, lon }
 */
import { fetchWithRetry, writeJsonStable, fail } from './lib/util.js';
import { normalizeIso2, resolveHostCountry } from './lib/geo.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const QUERY = `[out:json][timeout:600];
nwr["office"="diplomatic"];
out tags center;`;

const USER_AGENT = 'anansi-travel-data/1.0 (github.com/anansi-travel-data; monthly refresh)';
const MIN_KEPT = 1000; // a worldwide run should yield several thousand — refuse less

function mapType(tags) {
  const d = (tags.diplomatic ?? '').toLowerCase();
  if (d === 'embassy' || d === 'high_commission' || d === 'nunciature' || d === 'delegation') return 'embassy';
  if (d.startsWith('consulate')) return 'consulate';
  return 'other';
}

function buildAddress(tags) {
  if (tags['addr:full']) return tags['addr:full'];
  const line1 = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  // A bare postcode/city is not an address — require an actual street line.
  if (!line1) return undefined;
  const line2 = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
}

function completeness(e) {
  return ['address', 'phone', 'emergency', 'website', 'hours'].reduce(
    (n, k) => n + (e[k] ? 1 : 0),
    0
  );
}

async function fetchOverpass() {
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Querying ${endpoint} … (can take a few minutes)`);
      const res = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'data=' + encodeURIComponent(QUERY),
        },
        { retries: 1, backoffMs: 60_000, timeoutMs: 600_000 }
      );
      return await res.json();
    } catch (e) {
      console.error(`  ${endpoint} failed: ${e.message}`);
    }
  }
  return null;
}

async function main() {
  const json = await fetchOverpass();
  if (!json || !Array.isArray(json.elements)) {
    fail('All Overpass endpoints failed — keeping last good dataset.');
  }

  const counts = { total: json.elements.length, kept: 0, noCountry: 0, noHost: 0, domestic: 0, noCoords: 0 };
  const bySending = new Map();

  for (const el of json.elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      counts.noCoords++;
      continue;
    }
    const sending = normalizeIso2(tags.country);
    if (!sending) {
      counts.noCountry++;
      continue;
    }
    const host = resolveHostCountry(tags, lat, lon);
    if (!host) {
      counts.noHost++;
      continue;
    }
    if (host === sending) {
      counts.domestic++;
      continue;
    }

    const entry = {
      dest: host,
      city: tags['addr:city'] ?? '',
      type: mapType(tags),
      address: buildAddress(tags),
      phone: tags.phone ?? tags['contact:phone'] ?? undefined,
      emergency:
        tags['emergency:phone'] ?? tags['phone:emergency'] ?? tags['contact:emergency'] ?? undefined,
      website: tags.website ?? tags['contact:website'] ?? undefined,
      hours: tags.opening_hours ?? undefined,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
    };
    // Strip undefined keys for compact stable JSON.
    for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];

    if (!bySending.has(sending)) bySending.set(sending, []);
    bySending.get(sending).push(entry);
    counts.kept++;
  }

  if (counts.kept < MIN_KEPT) {
    fail(`Only ${counts.kept} usable missions (< ${MIN_KEPT} sanity floor) — refusing to write.`);
  }

  // Dedupe per sending country on dest|city|type — keep the most complete entry.
  let deduped = 0;
  for (const [sending, entries] of bySending) {
    const best = new Map();
    for (const e of entries) {
      const key = `${e.dest}|${e.city.toLowerCase()}|${e.type}`;
      const prev = best.get(key);
      if (!prev || completeness(e) > completeness(prev)) best.set(key, e);
      else deduped++;
    }
    const list = Array.from(best.values()).sort((a, b) =>
      a.dest === b.dest ? a.city.localeCompare(b.city) : a.dest < b.dest ? -1 : 1
    );
    await writeJsonStable(new URL(`../data/embassies/${sending}.json`, import.meta.url).pathname, list);
  }

  console.log(
    `OK: ${bySending.size} sending-country files, ${counts.kept - deduped} entries ` +
    `(total ${counts.total}, no-country ${counts.noCountry}, no-host ${counts.noHost}, ` +
    `domestic ${counts.domestic}, no-coords ${counts.noCoords}, deduped ${deduped}).`
  );
}

main();
