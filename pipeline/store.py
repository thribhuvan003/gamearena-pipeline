# store.py: saves the tags. One database call per batch, however many sessions it has.

SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, reason, run_id)   -- insert each row, or replace it if that session is already there
SELECT session_id, tag, reason, %(run_id)s::UUID             -- the session, its tag, its reason, and the run that tagged it
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[], %(reasons)s::STRING[]) AS t(session_id, tag, reason)   -- 3 lists -> rows: (id1, tag1, reason1)...
"""


def save_tags(conn, results, run_id):                        # results = {session_id: {"tag": ..., "reason": ...}} for one batch
    if not results:                                          # nothing to save?
        return                                               # then do nothing

    parameters = {                                           # fill the 4 blanks in the SQL:
        "ids": list(results.keys()),                         # all the session IDs, as a list
        "tags": [result["tag"] for result in results.values()],         # their tags, in the same order
        "reasons": [result["reason"] for result in results.values()],   # their reasons (None if not failed), same order
        "run_id": run_id,                                    # the same run ID for every row in this batch
    }

    with conn.cursor() as cursor:                            # open a cursor (closes itself after)
        cursor.execute(SAVE_SQL, parameters)                 # save the whole batch in one call


START_RUN_SQL = """
INSERT INTO pipeline_runs (status)                           -- add one new row to the job diary, setting only its status
VALUES ('running')                                           -- the status is 'running' (= picked up, working now)
RETURNING run_id                                             -- give back the new row's ID (made up by the database)
"""


def start_run(conn):                                         # write "a run has started" in the job diary
    return conn.execute(START_RUN_SQL).fetchone()[0]         # run the SQL, take the first row's first value = the run_id


FINISH_RUN_SQL = """
UPDATE pipeline_runs                                         -- change an existing row in the job diary
SET finished_at = now(),                                     -- the finish time = right now
    status = %(status)s,                                     -- 'ok' or 'failed'
    sessions_tagged = (SELECT count(*) FROM session_tags WHERE run_id = %(run_id)s),   -- count what this run really saved
    error = %(error)s                                        -- what went wrong (empty if it went fine)
WHERE run_id = %(run_id)s                                    -- only the row of THIS run
"""


def finish_run(conn, run_id, status, error=None):            # write "the run has ended" in the job diary
    parameters = {                                           # fill the 3 blanks in the SQL:
        "run_id": run_id,                                    # which row (the ID start_run gave back)
        "status": status,                                    # 'ok' or 'failed'
        "error": error,                                      # the error text, or None
    }
    conn.execute(FINISH_RUN_SQL, parameters)                 # run the SQL
