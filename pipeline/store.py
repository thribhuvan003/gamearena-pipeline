# store.py: writes to our 3 tables: the run history (pipeline_runs), the session tags (session_tags) and the client connection tags (connection_tags).

# SQL: add a new run to the run history with status 'running', and give back its ID.
START_RUN_SQL = """
INSERT INTO pipeline_runs (status)
VALUES ('running')
RETURNING run_id
"""


def start_run(conn):                                         # stores a new 'running' row in pipeline_runs and returns its run_id. Called by run_one_round at the start of a round
    return conn.execute(START_RUN_SQL).fetchone()[0]


# SQL: turn the 4 lists (IDs, tags, reasons, start times) into rows and save them all at once, stamped with this run's ID.
SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, reason, started_at, run_id)
SELECT session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(session_id, tag, reason, started_at)
"""


def save_tags(conn, results, run_id):                        # stores one batch of tags, reasons and start times in session_tags, stamped with run_id, in one call. Called by tag_new_sessions once per batch
    if not results:
        return

    parameters = {
        "ids": list(results.keys()),
        "tags": [result["tag"] for result in results.values()],
        "reasons": [result["reason"] for result in results.values()],
        "started": [result["started_at"] for result in results.values()],
        "run_id": run_id,
    }

    with conn.cursor() as cursor:
        cursor.execute(SAVE_SQL, parameters)


# SQL: the same for client connections: 5 lists (connection IDs, session IDs, tags, reasons, start times) saved at once, stamped with this run's ID.
SAVE_CONNECTIONS_SQL = """
UPSERT INTO connection_tags (connection_id, session_id, tag, reason, started_at, run_id)
SELECT connection_id, session_id, tag, reason, started_at, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(sessions)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[], %(started)s::TIMESTAMPTZ[])
     AS t(connection_id, session_id, tag, reason, started_at)
"""


def save_connection_tags(conn, results, run_id):             # stores one batch of client connection tags in connection_tags, stamped with run_id, in one call. Called by tag_new_sessions once per batch
    if not results:
        return

    parameters = {
        "ids": list(results.keys()),
        "sessions": [result["session_id"] for result in results.values()],
        "tags": [result["tag"] for result in results.values()],
        "reasons": [result["reason"] for result in results.values()],
        "started": [result["started_at"] for result in results.values()],
        "run_id": run_id,
    }

    with conn.cursor() as cursor:
        cursor.execute(SAVE_CONNECTIONS_SQL, parameters)


# SQL: close this run in the run history: finish time, ok/failed, how many sessions it saved, and the error if any.
FINISH_RUN_SQL = """
UPDATE pipeline_runs
SET finished_at = now(),
    status = %(status)s,
    sessions_tagged = (SELECT count(*) FROM session_tags WHERE run_id = %(run_id)s),
    error = %(error)s
WHERE run_id = %(run_id)s
"""


def finish_run(conn, run_id, status, error=None):            # stores the end of the run in its pipeline_runs row: finish time, ok or failed, how many, the error. Called by run_one_round when the round ends or breaks
    parameters = {
        "run_id": run_id,
        "status": status,
        "error": error,
    }
    conn.execute(FINISH_RUN_SQL, parameters)
