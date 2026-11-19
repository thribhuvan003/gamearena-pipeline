# store.py: writes to our 3 tables: the run history (pipeline_runs), the session tags (session_tags) and the client connection tags (connection_tags).

# SQL (used by start_run): add a new run to the run history with status 'running', and give back its ID.
START_RUN_SQL = """
INSERT INTO pipeline_runs (status)
VALUES ('running')
RETURNING run_id
"""


def start_run(conn):                                         # Adds a 'running' row to pipeline_runs and returns its run_id. Called by run_one_round
    return conn.execute(START_RUN_SQL).fetchone()[0]


# SQL (used by save_tags): turn 4 lists (session IDs, tags, reasons, start times) into rows and save them all at once, stamped with this run's ID.
SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, reason, started_at, run_id)
SELECT session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(session_id, tag, reason, started_at)
"""


def save_tags(conn, sessions, run_id):                       # Saves a batch of sessions to session_tags in one call. Called by tag_new_sessions
    parameters = {
        "ids": list(sessions.keys()),
        "tags": [session["tag"] for session in sessions.values()],
        "reasons": [session["reason"] for session in sessions.values()],
        "started": [session["started_at"] for session in sessions.values()],
        "run_id": run_id,
    }
    conn.execute(SAVE_SQL, parameters)


# SQL (used by save_connection_tags): the same for client connections: 5 lists (connection IDs, session IDs, tags, reasons, start times) saved at once, stamped with this run's ID.
SAVE_CONNECTIONS_SQL = """
UPSERT INTO connection_tags (connection_id, session_id, tag, reason, started_at, run_id)
SELECT connection_id, session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(sessions)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(connection_id, session_id, tag, reason, started_at)
"""


def save_connection_tags(conn, connections, run_id):         # Saves a batch of client connections to connection_tags in one call. Called by tag_new_sessions
    parameters = {
        "ids": list(connections.keys()),
        "sessions": [connection["session_id"] for connection in connections.values()],
        "tags": [connection["tag"] for connection in connections.values()],
        "reasons": [connection["reason"] for connection in connections.values()],
        "started": [connection["started_at"] for connection in connections.values()],
        "run_id": run_id,
    }
    conn.execute(SAVE_CONNECTIONS_SQL, parameters)


# SQL (used by finish_run): close this run in the run history: finish time, ok/failed, how many sessions it saved, and the error if any.
FINISH_RUN_SQL = """
UPDATE pipeline_runs
SET finished_at = now(),
    status = %(status)s,
    sessions_tagged = (SELECT count(*) FROM session_tags WHERE run_id = %(run_id)s),
    error = %(error)s
WHERE run_id = %(run_id)s
"""


def finish_run(conn, run_id, status, error=None):            # Marks the run ok or failed, with its count and error. Called by run_one_round
    parameters = {
        "run_id": run_id,
        "status": status,
        "error": error,
    }
    conn.execute(FINISH_RUN_SQL, parameters)
