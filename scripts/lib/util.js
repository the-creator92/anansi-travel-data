import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * fetch with timeout + simple retry/backoff. Throws on final failure.
 */
export async function fetchWithRetry(url, options = {}, { retries = 2, backoffMs = 60_000, timeoutMs = 120_000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      // 429/5xx → back off and retry; 4xx other than 429 won't improve.
      if (res.status !== 429 && res.status < 500) throw lastError;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
    }
    if (attempt < retries) {
      console.log(`  retry ${attempt + 1}/${retries} in ${backoffMs / 1000}s — ${lastError?.message}`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

/** Write JSON with stable formatting (sorted callers ensure stable diffs). */
export async function writeJsonStable(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value) + '\n', 'utf8');
}

export async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export function fail(message) {
  console.error(`\nFATAL: ${message}\n`);
  process.exit(1);
}
