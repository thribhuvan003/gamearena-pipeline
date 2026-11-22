-- check.sql (just check): works out every tag, reason and start time again from the raw events in plain SQL and compares them with what the pipeline saved. Every *_wrong must be 0; not_tagged_yet is 0 after a full run.

-- Check 1, sessions: the same rules as tags.py tag_session / failure_reason, compared with session_tags. no_end_event = sessions that never sent session_ended, so they can't be tagged.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
sessions AS (
    SELECT s.session_id,
           min(e.recorded_at) AS started_at,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.attempt') THEN 'failed'
               ELSE 'no_attempt'
           END AS tag,
           bool_or(e.payload->>'event' = 'webrtc.connection.state' AND e.payload->>'state' = 'failed') AS video_failed,
           bool_or(e.event_type = 'host_connected') AS host_joined,
           bool_or(e.event_type = 'client_connected') AS client_joined
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.recorded_at <= s.ended_at
    GROUP BY s.session_id
),
last_error AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.payload->>'phase' AS phase
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.payload->>'event' = 'pipeline.connect.failure'
      AND e.recorded_at <= s.ended_at
    ORDER BY e.session_id, e.recorded_at DESC, e.id DESC
),
expected AS (
    SELECT x.session_id,
           x.started_at,
           x.tag,
           CASE
               WHEN x.tag <> 'failed' THEN NULL
               WHEN l.phase = 'pre-connect' THEN 'setup_error'
               WHEN l.phase = 'connecting' THEN 'error_while_connecting'
               WHEN l.phase IS NOT NULL THEN 'error_other'
               WHEN x.video_failed THEN 'video_connection_failed'
               WHEN NOT (x.host_joined AND x.client_joined) THEN 'someone_never_joined'
               ELSE 'no_video'
           END AS reason
    FROM sessions x
    LEFT JOIN last_error l USING (session_id)
)
SELECT count(*) AS ended_sessions,
       (SELECT count(DISTINCT session_id) FROM session_telemetry_events) - count(*) AS no_end_event,
       count(t.session_id) AS tagged,
       count(*) FILTER (WHERE t.session_id IS NULL) AS not_tagged_yet,
       count(*) FILTER (WHERE t.tag <> x.tag) AS tags_wrong,
       count(*) FILTER (WHERE t.session_id IS NOT NULL AND t.reason IS DISTINCT FROM x.reason) AS reasons_wrong,
       count(*) FILTER (WHERE t.session_id IS NOT NULL AND t.started_at IS DISTINCT FROM x.started_at) AS dates_wrong
FROM expected x
LEFT JOIN session_tags t USING (session_id);

-- Check 2, client connections: the same rules as tags.py tag_connection / connection_reason, compared with connection_tags; sessions_wrong = a connection saved under the wrong session.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
connections AS (
    SELECT e.connection_id,
           e.session_id,
           min(e.recorded_at) AS started_at,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'
               WHEN count(*) FILTER (WHERE e.source <> 'system') = 0 THEN 'unknown'
               ELSE 'not_connected'
           END AS tag,
           bool_or(e.payload->>'event' = 'webrtc.connection.state' AND e.payload->>'state' = 'failed') AS video_failed
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.connection_role = 'client'
      AND e.connection_id IS NOT NULL
      AND e.recorded_at <= s.ended_at
    GROUP BY e.connection_id, e.session_id
),
last_error AS (
    SELECT DISTINCT ON (e.connection_id) e.connection_id, e.payload->>'phase' AS phase
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.payload->>'event' = 'pipeline.connect.failure'
      AND e.connection_role = 'client'
      AND e.connection_id IS NOT NULL
      AND e.recorded_at <= s.ended_at
    ORDER BY e.connection_id, e.recorded_at DESC, e.id DESC
),
expected AS (
    SELECT c.connection_id,
           c.session_id,
           c.started_at,
           c.tag,
           CASE
               WHEN c.tag <> 'not_connected' THEN NULL
               WHEN l.phase = 'pre-connect' THEN 'setup_error'
               WHEN l.phase = 'connecting' THEN 'error_while_connecting'
               WHEN l.phase IS NOT NULL THEN 'error_other'
               WHEN c.video_failed THEN 'video_connection_failed'
               ELSE 'no_video'
           END AS reason
    FROM connections c
    LEFT JOIN last_error l USING (connection_id)
)
SELECT count(*) AS client_connections,
       count(t.connection_id) AS tagged,
       count(*) FILTER (WHERE t.connection_id IS NULL) AS not_tagged_yet,
       count(*) FILTER (WHERE t.session_id <> x.session_id) AS sessions_wrong,
       count(*) FILTER (WHERE t.tag <> x.tag) AS tags_wrong,
       count(*) FILTER (WHERE t.connection_id IS NOT NULL AND t.reason IS DISTINCT FROM x.reason) AS reasons_wrong,
       count(*) FILTER (WHERE t.started_at <> x.started_at) AS dates_wrong
FROM expected x
LEFT JOIN connection_tags t USING (connection_id);
