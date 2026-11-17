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
SELECT session_id,
       array_agg(payload->>'event' ORDER BY recorded_at) AS steps
FROM session_telemetry_events
WHERE session_id IN (SELECT session_id FROM batch)
GROUP BY session_id
"""


def read_sessions(conn, limit):

    if limit <= 0:
        raise ValueError("Batch size must be positive")

    with conn.cursor() as cursor:
        cursor.execute(EVENTS_SQL, {"limit": limit})
        rows = cursor.fetchall()

    return dict(rows)
