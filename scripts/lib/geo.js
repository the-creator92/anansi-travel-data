/**
 * Host-country resolution for an OSM diplomatic mission.
 * Priority: addr:country tag → target tag → offline point-in-polygon.
 */
import countryIso from 'country-iso';
import countries from 'i18n-iso-countries';

function asIso2(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v)) return null;
  return countries.isValid(v) ? v : null;
}

export function isValidIso2(value) {
  return asIso2(value) !== null;
}

export function normalizeIso2(value) {
  return asIso2(value);
}

/**
 * Resolve the HOST country (where the mission is located) → ISO2 or null.
 */
export function resolveHostCountry(tags, lat, lon) {
  const fromAddr = asIso2(tags['addr:country']);
  if (fromAddr) return fromAddr;
  const fromTarget = asIso2(tags['target']);
  if (fromTarget) return fromTarget;
  if (typeof lat === 'number' && typeof lon === 'number') {
    try {
      // country-iso returns ISO 3166-1 alpha-3 codes (possibly several near borders).
      const iso3s = countryIso.get(lat, lon);
      if (Array.isArray(iso3s) && iso3s.length > 0) {
        const iso2 = countries.alpha3ToAlpha2(iso3s[0]);
        return asIso2(iso2);
      }
    } catch {
      // fall through
    }
  }
  return null;
}
