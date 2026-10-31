# IRIS — Codebase Walkthrough

A guided tour of the project for anyone opening the code for the first time. Read it
top to bottom once and you will know where everything lives, how one number on the
screen is produced, and which file to open for any change.

> The [README](README.md) explains *what* IRIS does and how well it works.
> This file explains *how the code is put together*.

---

## 1. IRIS in one paragraph

IRIS (Integrated Rainfall & Inundation Sentinel) watches 112 places across all 36
Indian states and UTs. Every 90 minutes it pulls live rainfall, river discharge and
official government gauge and alert data, turns them into a **0–100 flood risk score**
per place, colours it on IMD's Green / Yellow / Orange / Red scale, explains *why* in
English and Hindi, and then helps officials respond: where water will pool street by
street, which rivers are carrying a flood wave downstream, and where to send rescue
teams, boats and pumps. Citizens get a simple view of their own district.

---

## 2. The big picture

```
                  ┌───────────────────────── backend (Python, FastAPI) ─────────────────────────┐
 Open-Meteo  ──┐  │                                                                             │
 GloFAS      ──┤  │  ingest/  ──►  scoring/  ──►  in-memory Snapshot  ──►  api.py  ──►  /api/... │──► frontend (React)
 CWC gauges  ──┤  │  (fetch)      (score)         + SQLite (core/store)    (REST)                │    pages/ + components/
 NDMA SACHET ──┤  │                    │                                                        │
 OSM / OSRM  ──┘  │                    └──►  hydro/  response/  alerts/  ai/                    │──► email / WhatsApp
                  │                          (streets, rivers, planning, notifications, Copilot)│    (viaSocket webhook)
                  └─────────────────────────────────────────────────────────────────────────────┘
```

- **Backend** ([backend/](backend/)): does all the work. Fetching, maths, ML, planning, alerts.
- **Frontend** ([frontend/](frontend/)): only displays. It never calculates risk; it calls
  `/api/...` and draws the answer.
- **Database**: run history, cached climatology, accounts, plans and notification
  settings. A local SQLite file (`backend/jaldrishti.db`) by default, or Neon Postgres
  when `DATABASE_URL` is set. Tables: [docs/DATABASE.md](docs/DATABASE.md),
  [backend/db/schema.sql](backend/db/schema.sql).

---

## 3. Folder map

```
jaldhristi/
├── README.md              what IRIS is, results, limits, endpoint list
├── WALKTHROUGH.md         ← you are here
├── docs/                  ARCHITECTURE (diagrams), DEPLOYMENT (Render + Vercel), NOTIFICATIONS (viaSocket)
├── render.yaml            backend hosting config (Render)
├── run-dev.ps1            starts backend + frontend locally on Windows
│
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py        ★ entry point: starts the server and the background loops
│   │   ├── api.py         ★ every /api endpoint (the only door into the backend)
│   │   │
│   │   ├── core/          the foundation everything else imports
│   │   ├── ingest/        1. FETCH   — talk to outside data sources
│   │   ├── scoring/       2. SCORE   — raw data → features → risk score → explanation
│   │   ├── hydro/         3. ZOOM IN — rivers and street-level flooding
│   │   ├── response/      4. ACT     — resources, optimised deployment, safety advice
│   │   ├── alerts/        5. TELL    — notifications, briefings, CAP alerts
│   │   ├── ai/            6. ASK     — LLM providers and the Copilot chat
│   │   │
│   │   └── data/          bundled datasets (locations, past floods, gauges, rivers, ML model)
│   └── scripts/           one-off tools: build data, train the model, back-test
│
└── frontend/
    ├── index.html
    └── src/
        ├── main.jsx       mounts React
        ├── App.jsx        ★ shell: sign-in, navigation, which page to show
        ├── pages/         one file per screen
        ├── components/    reusable pieces (map, gauge, charts, Copilot drawer…)
        └── lib/           API client, router, auth, formatting, EN/HI strings
```

The numbered backend folders follow the order data travels through the system.

---

## 4. Backend, package by package

### `core/` — the foundation

| File | What it holds |
|---|---|
| [config.py](backend/app/core/config.py) | **Every number that matters**: IMD rain bands, scoring breakpoints, feature weights, alert tiers, API URLs, env-var settings, source citations. Change a threshold here, not in the scoring code. |
| [store.py](backend/app/core/store.py) | The database: runs, per-place assessments, observations, climatology cache, source health. SQLite by default; Postgres (Neon) when `DATABASE_URL` is set. |
| [pgcompat.py](backend/app/core/pgcompat.py) | Lets the same SQLite-style SQL run on Postgres, so no query had to change. See [docs/DATABASE.md](docs/DATABASE.md). |
| [auth.py](backend/app/core/auth.py) | Accounts and sign-in. Roles: `central` (all India), `state`, `district` (admins), `citizen` (own district only). |

### `ingest/` — fetching data

| File | Source | Key function |
|---|---|---|
| [sources.py](backend/app/ingest/sources.py) | Open-Meteo weather (rain, soil moisture), GloFAS river discharge, archive, 30-year river climatology | `fetch_weather` :178, `fetch_flood` :230, `build_climatology` :321 |
| [official.py](backend/app/ingest/official.py) | CWC river gauges (live water level vs warning/danger marks) and NDMA SACHET official alerts | `build_catalog` :171, `refresh_readings` :318, `fuse` :519 |
| [consensus.py](backend/app/ingest/consensus.py) | OpenWeatherMap second forecast (optional key) to cross-check rain | `fetch_owm_next24` :49, `compare` :66 |
| [travel.py](backend/app/ingest/travel.py) | OSRM road drive times, depot → place, cached a week | `build` :82 |

Many places are fetched in **one** request (Open-Meteo accepts lists of
coordinates), so a full refresh is ~2 HTTP calls, not 224.

### `scoring/` — the risk engine (the heart of IRIS)

| File | Job |
|---|---|
| [engine.py](backend/app/scoring/engine.py) | **Orchestrator.** `refresh()` :256 runs one full pass; `assess()` :123 scores one place; also replay of past dates and what-if simulation. |
| [features.py](backend/app/scoring/features.py) | Raw time series → named, human-readable features ("92 mm in 24 h", "river at 97th percentile for this week"). |
| [risk.py](backend/app/scoring/risk.py) | Features → 0–100 score, confidence, 72-hour projection. |
| [explain.py](backend/app/scoring/explain.py) | Score → plain sentences in English and Hindi + NDMA actions. Templated, so it never invents a number. |
| [ml.py](backend/app/scoring/ml.py) | Extra ML: "today looks like Silchar on 2022-06-20" (nearest past days) and anomaly detection (Isolation Forest). |

### `hydro/` — zooming in on water

| File | Job |
|---|---|
| [rivers.py](backend/app/hydro/rivers.py) | Places CWC gauges along each river, works out upstream → downstream, colours river reaches, finds flood waves heading towards a town. |
| [hotspots.py](backend/app/hydro/hotspots.py) | Splits a city into a 16 × 16 grid of 800 m cells using elevation + OpenStreetMap (drains, roads, built-up land) and finds where water collects. |
| [propagation.py](backend/app/hydro/propagation.py) | Hour-by-hour simulation of water filling low cells and spilling downhill to neighbours. |
| [nowcast.py](backend/app/hydro/nowcast.py) | Forecasts a gauge's next 48 h of water level with the Chronos-Bolt AI model. |

### `response/` — what to do about it

| File | Job |
|---|---|
| [resources.py](backend/app/response/resources.py) | Depots (NDRF, SDRF, district stores) and their stock of rescue teams, boats, pumps, barricades. |
| [planning.py](backend/app/response/planning.py) | Optimiser that decides **who sends what where** to help the most people in time (`_solve` :254). |
| [city_plan.py](backend/app/response/city_plan.py) | Places a city's pumps and barricades on specific streets. |
| [safety.py](backend/app/response/safety.py) | Roads/underpasses to avoid and safety steps for public alerts. |

### `alerts/` — telling people

| File | Job |
|---|---|
| [notify.py](backend/app/alerts/notify.py) | Posts alert events to a webhook (viaSocket), which sends email / WhatsApp / SMS. |
| [briefing.py](backend/app/alerts/briefing.py) | "My area" summary for a signed-in user: what's bad, what's coming, what changed. |
| [cap.py](backend/app/alerts/cap.py) | Warnings in CAP 1.2, the XML format India's official alert chain uses. |
| [email_template.py](backend/app/alerts/email_template.py) | The HTML alert email. |

### `ai/` — natural-language layer

| File | Job |
|---|---|
| [llm.py](backend/app/ai/llm.py) | One `generate()` for Claude, Gemini or Groq, whichever key is set. |
| [copilot.py](backend/app/ai/copilot.py) | Answers questions ("why is Patna orange?") **only from the live data**. Works offline with no key using a rule-based answerer. |

---

## 5. Follow one refresh, start to finish

This is the single most useful thing to understand. Open the files alongside.

**Startup** — [main.py](backend/app/main.py) `lifespan` :213 → `_bootstrap` :168
1. Load the CWC gauge catalogue and the 30-year river climatology.
2. Run the first `engine.refresh("startup")`.
3. Start the background loops:
   - `_refresh_loop` :37 — full re-score every **90 min**
   - `_gauge_loop` :124 — re-read CWC gauges more often; re-score towns when a gauge changes tier
   - `_notify_loop` :53 — send alerts and the daily brief
   - keep-alive ping so the free Render server doesn't sleep

**One refresh** — [engine.py](backend/app/scoring/engine.py) `refresh()` :256
1. **Fetch in parallel**: `sources.fetch_weather`, `sources.fetch_flood`,
   `consensus.fetch_owm_next24`, and `official.refresh_readings` for nearby gauges.
   If Open-Meteo is down or over quota, re-score on the last good data instead of failing.
2. **For each of the 112 places → `assess()`** :123:
   1. `features.build_feature_vector` — rain, river, terrain, history features
   2. `risk.normalise_features` — each feature onto 0–100
   3. `risk.score_from_normalised` — the score (formulas in §6)
   4. `official.fuse` — **official data sets a floor**: a CWC gauge above danger forces
      Red, above warning forces Orange, an official alert forces its colour
   5. `risk.assess_confidence`, `risk.project_trajectory` — how sure, and the next 72 h
   6. `explain.build_explanation` — the English/Hindi sentences
3. Save to SQLite, then **swap the new Snapshot in atomically**. API calls always read
   the in-memory snapshot, so the UI never waits on the network. A failed refresh keeps
   the previous good snapshot serving.

**One page load** — e.g. a place page
`frontend/src/pages/LocationPage.jsx` → `api.detail(id)` in
[lib/api.js](frontend/src/lib/api.js) → `GET /api/location/{id}/detail` →
`location_detail` in [api.py](backend/app/api.py) :412 → reads the snapshot → JSON → drawn.

---

## 6. The formulas, in one place

All numbers below live in [core/config.py](backend/app/core/config.py) and
[scoring/risk.py](backend/app/scoring/risk.py).

**Step 1 — make every feature 0–100** (`piecewise`, risk.py :52). Straight lines
between published breakpoints, so the bends sit on real thresholds:

| Feature | Breakpoints (input → points) | Source |
|---|---|---|
| Rain, 24 h | 15.6 mm → 15, 64.5 → 45, 115.6 → 68, 204.5 → 88, 350 → 100 | IMD rain classes |
| River vs normal for this week | 50th pct → 20, 90th → 62, 97th → 82, 99.5th → 100 | GloFAS 1994–2024 |
| Soil moisture | 0.25 → 20, 0.33 → 45, 0.40 → 75, 0.45 → 100 m³/m³ | |

**Step 2 — two ways to score, take the worse** (risk.py :162, :192)

```
weighted   = Σ weight × feature
             weights: rain 24h .16 · forecast 24h .14 · river percentile .15 · terrain .10
                      rain 72h .09 · river ratio .09 · river trend .08 · soil .07
                      forecast 72h .07 · flood history .05

riverine   = 0.55·river percentile + 0.30·river ratio + 0.15·river trend
pluvial    = 0.5·max(rain 24h, forecast 24h) + 0.3·max(rain 72h, forecast 72h) + 0.2·soil
dominant   = max(riverine, pluvial) × (0.6 + 0.4 × terrain/100)

rule score = max(weighted, dominant)
```

Why both: averaging dilutes a single extreme cause (a river in flood on a dry day).
Back-tested on 70 real flood days, taking the worse cause reached Red far more often.

**Step 3 — blend with ML** (logistic regression in `data/risk_model.json`)

```
final = 0.65 × rule score + 0.35 × (ML flood probability × 100)
```

**Step 4 — official floor** (official.py :519): gauge above danger →
`min(95, 76 + 12 × metres above danger [+5 if rising])`; above warning → 52–75
(higher the closer it is to danger).
The score is never lower than this.

**Step 5 — colour**: Green 0–25 · Yellow 25–50 · Orange 50–75 · Red 75+.

**Terrain score** (features.py :255) is the average of:
low ground `100·e^(−elev/120)`, flat ground `100·e^(−slope/0.35)`,
near water `100·e^(−km/1.5)`, drain density, standing water, coastal (60).

---

## 7. Frontend map

| Route (URL hash) | Page file | Who sees it |
|---|---|---|
| `#/` | [CitizenHome.jsx](frontend/src/pages/CitizenHome.jsx) / [MyArea.jsx](frontend/src/pages/MyArea.jsx) | citizen / official home |
| `#/map`, `#/state/:name` | [Overview.jsx](frontend/src/pages/Overview.jsx) + [IndiaMap.jsx](frontend/src/components/IndiaMap.jsx) | everyone |
| `#/location/:id` | [LocationPage.jsx](frontend/src/pages/LocationPage.jsx) | everyone |
| `#/hotspots/:city` | [HotspotsPage.jsx](frontend/src/pages/HotspotsPage.jsx) | everyone |
| `#/rivers` | [RiversPage.jsx](frontend/src/pages/RiversPage.jsx) | everyone |
| `#/plan`, `#/resources` | [PlanPage.jsx](frontend/src/pages/PlanPage.jsx), [ResourcesPage.jsx](frontend/src/pages/ResourcesPage.jsx) | officials |
| `#/notifications` | [NotificationsPage.jsx](frontend/src/pages/NotificationsPage.jsx) | officials |
| `#/alerts`, `#/states`, `#/time-machine` | [Pages.jsx](frontend/src/pages/Pages.jsx) (`OfficialPage`, `StateMonitor`, `TimeMachine`) | mixed |
| `#/about` | [AboutPage.jsx](frontend/src/pages/AboutPage.jsx) | everyone |
| sign-in | [LoginPage.jsx](frontend/src/pages/LoginPage.jsx) | before sign-in |

- Routes are defined in [lib/router.js](frontend/src/lib/router.js); the switch that
  picks a page is in [App.jsx](frontend/src/App.jsx) (~line 390).
- Every backend call is one line in [lib/api.js](frontend/src/lib/api.js).
- UI text in both languages: [lib/i18n.js](frontend/src/lib/i18n.js).
  (Content text, like risk explanations, already comes bilingual from the backend.)

---

## 8. "I want to change…" — where to go

| Change | File |
|---|---|
| A rain/river threshold or a feature weight | [core/config.py](backend/app/core/config.py) |
| How the score is combined | [scoring/risk.py](backend/app/scoring/risk.py) `score_from_normalised` |
| Add a new data source | new client in `ingest/`, call it from `engine.refresh()`, use it in `features.py` |
| Add a new feature to the score | `features.py` → `normalise_features` in `risk.py` → `WEIGHTS` in config |
| Wording of explanations | [scoring/explain.py](backend/app/scoring/explain.py) |
| Add a monitored place | `backend/app/data/locations.json`, then `scripts/enrich_locations.py` |
| Retrain the ML model | `python backend/scripts/train_model.py` |
| Check accuracy | `python backend/scripts/backtest.py`, `backtest_planning.py` |
| New API endpoint | [api.py](backend/app/api.py) + one line in [lib/api.js](frontend/src/lib/api.js) |
| New screen | file in `frontend/src/pages/`, route in `lib/router.js`, case in `App.jsx` |
| Alert email look | [alerts/email_template.py](backend/app/alerts/email_template.py) |
| Who gets alerts / how | [alerts/notify.py](backend/app/alerts/notify.py), [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) |

---

## 9. Run it

```powershell
.\run-dev.ps1            # or, by hand:
cd backend;  python -m uvicorn app.main:app --reload --port 8000
cd frontend; npm install; npm run dev
```

- App: http://localhost:5173 (use **Quick demo** on the sign-in page)
- Interactive API docs: http://localhost:8000/docs — every endpoint, try them live

All API keys are optional (`backend/.env`, see `backend/.env.example`). With none set,
IRIS runs entirely on free keyless sources and the AI features use offline fallbacks.

Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **IMD** | India Meteorological Department — owns the rain classes and the four-colour scale |
| **CWC** | Central Water Commission — runs ~1,700 river gauges with warning/danger levels |
| **NDMA / SACHET** | National Disaster Management Authority / its official alert platform |
| **NDRF / SDRF** | National / State Disaster Response Force |
| **GloFAS** | Global Flood Awareness System — modelled river discharge |
| **Climatology** | what is *normal* for this place on this day of year (30 years of history) |
| **Pluvial / riverine** | flooding from heavy rain on the spot / from a river overflowing |
| **Snapshot** | the latest complete set of scores held in memory and served by the API |
| **CAP 1.2** | Common Alerting Protocol — the XML standard for official warnings |
| **Floor** | minimum score forced by official data, whatever the model says |
