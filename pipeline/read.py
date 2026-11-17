# read.py: asks the database for the next batch of sessions to tag. It only reads, never changes anything.

EVENTS_SQL = """
WITH batch AS (                                              -- first, make a small list called "batch"
    SELECT DISTINCT e.session_id                             -- of session IDs, each one only once
    FROM session_telemetry_events e                          -- from the events table, nicknamed e
    WHERE e.event_type = 'session_ended'                     -- only sessions that have ended (their result is final)
      AND NOT EXISTS (                                       -- and skip any session that...
          SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id   -- ...already has a row in session_tags
      )
    ORDER BY e.session_id                                    -- in a fixed order, so it is predictable
    LIMIT %(limit)s                                          -- only the first N (Python fills in the batch size)
)
SELECT session_id,                                           -- for each session in the batch...
       array_agg(coalesce(payload->>'event', event_type::STRING) ORDER BY recorded_at) AS event_names   -- ...all its event names in one list, in time order
FROM session_telemetry_events                                -- from the events table
WHERE session_id IN (SELECT session_id FROM batch)           -- only the sessions chosen above
GROUP BY session_id                                          -- one row per session
"""


def read_sessions(conn, limit):                              # conn = open database connection, limit = batch size (200)

    if limit <= 0:                                           # a batch size of 0 or less makes no sense
        raise ValueError("Batch size must be positive")      # so stop with a clear error

    with conn.cursor() as cursor:                            # a cursor sends one question and holds the answer; closes itself after
        cursor.execute(EVENTS_SQL, {"limit": limit})         # send the SQL above, filling the blank with the batch size
        rows = cursor.fetchall()                             # all answer rows: [(session_id, [event_names]), ...]

    return dict(rows)                                        # turn the rows into {session_id: [event_names]} and hand it back
