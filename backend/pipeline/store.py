# store.py: writes to our 5 tables: the run history (pipeline_runs), the session and client connection tags (session_tags, connection_tags), and the per-session facts and error copies the dashboard reads (session_facts, error_events).

# Add a 'running' row to the run history and return its ID.
START_RUN_SQL = """
INSERT INTO pipeline_runs (status)
VALUES ('running')
RETURNING run_id
"""


def start_run(conn):                                         # Adds a 'running' row to pipeline_runs and returns its run_id
    return conn.execute(START_RUN_SQL).fetchone()[0]


# Save session tags in one database call.
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


# Save client connection tags in one database call.
SAVE_CONNECTIONS_SQL = """
UPSERT INTO connection_tags (connection_id, session_id, tag, reason, started_at, run_id)
SELECT connection_id, session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(sessions)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(connection_id, session_id, tag, reason, started_at)
"""


def save_connection_tags(conn, connections, run_id):         # Saves a batch of client connections to connection_tags in one call
    parameters = {
        "ids": list(connections.keys()),
        "sessions": [connection["session_id"] for connection in connections.values()],
        "tags": [connection["tag"] for connection in connections.values()],
        "reasons": [connection["reason"] for connection in connections.values()],
        "started": [connection["started_at"] for connection in connections.values()],
        "run_id": run_id,
    }
    conn.execute(SAVE_CONNECTIONS_SQL, parameters)


# Sessions with events newer than the newest event session_facts already has, minus 10 minutes in case an event is stored a little after its recorded time; oldest first.
CHANGED_SESSIONS_SQL = """
SELECT session_id
FROM session_telemetry_events
WHERE recorded_at > (SELECT coalesce(max(last_event_at) - INTERVAL '10 minutes', '-infinity'::TIMESTAMPTZ) FROM session_facts)
GROUP BY session_id
ORDER BY max(recorded_at)
"""

# Every session with events, for a full rebuild.
ALL_SESSIONS_SQL = """
SELECT DISTINCT session_id FROM session_telemetry_events
"""

# Count the facts of these sessions again from all their events and save them.
SAVE_FACTS_SQL = """
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
       max(e.recorded_at)
FROM session_telemetry_events e
WHERE e.session_id = ANY(%(ids)s::UUID[])
GROUP BY e.session_id
"""

# Copy these sessions' error-level events (already copied ones are just written again).
SAVE_ERRORS_SQL = """
UPSERT INTO error_events (id, session_id, connection_id, recorded_at, event, code, error_code, phase, stage, message, detail)
SELECT e.id, e.session_id, e.connection_id, e.recorded_at,
       coalesce(e.payload->>'event', e.event_type::STRING),
       e.payload->>'code', e.payload->>'errorCode', e.payload->>'phase', e.payload->>'stage',
       e.message, coalesce(e.payload->>'reason', e.payload->>'errorText')
FROM session_telemetry_events e
WHERE e.session_id = ANY(%(ids)s::UUID[]) AND e.level = 'error'
"""

FACTS_BATCH = 1000


def refresh_facts(conn, everything=False):                   # Recounts session_facts and copies error_events for every session with new events (all sessions if everything), in one transaction; returns how many. Called by __main__ once per round and by the facts command
    sql = ALL_SESSIONS_SQL if everything else CHANGED_SESSIONS_SQL
    ids = [row[0] for row in conn.execute(sql).fetchall()]
    for start in range(0, len(ids), FACTS_BATCH):
        batch = {"ids": ids[start:start + FACTS_BATCH]}
        conn.execute(SAVE_FACTS_SQL, batch)
        conn.execute(SAVE_ERRORS_SQL, batch)
    conn.commit()
    return len(ids)


# Close the run: finish time, status, sessions saved and error.
FINISH_RUN_SQL = """
UPDATE pipeline_runs
SET finished_at = now(),
    status = %(status)s,
    sessions_tagged = (SELECT count(*) FROM session_tags WHERE run_id = %(run_id)s),
    error = %(error)s
WHERE run_id = %(run_id)s
"""


def finish_run(conn, run_id, status, error=None):            # Marks the run ok or failed, with its count and error
    parameters = {
        "run_id": run_id,
        "status": status,
        "error": error,
    }
    conn.execute(FINISH_RUN_SQL, parameters)
