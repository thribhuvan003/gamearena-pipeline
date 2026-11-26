# read.py: asks the database for the next batch of sessions to tag, and their client connections. It only reads, never changes anything.

# Read the next batch of untagged ended sessions.
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
       min(e.recorded_at) AS started_at,
       array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at, e.id) AS event_names,
       array_agg(e.payload->>'phase' ORDER BY e.recorded_at, e.id) AS phases,
       array_agg(e.payload->>'state' ORDER BY e.recorded_at, e.id) AS states
FROM session_telemetry_events e
JOIN batch b ON b.session_id = e.session_id
WHERE e.recorded_at <= b.ended_at
GROUP BY e.session_id
"""


def read_sessions(conn, limit):                              # Reads the next batch of ended, untagged sessions with their events
    with conn.cursor() as cursor:
        cursor.execute(EVENTS_SQL, {"limit": limit})
        rows = cursor.fetchall()

    sessions = {}
    for session_id, started_at, event_names, phases, states in rows:
        sessions[session_id] = {
            "started_at": started_at,
            "event_names": event_names,
            "phases": phases,
            "states": states,
        }
    return sessions


# Read client connections for the selected sessions.
CONNECTIONS_SQL = """
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
      AND session_id = ANY(%(ids)s::UUID[])
    GROUP BY session_id
)
SELECT e.connection_id,
       e.session_id,
       min(e.recorded_at) AS started_at,
       count(*) FILTER (WHERE e.source <> 'system') AS app_events,
       array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at, e.id) AS event_names,
       array_agg(e.payload->>'phase' ORDER BY e.recorded_at, e.id) AS phases,
       array_agg(e.payload->>'state' ORDER BY e.recorded_at, e.id) AS states
FROM session_telemetry_events e
JOIN ended d ON d.session_id = e.session_id
WHERE e.connection_role = 'client'
  AND e.connection_id IS NOT NULL
  AND e.recorded_at <= d.ended_at
GROUP BY e.connection_id, e.session_id
"""


def read_connections(conn, session_ids):                     # Reads the client connections of those sessions with their events
    with conn.cursor() as cursor:
        cursor.execute(CONNECTIONS_SQL, {"ids": session_ids})
        rows = cursor.fetchall()

    connections = {}
    for connection_id, session_id, started_at, app_events, event_names, phases, states in rows:
        connections[connection_id] = {
            "session_id": session_id,
            "started_at": started_at,
            "app_events": app_events,
            "event_names": event_names,
            "phases": phases,
            "states": states,
        }
    return connections
