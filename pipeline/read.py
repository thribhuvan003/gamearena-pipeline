EVENTS_SQL = """
WITH batch AS (
    SELECT DISTINCT e.session_id
    FROM session_telemetry_events e
    WHERE e.event_type = 'session_ended'
      AND NOT EXISTS (
          SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id
      )
    ORDER BY e.session_id
    LIMIT %(limit)s
)
SELECT session_id, recorded_at, event_type,
       payload->>'event' AS step
FROM session_telemetry_events
WHERE session_id IN (SELECT session_id FROM batch)
ORDER BY session_id, recorded_at
"""


def read_sessions(conn, limit):

    if limit <= 0:
        raise ValueError("Batch size must be positive")

    with conn.cursor() as cursor:
        parameters = {"limit": limit}

        cursor.execute(EVENTS_SQL, parameters)

        rows = cursor.fetchall()

    sessions = {}

    for session_id, recorded_at, event_type, step in rows:

        if session_id not in sessions:
            sessions[session_id] = []

        event = (recorded_at, event_type, step)

        sessions[session_id].append(event)

    return sessions
