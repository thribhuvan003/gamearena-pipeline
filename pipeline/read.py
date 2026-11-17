# read.py: asks the database for the next batch of sessions to tag. It only reads, never changes anything.

EVENTS_SQL = """
WITH batch AS (                                              -- first, make a small list called "batch"
    SELECT e.session_id,                                     -- of session IDs...
           min(e.recorded_at) AS ended_at                    -- ...each with the moment it first ended
    FROM session_telemetry_events e                          -- from the events table, nicknamed e
    WHERE e.event_type = 'session_ended'                     -- only sessions that have ended (their result is final)
      AND NOT EXISTS (                                       -- and skip any session that...
          SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id   -- ...already has a row in session_tags
      )
    GROUP BY e.session_id                                    -- one row per session (a session can end twice; min takes the first)
    ORDER BY e.session_id                                    -- in a fixed order, so it is predictable
    LIMIT %(limit)s                                          -- only the first N (Python fills in the batch size)
)
SELECT e.session_id,                                         -- for each session in the batch...
       array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at) AS event_names,   -- ...all its event names in one list, in time order
       array_agg(e.payload->>'phase' ORDER BY e.recorded_at) AS phases,   -- ...each event's phase (pre-connect, connecting...), same order
       array_agg(e.payload->>'state' ORDER BY e.recorded_at) AS states    -- ...each event's state (e.g. failed), same order
FROM session_telemetry_events e                              -- from the events table
JOIN batch b ON b.session_id = e.session_id                  -- only the sessions chosen above (and bring along their ended_at)
WHERE e.recorded_at <= b.ended_at                            -- only events up to the moment it ended (later ones are app retries)
GROUP BY e.session_id                                        -- one row per session
"""


def read_sessions(conn, limit):                              # conn = open database connection, limit = batch size (200)

    if limit <= 0:                                           # a batch size of 0 or less makes no sense
        raise ValueError("Batch size must be positive")      # so stop with a clear error

    with conn.cursor() as cursor:                            # a cursor sends one question and holds the answer; closes itself after
        cursor.execute(EVENTS_SQL, {"limit": limit})         # send the SQL above, filling the blank with the batch size
        rows = cursor.fetchall()                             # all answer rows: [(session_id, [names], [phases], [states]), ...]

    sessions = {}                                            # {session_id: its bundle}
    for session_id, event_names, phases, states in rows:     # each row = one session; the 3 lists line up (item 0 = first event)
        sessions[session_id] = {                             # one small bundle per session:
            "event_names": event_names,                      # its event names, in time order
            "phases": phases,                                # the phase of each of those events (or None)
            "states": states,                                # the state of each of those events (or None)
        }
    return sessions                                          # hand back {session_id: bundle}
