# integration.py (just integration): the pipeline's behaviour against a uniquely named throwaway database, with
# made-up events in its own small copies of the app's tables. The real telemetry is never touched. Needs the local CockroachDB.
import contextlib
import io
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

# Require an explicitly selected disposable local cluster, never the configured application DB.
port = os.environ.get("TEST_DB_PORT", "")
if os.environ.get("ALLOW_DISPOSABLE_TEST_DB") != "1" or not port.isdecimal() or not 1 <= int(port) <= 65535 or int(port) == 26257:
    raise SystemExit("Use a disposable local CockroachDB on a separate port; set TEST_DB_PORT and ALLOW_DISPOSABLE_TEST_DB=1. Never use a port forward.")
suffix = uuid.uuid4().hex[:12]
TEST_DATABASE = f"gamearena_test_{suffix}"
TEST_USER = f"gamearena_test_user_{suffix}"
os.environ.update(DB_HOST="127.0.0.1", DB_PORT=port, DB_NAME=TEST_DATABASE, DB_USER="root",
                  DB_PASSWORD="", DB_SSLMODE="disable", DB_SSLROOTCERT="", EVENTS_TABLE="session_telemetry_events",
                  CLIENTS_TABLE=f"{TEST_DATABASE}.public.session_client_connections", REBUILD_HOURS="24",
                  LATE_EVENTS_MINUTES="60", PRUNE_EXPIRED_TELEMETRY="1")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import psycopg                                                # noqa: E402
from psycopg.types.json import Json                           # noqa: E402
from pipeline import config, db, store                       # noqa: E402
from pipeline.__main__ import run_one_round                   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NOW = datetime.now(timezone.utc)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
OURS = ["session_tags", "connection_tags", "session_facts", "error_events", "pipeline_runs"]

# The two app tables the pipeline reads, cut down to the columns it uses.
APP_TABLES = """
CREATE TABLE session_telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_id UUID NOT NULL, connection_id UUID NULL, connection_role STRING NULL,
    source STRING NOT NULL, event_type STRING NOT NULL, level STRING NOT NULL DEFAULT 'info', message STRING NULL,
    payload JSONB NOT NULL DEFAULT '{}', recorded_at TIMESTAMPTZ NOT NULL, INDEX (recorded_at), INDEX (session_id, recorded_at));
CREATE TABLE session_client_connections (
    id UUID PRIMARY KEY, session_id UUID NOT NULL, user_agent STRING NULL, connected_at TIMESTAMPTZ NULL,
    disconnected_at TIMESTAMPTZ NULL, auth_type STRING NULL, auth_id STRING NULL);
"""

failures = []


def admin(dbname):                                            # A root connection with autocommit, for setting up and tearing down
    return psycopg.connect(host=config.DB_HOST, port=config.DB_PORT, dbname=dbname, user="root", sslmode=config.DB_SSLMODE, autocommit=True)


def check(name, ok):                                          # Prints one result and remembers failures
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)


def event(conn, session, at, name, client=None, source="client", level="info", app_event=False, payload=None):   # One raw event
    body = dict(payload or {})
    if app_event:
        body["event"] = name
    conn.execute("""INSERT INTO session_telemetry_events (session_id, connection_id, connection_role, source, event_type, level, payload, recorded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s::JSONB, %s)""",
                 (session, client, "client" if client else None, source, "app_event" if app_event else name, level, Json(body), at))


def add_session(conn, start, connects):                       # A session with one client that tried to connect, ended 10 s later
    session, client = uuid.uuid4(), uuid.uuid4()
    conn.execute("INSERT INTO session_client_connections (id, session_id, user_agent, connected_at, auth_type) VALUES (%s, %s, %s, %s, 'external')",
                 (client, session, UA, start + timedelta(seconds=2)))
    event(conn, session, start, "session_started", source="system")
    event(conn, session, start + timedelta(seconds=1), "pipeline.connect.attempt", app_event=True)
    event(conn, session, start + timedelta(seconds=2), "client_connected", client, source="system")
    if connects:
        event(conn, session, start + timedelta(seconds=3), "pipeline.connect.success", client, app_event=True)
    event(conn, session, start + timedelta(seconds=10), "session_ended", source="system")
    return session, client


def one(conn, sql, args=()):                                  # The first column of the first row, ending the read transaction
    value = conn.execute(sql, args).fetchone()[0]
    conn.commit()
    return value


def round_(conn, window, limit=None, everything=False):       # One pipeline round, its printing kept quiet; ends its transaction
    with contextlib.redirect_stdout(io.StringIO()):         # like the pipeline does by opening a new connection each round
        tagged = run_one_round(conn, limit, everything, window)
    conn.commit()
    return tagged


def main():
    with admin("defaultdb") as root:
        root.execute(f"CREATE DATABASE {TEST_DATABASE}")
    try:
        with admin(TEST_DATABASE) as root:
            root.execute(APP_TABLES)
            root.execute(io.open(os.path.join(ROOT, "database", "setup.sql"), encoding="utf-8").read())
            base = NOW - timedelta(hours=3)
            s1, _ = add_session(root, base, connects=True)
            s2, c2 = add_session(root, base + timedelta(minutes=1), connects=False)
            s3, _ = add_session(root, base + timedelta(minutes=2), connects=True)

        with db.connect() as conn:
            window = {}
            print("First build, then nothing new")
            round_(conn, window)
            check("3 sessions tagged by the first build", one(conn, "SELECT count(*) FROM session_tags") == 3)
            check("the first build counts as a full rebuild", not store.rebuild_due(conn))
            conn.commit()
            round_(conn, window)
            runs = one(conn, "SELECT count(*) FROM pipeline_runs")
            round_(conn, window)
            check("nothing new: no run recorded, nothing written", one(conn, "SELECT count(*) FROM pipeline_runs") == runs)
            check("no duplicates", one(conn, "SELECT count(*) FROM connection_tags") == 3)

            print("Stopped halfway, then restarted")
            for table in OURS:
                conn.execute(f"DELETE FROM {table} WHERE true")
            conn.commit()
            round_(conn, {}, limit=1)
            check("the stopped build saved only part", one(conn, "SELECT count(*) FROM session_tags") == 1)
            window = {}
            round_(conn, window)
            check("the restart finished the rest exactly", one(conn, "SELECT count(*) FROM session_tags") == 3
                  and one(conn, "SELECT count(*) FROM session_tags WHERE tag = 'connected'") == 2)

            print("A late event with no newer timestamp")
            round_(conn, window)
            with admin(TEST_DATABASE) as root:
                event(root, s2, base + timedelta(minutes=1, seconds=3), "pipeline.connect.success", c2, app_event=True)
            round_(conn, window)
            check("the session it belongs to was tagged again", one(conn, "SELECT tag FROM session_tags WHERE session_id = %s", (s2,)) == "connected")

            print("An event dated in the future")
            with admin(TEST_DATABASE) as root:
                event(root, s1, NOW + timedelta(days=1), "ws_error", source="system", level="warn")
            round_(conn, window)
            with admin(TEST_DATABASE) as root:
                s4, _ = add_session(root, NOW - timedelta(minutes=5), connects=False)
            round_(conn, window)
            check("a newer session is still picked up", one(conn, "SELECT count(*) FROM session_tags WHERE session_id = %s", (s4,)) == 1)

            print("Daily rebuild, kept in the database")
            round_(conn, window, everything=True)
            check("not due right after a full rebuild", not store.rebuild_due(conn))
            conn.commit()
            conn.execute("UPDATE pipeline_runs SET started_at = started_at - INTERVAL '25 hours' WHERE full_rebuild")
            conn.commit()
            check("due once the last one is over REBUILD_HOURS old", store.rebuild_due(conn))
            conn.commit()
            round_(conn, window, everything=True)
            check("not due again after it ran", not store.rebuild_due(conn))
            conn.commit()

            print("A run left 'running' by a hard stop")
            conn.execute("INSERT INTO pipeline_runs (status) VALUES ('running')")
            conn.commit()
            round_(conn, window, everything=True)
            check("closed as failed by the next run", one(conn, "SELECT count(*) FROM pipeline_runs WHERE status = 'running'") == 0)

            print("The restricted user")
            with admin(TEST_DATABASE) as root:
                root.execute(f"CREATE USER {TEST_USER}")
                root.execute(f"GRANT SELECT ON TABLE session_telemetry_events, session_client_connections TO {TEST_USER}")
                root.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {', '.join(OURS)} TO {TEST_USER}")
            with psycopg.connect(host=config.DB_HOST, port=config.DB_PORT, dbname=TEST_DATABASE, user=TEST_USER, sslmode=config.DB_SSLMODE) as limited:
                for name, sql in (("delete app events", "DELETE FROM session_telemetry_events WHERE true"),
                                  ("change client records", "UPDATE session_client_connections SET auth_type = auth_type WHERE true"),
                                  ("drop a pipeline table", "DROP TABLE session_tags")):
                    try:
                        limited.execute(sql)
                        refused = False
                    except psycopg.errors.InsufficientPrivilege:
                        refused = True
                    limited.rollback()
                    check(f"can't {name}", refused)
                round_(limited, {}, everything=True)
                check("can still do a full rebuild", one(limited, "SELECT count(*) FROM session_tags") == 4)

            print("Raw events deleted (retention)")
            with admin(TEST_DATABASE) as root:
                root.execute("DELETE FROM session_telemetry_events WHERE session_id = %s", (s3,))
            round_(conn, window, everything=True)
            left = sum(one(conn, f"SELECT count(*) FROM {t} WHERE session_id = %s", (s3,)) for t in OURS[:4])
            check("a full rebuild removes its rows from all four tables", left == 0)
            with admin(TEST_DATABASE) as root:
                root.execute("DELETE FROM session_telemetry_events WHERE true")
            round_(conn, window, everything=True)
            left = sum(one(conn, f"SELECT count(*) FROM {t}") for t in OURS[:4])
            check("an emptied source empties the four tables", left == 0)
    finally:
        with admin("defaultdb") as root:
            root.execute(f"DROP DATABASE IF EXISTS {TEST_DATABASE} CASCADE")
            root.execute(f"DROP USER IF EXISTS {TEST_USER}")

    print(f"{'All passed' if not failures else f'{len(failures)} failed'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
