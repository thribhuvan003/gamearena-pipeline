# store.py: saves the tags. One database call per batch, however many sessions it has.

SAVE_SQL = """
UPSERT INTO session_tags (session_id, tag, run_id)           -- insert each row, or replace it if that session is already there
SELECT session_id, tag, %(run_id)s::UUID                     -- the session, its tag, and the run that tagged it
FROM unnest(%(ids)s::UUID[], %(tags)s::STRING[]) AS t(session_id, tag)   -- turn the 2 lists into rows: (id1, tag1), (id2, tag2)...
"""


def save_tags(conn, session_tags, run_id):                   # session_tags = {session_id: tag} for one batch; run_id = this run
    if not session_tags:                                     # nothing to save?
        return                                               # then do nothing

    parameters = {                                           # fill the 3 blanks in the SQL:
        "ids": list(session_tags.keys()),                    # all the session IDs, as a list
        "tags": list(session_tags.values()),                 # all their tags, in the same order
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
    sessions_tagged = %(sessions_tagged)s,                   -- how many sessions this run processed
    error = %(error)s                                        -- what went wrong (empty if it went fine)
WHERE run_id = %(run_id)s                                    -- only the row of THIS run
"""


def finish_run(conn, run_id, status, sessions_tagged, error=None):   # write "the run has ended" in the job diary
    parameters = {                                           # fill the 4 blanks in the SQL:
        "run_id": run_id,                                    # which row (the ID start_run gave back)
        "status": status,                                    # 'ok' or 'failed'
        "sessions_tagged": sessions_tagged,                  # how many sessions it tagged
        "error": error,                                      # the error text, or None
    }
    conn.execute(FINISH_RUN_SQL, parameters)                 # run the SQL
