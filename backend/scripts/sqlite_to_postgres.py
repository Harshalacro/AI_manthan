"""
Copy the SQLite database (jaldrishti.db) into Postgres (Neon).

    DATABASE_URL=postgresql://... python scripts/sqlite_to_postgres.py

Reads DATABASE_URL from the environment or backend/.env. Creates every table
in Postgres through the app's own init code (so the schema is exactly what the
app expects), then copies each table across in batches. Rows that already
exist in Postgres are left alone, so it is safe to run twice. Finally moves the
runs.id sequence past the copied ids so new runs don't collide.
"""

from __future__ import annotations

import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, store  # noqa: E402  (config loads backend/.env)

TABLES = [
    "runs", "location_state", "observations", "climatology", "source_health",
    "users", "app_meta",
    "notify_prefs", "notify_sent", "notify_log", "notify_meta",
    "plan_runs", "res_depots", "res_stock", "res_deployments",
]
BATCH = 200


def main() -> int:
    if not store.USING_POSTGRES:
        print("DATABASE_URL is not set to a postgres:// URL (env or backend/.env).")
        return 1
    src_path = Path(config.DB_PATH)
    if not src_path.exists():
        print(f"No SQLite database at {src_path}")
        return 1

    from app import auth, notify, planning, resources
    from app.engine import LOCATIONS

    print("Creating tables in Postgres…")
    store.init_db()
    notify.init()
    auth.init(LOCATIONS)
    resources.init()
    planning.init()

    src = sqlite3.connect(src_path)
    src.row_factory = sqlite3.Row
    have = {r["name"] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    for table in TABLES:
        if table not in have:
            print(f"  {table:16} not in SQLite, skipped")
            continue
        cols = [r["name"] for r in src.execute(f"PRAGMA table_info({table})")]
        rows = src.execute(f"SELECT {', '.join(cols)} FROM {table}").fetchall()
        t0 = time.time()
        sql = f"INSERT OR IGNORE INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
        for i in range(0, len(rows), BATCH):
            with store.db() as conn:
                conn.executemany(sql, [tuple(r) for r in rows[i : i + BATCH]])
        print(f"  {table:16} {len(rows):6} rows  {time.time() - t0:5.1f}s")

    with store.db() as conn:
        conn.execute("SELECT setval(pg_get_serial_sequence('runs', 'id'), COALESCE((SELECT MAX(id) FROM runs), 1))")
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in TABLES}
    print("Now in Postgres:", ", ".join(f"{t} {n}" for t, n in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
