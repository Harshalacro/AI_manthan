"""
Postgres (Neon) behind the same calls the code makes on SQLite.

Every module talks to the database through `store.db()` with SQLite-style SQL:
`?` placeholders, `INSERT OR REPLACE`, `executescript`, `PRAGMA table_info`.
When DATABASE_URL points at Postgres, `store.db()` hands out a `PgConn` from
this module instead, which rewrites those few SQLite-isms on the way through,
so no query elsewhere had to change. Rows come back addressable by column name
and by position, as `sqlite3.Row` allows.

Connections come from a small pool: Neon is a network hop away, and opening a
fresh TLS connection per query would add a quarter-second to every request.
"""

from __future__ import annotations

import atexit
import re
from typing import Any, Iterable, Iterator, Sequence

import psycopg
from psycopg_pool import ConnectionPool

# Conflict targets for INSERT OR REPLACE, from each table's primary key.
PRIMARY_KEYS: dict[str, tuple[str, ...]] = {
    "runs": ("id",),
    "location_state": ("location_id", "run_id"),
    "observations": ("location_id", "date", "kind", "horizon"),
    "climatology": ("location_id",),
    "source_health": ("source",),
    "users": ("username",),
    "app_meta": ("key",),
    "notify_prefs": ("username",),
    "notify_sent": ("username", "alert_id"),
    "notify_log": ("id",),
    "notify_meta": ("key",),
    "plan_runs": ("id",),
    "res_depots": ("id",),
    "res_stock": ("depot_id", "rtype"),
    "res_deployments": ("id",),
}

_INSERT_OR = re.compile(r"^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+(\w+)\s*\(([^)]*)\)", re.I | re.S)
_VALUES = re.compile(r"\(\s*\?(?:\s*,\s*(?:\?|\d+|'[^']*'))*\s*\)")
_PRAGMA_COLS = re.compile(r"^\s*PRAGMA\s+table_info\((\w+)\)\s*$", re.I)


class Row(dict):
    """A dict that also answers row[0], like sqlite3.Row."""

    def __init__(self, names: Sequence[str], values: Sequence[Any]):
        super().__init__(zip(names, values))
        self._values = tuple(values)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def keys(self):  # sqlite3.Row exposes keys(); dict(row) works either way
        return super().keys()


def _params(params: Sequence[Any] | None) -> tuple:
    # The schema keeps flags as INTEGER 0/1 (SQLite has no boolean type).
    return tuple(int(p) if isinstance(p, bool) else p for p in (params or ()))


def _row_factory(cursor):
    names = [d.name for d in cursor.description] if cursor.description else []
    return lambda values: Row(names, values)


def translate(sql: str) -> str:
    """SQLite SQL to Postgres SQL, for the subset this app uses."""
    pragma = _PRAGMA_COLS.match(sql)
    if pragma:
        return (
            "SELECT column_name AS name FROM information_schema.columns "
            f"WHERE table_schema = current_schema() AND table_name = '{pragma.group(1).lower()}'"
        )

    out = sql
    m = _INSERT_OR.match(out)
    if m:
        verb, table, cols = m.group(1).upper(), m.group(2), [c.strip() for c in m.group(3).split(",")]
        out = _INSERT_OR.sub(lambda _: f"INSERT INTO {table} ({m.group(3)})", out, count=1)
        keys = PRIMARY_KEYS.get(table)
        if not keys:
            raise ValueError(f"No primary key known for {table}; add it to pgcompat.PRIMARY_KEYS")
        if verb == "IGNORE":
            out = f"{out.rstrip().rstrip(';')} ON CONFLICT ({', '.join(keys)}) DO NOTHING"
        else:
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in keys)
            action = f"DO UPDATE SET {updates}" if updates else "DO NOTHING"
            out = f"{out.rstrip().rstrip(';')} ON CONFLICT ({', '.join(keys)}) {action}"

    # DDL types
    out = re.sub(r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT", "BIGSERIAL PRIMARY KEY", out, flags=re.I)
    out = re.sub(r"\bREAL\b", "DOUBLE PRECISION", out)
    # placeholders last; literal % must be doubled for psycopg
    out = out.replace("%", "%%").replace("?", "%s")
    return out


def split_script(script: str) -> list[str]:
    """executescript() input to single statements (no semicolons in our literals)."""
    no_comments = re.sub(r"--[^\n]*", "", script)
    return [s.strip() for s in no_comments.split(";") if s.strip()]


class PgCursor:
    def __init__(self, cur: psycopg.Cursor):
        self._cur = cur

    def fetchone(self):
        return self._cur.fetchone() if self._cur.description else None

    def fetchall(self):
        return self._cur.fetchall() if self._cur.description else []

    def __iter__(self) -> Iterator[Row]:
        return iter(self.fetchall())

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount


class PgConn:
    """The slice of the sqlite3.Connection API this app uses."""

    def __init__(self, conn: psycopg.Connection):
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> PgCursor:
        cur = self._conn.cursor(row_factory=_row_factory)
        stripped = sql.strip().upper()
        if stripped.startswith("PRAGMA") and not _PRAGMA_COLS.match(sql):
            return PgCursor(cur)  # journal_mode etc. mean nothing here
        cur.execute(translate(sql), _params(params))
        return PgCursor(cur)

    def executemany(self, sql: str, rows: Iterable[Sequence[Any]]) -> None:
        """Many rows in as few round trips as possible.

        Neon is ~100 ms away, so one INSERT per row (what executemany does)
        made a 112-place refresh take seconds. An INSERT with one VALUES group
        is sent as a single multi-row INSERT per chunk instead.
        """
        rows = [_params(r) for r in rows]
        if not rows:
            return
        groups = _VALUES.findall(sql)
        with self._conn.cursor() as cur:
            if len(groups) != 1 or not sql.lstrip().upper().startswith("INSERT"):
                cur.executemany(translate(sql), rows)
                return
            m = _INSERT_OR.match(sql) or re.match(r"^\s*INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)", sql, re.I | re.S)
            table = m.group(2) if m.re is _INSERT_OR else m.group(1)
            cols = [c.strip() for c in (m.group(3) if m.re is _INSERT_OR else m.group(2)).split(",")]
            keys = PRIMARY_KEYS.get(table)
            if keys and all(k in cols for k in keys):
                # ON CONFLICT cannot touch one row twice in a statement: keep the last.
                idx = [cols.index(k) for k in keys]
                rows = list({tuple(r[i] for i in idx): r for r in rows}.values())
            head, group, tail = sql.partition(groups[0])
            for i in range(0, len(rows), 100):
                chunk = rows[i : i + 100]
                one = head + ", ".join([group] * len(chunk)) + tail
                cur.execute(translate(one), [v for r in chunk for v in r])

    def executescript(self, script: str) -> None:
        with self._conn.cursor() as cur:
            for stmt in split_script(script):
                cur.execute(translate(stmt), ())

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()


_pool: ConnectionPool | None = None


def pool(url: str) -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            url,
            min_size=1,
            max_size=6,
            kwargs={"autocommit": False, "prepare_threshold": None},  # Neon's pooler does not keep prepared statements
            open=True,
        )
        atexit.register(_pool.close)
    return _pool
