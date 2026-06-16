# anansi-travel-data

Monthly-refreshed travel data for the **Anansi** app:

- **Visa requirements** — derived from the public [passport-index-dataset](https://github.com/ilyankou/passport-index-dataset).
- **Worldwide embassy contacts** — derived from [OpenStreetMap](https://www.openstreetmap.org/) via the Overpass API.

This repository contains **only public, non-personal reference data**. It holds no
app code, no user data, and no secrets. The Anansi app fetches these static JSON
files at runtime; the only information in each request is a country code in the
file name.

## Layout

```
manifest.json            schemaVersion + generatedAt + row/file counts
data/
  visa/{ISO2}.json       visa rules for that passport country → every destination
  embassies/{ISO2}.json  all diplomatic missions OF that country, worldwide
scripts/                 the data pipeline (run monthly by CI)
.github/workflows/       update-data.yml — refreshes data on the 1st of each month
```

### `data/visa/{ISO2}.json`

Array of rows, one per destination:

```json
{ "d": "AU", "r": "eta", "days": 90 }
```

| field | meaning |
|---|---|
| `d` | destination country (ISO 3166-1 alpha-2) |
| `r` | rule: `vf` visa-free · `voa` visa on arrival · `ev` e-visa · `eta` ETA/ESTA · `vr` visa required · `na` no admission |
| `days` | optional visa-free stay length in days |

### `data/embassies/{ISO2}.json`

Array of missions the home country operates abroad:

```json
{
  "dest": "AL",
  "city": "Tirana",
  "type": "embassy",
  "address": "Rruga Asim Zeneli 10, Tirana",
  "phone": "+355 ...",
  "website": "https://...",
  "hours": "Mo-Th 09:00-17:00",
  "lat": 41.32,
  "lon": 19.82
}
```

`type` is `embassy`, `consulate`, or `other`.

## Refreshing the data

CI runs automatically on the 1st of every month (and on manual dispatch). To run
locally:

```bash
npm ci
npm run all        # fetch:visa → fetch:embassies → manifest
```

The manifest build includes a keep-last-good drop guard so a partial upstream
outage never wipes the published data.

## License & attribution

- Visa data: passport-index-dataset (see its repository for license).
- Embassy data: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).
