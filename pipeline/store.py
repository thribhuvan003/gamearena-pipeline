# store.py: finds the sessions with new events and writes our 5 tables: run history, session facts, error copies, session and client tags.

from datetime import timedelta

from pipeline import config

# Add a 'running' row to the run history and return its ID; full_rebuild = every session was processed again.
START_RUN_SQL = """
INSERT INTO pipeline_runs (status, full_rebuild)
VALUES ('running', %(full)s)
RETURNING run_id
"""

# Runs still marked running belong to a process that was stopped hard (only one pipeline runs at a time).
CLOSE_STALE_RUNS_SQL = """
UPDATE pipeline_runs
SET status = 'failed', finished_at = now(), error = 'Stopped before finishing (the process ended)'
WHERE status = 'running'
"""

# When the last full rebuild finished well; kept in the database so a restart doesn't reset the schedule.
LAST_FULL_REBUILD_SQL = "SELECT max(started_at) FROM pipeline_runs WHERE full_rebuild AND status = 'ok'"
LAST_RUN_STATUS_SQL = "SELECT status FROM pipeline_runs ORDER BY started_at DESC, run_id DESC LIMIT 1"


def start_run(conn, full=False):                             # Closes runs left running, adds a 'running' row to pipeline_runs and returns its run_id
    conn.execute(CLOSE_STALE_RUNS_SQL)
    return conn.execute(START_RUN_SQL, {"full": full}).fetchone()[0]


def rebuild_due(conn):                                       # True if no full rebuild has finished well in the last REBUILD_HOURS
    last = conn.execute(LAST_FULL_REBUILD_SQL).fetchone()[0]
    if last is None:
        return True
    age = conn.execute("SELECT now() - %(last)s::TIMESTAMPTZ", {"last": last}).fetchone()[0]
    return age >= timedelta(hours=config.REBUILD_HOURS)


# The newest raw event, and the newest event already counted in session_facts (both read from an index). Events dated in the
# future are left out, so one wrong clock can't push "newest processed" ahead and stop new events being picked up.
NEWEST_EVENT_SQL = f"SELECT max(recorded_at) FROM {config.EVENTS_TABLE} WHERE recorded_at <= now()"
NEWEST_PROCESSED_SQL = "SELECT max(last_event_at) FROM session_facts WHERE last_event_at <= now()"

# Sessions with events after a given time (by the recorded_at index), oldest first.
CHANGED_SESSIONS_SQL = f"""
SELECT session_id
FROM {config.EVENTS_TABLE}
WHERE recorded_at > %(since)s AND recorded_at <= now()
GROUP BY session_id
ORDER BY max(recorded_at)
"""

# Every session with events, for the first run and a full rebuild.
ALL_SESSIONS_SQL = f"""
SELECT session_id
FROM {config.EVENTS_TABLE}
GROUP BY session_id
ORDER BY max(recorded_at)
"""


# How many events the late window holds: if it changes, an event arrived (or went) without a newer timestamp.
WINDOW_COUNT_SQL = f"SELECT count(*) FROM {config.EVENTS_TABLE} WHERE recorded_at > %(since)s AND recorded_at <= now()"


def changed_sessions(conn, everything=False, window=None):   # (ids oldest first, full): all on a rebuild or first run, else sessions with events in the late window when something in it changed
    newest_processed = conn.execute(NEWEST_PROCESSED_SQL).fetchone()[0]
    last_run = conn.execute(LAST_RUN_STATUS_SQL).fetchone()
    incomplete = last_run is not None and last_run[0] != "ok"
    if everything or newest_processed is None or incomplete or conn.execute(LAST_FULL_REBUILD_SQL).fetchone()[0] is None:
        return [row[0] for row in conn.execute(ALL_SESSIONS_SQL).fetchall()], True
    since = newest_processed - timedelta(minutes=config.LATE_EVENTS_MINUTES)
    newest_event = conn.execute(NEWEST_EVENT_SQL).fetchone()[0]
    seen = (since, conn.execute(WINDOW_COUNT_SQL, {"since": since}).fetchone()[0])
    nothing_newer = newest_event is None or newest_event <= newest_processed
    if window is not None:                                   # window remembers the last count between rounds
        unchanged = window.get("seen") == seen
        window["seen"] = seen
        if nothing_newer and unchanged:
            return [], False
    elif nothing_newer:
        return [], False
    return [row[0] for row in conn.execute(CHANGED_SESSIONS_SQL, {"since": since}).fetchall()], False


# Count the facts of these sessions again from all their events and save them.
SAVE_FACTS_SQL = f"""
UPSERT INTO session_facts (session_id, events, has_end, attempts, reconnects,
                           first_failure, last_failure, first_success, last_success, last_event_at)
SELECT e.session_id,
       count(*),
       bool_or(e.event_type = 'session_ended'),
       count(*) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.attempt'),
       count(*) FILTER (WHERE e.event_type = 'client_reconnected'),
       min(e.recorded_at) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.failure'),
       max(e.recorded_at) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.failure'),
       min(e.recorded_at) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.success'),
       max(e.recorded_at) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.success'),
       coalesce(max(e.recorded_at) FILTER (WHERE e.recorded_at <= now()), min(e.recorded_at))
FROM {config.EVENTS_TABLE} e
WHERE e.session_id = ANY(%(ids)s::UUID[])
GROUP BY e.session_id
"""

# Drop these sessions' copied errors before copying them again, so an error removed from the raw events disappears here too.
DELETE_ERRORS_SQL = """
DELETE FROM error_events WHERE session_id = ANY(%(ids)s::UUID[])
"""

# Copy these sessions' error-level events.
SAVE_ERRORS_SQL = f"""
UPSERT INTO error_events (id, session_id, connection_id, recorded_at, event, code, error_code, phase, stage, state, message, detail)
SELECT e.id, e.session_id, e.connection_id, e.recorded_at,
       coalesce(e.payload->>'event', e.event_type::STRING),
       e.payload->>'code', e.payload->>'errorCode', e.payload->>'phase', e.payload->>'stage', e.payload->>'state',
       e.message, coalesce(e.payload->>'reason', e.payload->>'errorText')
FROM {config.EVENTS_TABLE} e
WHERE e.session_id = ANY(%(ids)s::UUID[]) AND e.level = 'error'
"""


def refresh_facts(conn, session_ids):                        # Recounts session_facts and recopies error_events for these sessions (the caller commits)
    batch = {"ids": session_ids}
    conn.execute(SAVE_FACTS_SQL, batch)
    conn.execute(DELETE_ERRORS_SQL, batch)
    conn.execute(SAVE_ERRORS_SQL, batch)


# On a full rebuild, drop every row whose raw events are gone (e.g. telemetry deleted by a retention policy), in all four tables.
DELETE_GONE_SQL = [
    f"DELETE FROM session_facts f WHERE NOT EXISTS (SELECT 1 FROM {config.EVENTS_TABLE} e WHERE e.session_id = f.session_id)",
    f"DELETE FROM error_events x WHERE NOT EXISTS (SELECT 1 FROM {config.EVENTS_TABLE} e WHERE e.id = x.id)",
    f"""DELETE FROM session_tags t WHERE NOT EXISTS (SELECT 1 FROM {config.EVENTS_TABLE} e
                                                     WHERE e.session_id = t.session_id AND e.event_type = 'session_ended')""",
    f"""DELETE FROM connection_tags t WHERE NOT EXISTS (SELECT 1 FROM session_tags s WHERE s.session_id = t.session_id)
                                       OR NOT EXISTS (SELECT 1 FROM {config.EVENTS_TABLE} e
                                                      WHERE e.session_id = t.session_id AND e.connection_id = t.connection_id)""",
]


def delete_gone(conn):                                       # Drops rows of all four tables whose raw events are gone (full rebuild only)
    for delete in DELETE_GONE_SQL:
        conn.execute(delete)


# Save session tags in one database call; a session tagged again is overwritten, never duplicated.
SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, reason, started_at, run_id)
SELECT session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(session_id, tag, reason, started_at)
"""


def save_tags(conn, sessions, run_id):                       # Saves a batch of sessions to session_tags in one call
    parameters = {
        "ids": list(sessions.keys()),
        "tags": [session["tag"] for session in sessions.values()],
        "reasons": [session["reason"] for session in sessions.values()],
        "started": [session["started_at"] for session in sessions.values()],
        "run_id": run_id,
    }
    conn.execute(SAVE_SQL, parameters)


# Save client connection tags, labels and milestones in one database call; a client saved again is overwritten.
SAVE_CONNECTIONS_SQL = """
UPSERT INTO connection_tags (connection_id, session_id, tag, reason, started_at, connected_at,
                             device, os, browser, access, gathered, decoded, logged, run_id)
SELECT connection_id, session_id, tag, reason, started_at, connected_at, device, os, browser, access, gathered, decoded, logged, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(sessions)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[],
            %(connected)s::TIMESTAMPTZ[], %(devices)s::STRING[], %(oses)s::STRING[], %(browsers)s::STRING[], %(accesses)s::STRING[],
            %(gathered)s::BOOL[], %(decoded)s::BOOL[], %(logged)s::STRING[])
     AS t(connection_id, session_id, tag, reason, started_at, connected_at, device, os, browser, access, gathered, decoded, logged)
"""


def save_connection_tags(conn, connections, run_id):         # Saves a batch of client connections to connection_tags in one call
    rows = connections.values()
    parameters = {
        "ids": list(connections.keys()),
        "sessions": [row["session_id"] for row in rows],
        "tags": [row["tag"] for row in rows],
        "reasons": [row["reason"] for row in rows],
        "started": [row["started_at"] for row in rows],
        "connected": [row["connected_at"] for row in rows],
        "devices": [row["device"] for row in rows],
        "oses": [row["os"] for row in rows],
        "browsers": [row["browser"] for row in rows],
        "accesses": [row["access"] for row in rows],
        "gathered": [row["gathered"] for row in rows],
        "decoded": [row["decoded"] for row in rows],
        "logged": [row["logged"] for row in rows],
        "run_id": run_id,
    }
    conn.execute(SAVE_CONNECTIONS_SQL, parameters)


# Close the run: finish time, status, sessions tagged and error.
FINISH_RUN_SQL = """
UPDATE pipeline_runs
SET finished_at = now(), status = %(status)s, sessions_tagged = %(tagged)s, error = %(error)s
WHERE run_id = %(run_id)s
"""


def finish_run(conn, run_id, status, tagged, error=None):    # Marks the run ok or failed, with how many sessions it tagged and the error
    conn.execute(FINISH_RUN_SQL, {"run_id": run_id, "status": status, "tagged": tagged, "error": error})
