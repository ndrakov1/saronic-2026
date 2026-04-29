# Greek Islands — Anchorage Forecast

A free, no-login skipper's tool for **planning where to anchor** in the Saronic Gulf and Cyclades. Pick an island, see the 3-day forecast, and get a per-bay shelter rating that combines wind direction, gust strength, and wave height.

**Live demo:** [https://YOUR-USERNAME.github.io/REPO-NAME/](https://YOUR-USERNAME.github.io/REPO-NAME/) *(set your URL after deploying)*

## What's included

- **7 islands**: Mykonos (Cyclades) plus all main Saronic islands — Salamina, Aegina, Agistri, Poros, Hydra, Spetses
- **75+ anchorages** curated from cruising guides 2024–2026
- **Live wind forecast** for each island (Open-Meteo, ECMWF model)
- **Per-bay shelter scoring** for today and the next 3 days (Excellent / Sheltered / Marginal / Exposed)
- **Embedded Windy map** with the wind overlay
- **Distance and bearing** between any two bays (great-circle, with ETA at 5 / 7 kn)
- **Tide times** (note: Aegean tides are 10–30 cm and rarely matter for anchoring)
- **Save favourite bays** locally — they appear at the top, persist across sessions
- **Mobile-friendly**, dark-mode aware, no API keys, no tracking, no cookies

## Status legend

| Pill | Meaning |
|---|---|
| `Overnight OK` | Free anchoring, safe to sleep aboard |
| `Day only` | Free anchoring, day-stop only (don't overnight) |
| `Restricted` | Anchoring forbidden (exclusion zone, naval area, shipyard) |
| `Paid berth` | Marina or quay with fees |

## How shelter scoring works

For each bay × day combination:

1. The bay's "opens" direction (the compass quadrant its mouth faces) is compared to the forecast wind direction. Wind blowing *into* the bay = exposed; wind from the opposite direction = excellent shelter.
2. The base score is then **penalised** if forecast gusts exceed 28 / 35 knots (anchorages drag in big gusts even from "good" directions).
3. Score is also **penalised** if the open-sea wave forecast exceeds 1.0 / 1.5 / 2.0 m. (Note: actual swell *inside* a protected bay is usually less than the open-sea figure — this is conservative.)
4. Light winds (< 8 kn sustained, < 12 kn gusts) override to "Sheltered" regardless of direction.
5. Restricted spots, paid berths inside basins, and bays with no defined opening direction show as N/A.

This is **a planning aid, not a navigation tool**. Always verify with official charts, port authorities, and observed conditions on arrival.

## Data sources

- **Wind, gusts, temperature, precipitation**: [Open-Meteo](https://open-meteo.com) — free, no API key, 7-day ECMWF forecast.
- **Wave height, sea level**: [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) — same provider.
- **Map embed**: [Windy](https://www.windy.com/embed) — free iframe embed.
- **Anchorage data**: condensed from cruising guides 2024–2026 (sailingissues.com, cruiserswiki.org, sailboatliveaboard.com, grecosailor.com, boataround.com sailing guide 2025, multihulls-world.com, hightideyachtcharters.com, and skipper reports). Each entry attributes wind shelter, holding type, depth and notes.

## Repository layout

```
.
├── index.html      # Main page (HTML structure + styles)
├── data.js         # Island and anchorage data
├── app.js          # Forecast fetching, scoring, rendering
└── README.md       # This file
```

No build step. No dependencies. No backend.

## Deploy to GitHub Pages

1. **Create a new GitHub repository** — call it whatever you like (e.g. `greek-anchorages`). Make it **Public**.
2. **Upload these four files** to the repository root (drag and drop or `git push`).
3. In the repo, go to **Settings → Pages**. Under "Build and deployment":
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Click **Save**.
4. Wait ~1 minute. The page will be live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
5. Bookmark that URL on your phone — the tool works on the boat as long as you have any data connection.

That's it. No domain, no payment, no maintenance.

## Adding more islands

Open `data.js` and add a new entry to the `ISLANDS` object:

```js
naxos: {
  name: "Naxos",
  group: "Cyclades",
  center: [37.10, 25.38],
  note: "Largest Cycladic island. ...",
  anchorages: [
    { name: "Apollonas",  lat: 37.169, lng: 25.546, opens: "N",
      status: "overnight", note: "5–8 m sand. Sheltered from S." },
    // … more bays
  ]
}
```

Required fields: `name`, `lat`, `lng`, `opens` (one of N, NE, E, SE, S, SW, W, NW, or `'-'` for landlocked / restricted, or `'various'` for islands with multiple coves), `status`, `note`.

The dropdown will pick it up automatically and group it under `Cyclades`. No other changes needed.

## Tweaking the shelter algorithm

Edit `shelterScore()` in `app.js`. The defaults are conservative for catamaran cruising; tighten the gust/wave penalties if you have a heavier monohull.

## Why no live tides for the Aegean?

The Aegean is essentially tideless — astronomical range is typically 10–30 cm and meteorological "tide" (storm surge) usually dominates. The tool reads sea-level-height-MSL from the Open-Meteo marine API and shows extrema, but you should not rely on it for anchoring decisions in the way you would in, say, the English Channel.

## License

Anchorage notes are derived from publicly available cruising guides and the author's research. Code is free to fork and adapt. No warranty — verify everything against official sources before relying on it at sea.
