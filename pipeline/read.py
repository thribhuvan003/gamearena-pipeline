# read.py: asks the database for the next batch of sessions to tag. It only reads, never changes anything.

# SQL: pick up to N ended sessions that have no tag yet, and list each one's event names, phases and states in time order, up to the moment it ended.
EVENTS_SQL = """
WITH batch AS (
    SELECT e.session_id,
           min(e.recorded_at) AS ended_at
    FROM session_telemetry_events e
    WHERE e.event_type = 'session_ended'
      AND NOT EXISTS (
          SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id
      )
    GROUP BY e.session_id
    ORDER BY e.session_id
    LIMIT %(limit)s
)
SELECT e.session_id,
       array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at) AS event_names,
       array_agg(e.payload->>'phase' ORDER BY e.recorded_at) AS phases,
       array_agg(e.payload->>'state' ORDER BY e.recorded_at) AS states
FROM session_telemetry_events e
JOIN batch b ON b.session_id = e.session_id
WHERE e.recorded_at <= b.ended_at
GROUP BY e.session_id
"""


def read_sessions(conn, limit):                              # read the next batch: {session_id: {"event_names": [...], "phases": [...], "states": [...]}}

    if limit <= 0:
        raise ValueError("Batch size must be positive")

    with conn.cursor() as cursor:
        cursor.execute(EVENTS_SQL, {"limit": limit})
        rows = cursor.fetchall()

    sessions = {}
    for session_id, event_names, phases, states in rows:
        sessions[session_id] = {
            "event_names": event_names,
            "phases": phases,
            "states": states,
        }
    return sessions
