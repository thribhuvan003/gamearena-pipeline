# store.py: writes to our 2 tables: the run history (pipeline_runs) and the tags (session_tags).

# SQL: add a new run to the run history with status 'running', and give back its ID.
START_RUN_SQL = """
INSERT INTO pipeline_runs (status)
VALUES ('running')
RETURNING run_id
"""


def start_run(conn):                                         # write "a run has started" in the run history and return its run_id
    return conn.execute(START_RUN_SQL).fetchone()[0]


# SQL: turn the 3 lists (IDs, tags, reasons) into rows and save them all at once, stamped with this run's ID.
SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, reason, run_id)
SELECT session_id, tag, reason, %(run_id)s::UUID
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[]) AS t(session_id, tag, reason)
"""


def save_tags(conn, results, run_id):                        # save one batch of {session_id: {"tag": ..., "reason": ...}} in one database call
    if not results:
        return

    parameters = {
        "ids": list(results.keys()),
        "tags": [result["tag"] for result in results.values()],
        "reasons": [result["reason"] for result in results.values()],
        "run_id": run_id,
    }

    with conn.cursor() as cursor:
        cursor.execute(SAVE_SQL, parameters)


# SQL: close this run in the run history: finish time, ok/failed, how many sessions it saved, and the error if any.
FINISH_RUN_SQL = """
UPDATE pipeline_runs
SET finished_at = now(),
    status = %(status)s,
    sessions_tagged = (SELECT count(*) FROM session_tags WHERE run_id = %(run_id)s),
    error = %(error)s
WHERE run_id = %(run_id)s
"""


def finish_run(conn, run_id, status, error=None):            # write "the run has ended" (ok or failed) in the run history
    parameters = {
        "run_id": run_id,
        "status": status,
        "error": error,
    }
    conn.execute(FINISH_RUN_SQL, parameters)
