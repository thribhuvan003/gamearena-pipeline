# read.py: reads the events of given sessions and of their client connections, for tagging. It only reads, never changes anything.

from pipeline import config

# Each given session that sent session_ended, with its events up to that end (by the session index, never the whole table).
EVENTS_SQL = f"""
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM {config.EVENTS_TABLE}
    WHERE session_id = ANY(%(ids)s::UUID[])
      AND event_type = 'session_ended'
    GROUP BY session_id
)
SELECT e.session_id,
       min(e.recorded_at) AS started_at,
       array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at, e.id) AS event_names,
       array_agg(e.payload->>'phase' ORDER BY e.recorded_at, e.id) AS phases,
       array_agg(e.payload->>'state' ORDER BY e.recorded_at, e.id) AS states
FROM {config.EVENTS_TABLE} e
JOIN ended d ON d.session_id = e.session_id
WHERE e.recorded_at <= d.ended_at
GROUP BY e.session_id
"""


def read_sessions(conn, session_ids):                        # The ended ones among these sessions, with their events up to the end
    with conn.cursor() as cursor:
        cursor.execute(EVENTS_SQL, {"ids": session_ids})
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


# The client connections of these ended sessions: their events up to the end, two milestones from all their events,
# and the app's own record of the client (only the labels are kept, never the user agent).
CONNECTIONS_SQL = f"""
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM {config.EVENTS_TABLE}
    WHERE session_id = ANY(%(ids)s::UUID[])
      AND event_type = 'session_ended'
    GROUP BY session_id
),
clients AS (
    SELECT e.connection_id,
           e.session_id,
           min(e.recorded_at) AS started_at,
           count(*) FILTER (WHERE e.source <> 'system') AS app_events,
           min(e.recorded_at) FILTER (WHERE coalesce(e.payload->>'event', e.event_type::STRING) = 'pipeline.connect.success') AS connected_at,
           array_agg(coalesce(e.payload->>'event', e.event_type::STRING) ORDER BY e.recorded_at, e.id) AS event_names,
           array_agg(e.payload->>'phase' ORDER BY e.recorded_at, e.id) AS phases,
           array_agg(e.payload->>'state' ORDER BY e.recorded_at, e.id) AS states
    FROM {config.EVENTS_TABLE} e
    JOIN ended d ON d.session_id = e.session_id
    WHERE e.connection_role = 'client'
      AND e.connection_id IS NOT NULL
      AND e.recorded_at <= d.ended_at
    GROUP BY e.connection_id, e.session_id
),
milestones AS (
    SELECT connection_id,
           bool_or(coalesce(payload->>'event', event_type::STRING) = 'ice.gathering.complete') AS gathered,
           bool_or(coalesce(payload->>'event', event_type::STRING) = 'media.first_decode') AS decoded,
           CASE WHEN bool_or(level = 'error' AND coalesce(payload->>'event', event_type::STRING) <> 'ice.candidate.error') THEN 'error'
                WHEN bool_or(coalesce(payload->>'event', event_type::STRING) = 'ice.candidate.error') THEN 'ice_warning'
                WHEN bool_or(level = 'warn') THEN 'warning'
                ELSE 'nothing' END AS logged
    FROM {config.EVENTS_TABLE}
    WHERE session_id = ANY(%(ids)s::UUID[])
      AND connection_id IS NOT NULL
    GROUP BY connection_id
)
SELECT c.connection_id, c.session_id, c.started_at, c.app_events, c.connected_at, c.event_names, c.phases, c.states,
       coalesce(m.gathered, false), coalesce(m.decoded, false), coalesce(m.logged, 'nothing'),
       x.id IS NOT NULL AS in_app, x.user_agent, x.auth_type::STRING
FROM clients c
LEFT JOIN milestones m ON m.connection_id = c.connection_id
LEFT JOIN {config.CLIENTS_TABLE} x ON x.id = c.connection_id
"""


def read_connections(conn, session_ids):                     # The client connections of those sessions, with their events and app record
    with conn.cursor() as cursor:
        cursor.execute(CONNECTIONS_SQL, {"ids": session_ids})
        rows = cursor.fetchall()

    connections = {}
    for (connection_id, session_id, started_at, app_events, connected_at, event_names, phases, states,
         gathered, decoded, logged, in_app, user_agent, access) in rows:
        connections[connection_id] = {
            "session_id": session_id,
            "started_at": started_at,
            "app_events": app_events,
            "connected_at": connected_at,
            "event_names": event_names,
            "phases": phases,
            "states": states,
            "gathered": gathered,
            "decoded": decoded,
            "logged": logged,
            "in_app": in_app,
            "user_agent": user_agent,
            "access": access,
        }
    return connections
