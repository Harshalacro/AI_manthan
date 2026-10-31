# Database

Iris keeps its state in one database: either a local SQLite file (the default)
or Postgres on [Neon](https://neon.tech). Setting `DATABASE_URL` switches to
Postgres. Nothing else changes; every query goes through the same code.

## Choosing the database

| Setting | Database |
|---|---|
| `DATABASE_URL` unset | SQLite file at `JALDRISHTI_DB` (default `backend/jaldrishti.db`) |
| `DATABASE_URL=postgresql://…` | Postgres, e.g. Neon |

Put `DATABASE_URL` in `backend/.env` locally (git-ignored) or in the Render
dashboard (`render.yaml` asks for it). Never commit it: it contains the password.

On Render's free plan the disk is wiped on every deploy, so SQLite loses
accounts, results and settings each time. Neon keeps them.

## How it works

| What | Where |
|---|---|
| Reads `DATABASE_URL` | `backend/app/config.py` |
| `store.db()`: every query goes through it; picks SQLite or Postgres | `backend/app/store.py` |
| Translates the SQLite-style SQL (`?`, `INSERT OR REPLACE`, `PRAGMA table_info`, `AUTOINCREMENT`) to Postgres, pools connections, batches multi-row inserts | `backend/app/pgcompat.py` |
| Creates all tables on startup (`CREATE TABLE IF NOT EXISTS`) | `backend/app/main.py` (calls each module's `init`) |
| The full schema as Postgres SQL, for reading or creating an empty database | `backend/db/schema.sql` |
| Copies an existing SQLite database into Postgres | `backend/scripts/sqlite_to_postgres.py` |

## Setting up Neon

1. Create a project at console.neon.tech (Singapore, `aws-ap-southeast-1`, is
   closest to the Render backend).
2. **Connect** → copy the connection string.
3. Add it to `backend/.env` as `DATABASE_URL=...`.
4. Optional, to bring over existing data from `jaldrishti.db`:

   ```bash
   cd backend
   python scripts/sqlite_to_postgres.py
   ```

   It creates the tables, copies every row (existing rows are left alone, so it
   is safe to run twice) and moves the `runs.id` sequence past the copied ids.
5. Start the backend as usual. Without step 4, it creates empty tables and the
   seed accounts on first start.

## Tables

| Table | Defined in | Primary key | Holds |
|---|---|---|---|
| `runs` | `app/store.py` | `id` (auto) | One row per data refresh: times, status, places scored |
| `location_state` | `app/store.py` | `location_id, run_id` | Each place's score, level, confidence and full assessment (JSON) per run |
| `observations` | `app/store.py` | `location_id, date, kind, horizon` | Daily rainfall and river readings, observed and forecast |
| `climatology` | `app/store.py` | `location_id` | 30-year GloFAS river baseline per place |
| `source_health` | `app/store.py` | `source` | Last check of each data source |
| `users` | `app/auth.py` | `username` | Control-room and citizen accounts (PBKDF2 password hashes) |
| `app_meta` | `app/auth.py` | `key` | Token-signing secret when `JALDRISHTI_SECRET` is not set |
| `notify_prefs` | `app/notify.py` | `username` | Alert channels and contact details per user |
| `notify_sent` | `app/notify.py` | `username, alert_id` | Which alert went to whom (no repeats) |
| `notify_log` | `app/notify.py` | `id` | Delivery history |
| `notify_meta` | `app/notify.py` | `key` | Small notification settings |
| `plan_runs` | `app/planning.py` | `id` | Each deployment plan the optimiser produced (JSON) |
| `res_depots` | `app/resources.py` | `id` | NDRF battalions and SDRF depots |
| `res_stock` | `app/resources.py` | `depot_id, rtype` | Units per depot by type |
| `res_deployments` | `app/resources.py` | `id` | Units dispatched from the Plan page until returned |

Notes:

- Timestamps and JSON documents are stored as `TEXT`, as on SQLite.
- `location_state` grows by one row per place per refresh (112 rows every 90
  minutes). Neon's free tier allows 0.5 GB; prune old runs if it gets close.
- This repository contains the schema only. No data is committed: the tables
  hold password hashes and the token-signing secret.
