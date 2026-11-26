-- check.sql (just check): recomputes every tag, reason and time in plain SQL and compares with the pipeline. Every *_wrong must be 0.

-- Check 1, sessions: the tags.py rules in SQL vs session_tags. no_end_event = never sent session_ended, so not tagged.
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
           bool_or(e.payload->>'event' = 'ice.connection.state' AND e.payload->>'state' = 'failed') AS network_failed,
           bool_or(e.payload->>'event' = 'media.decode.error') AS decode_error,
           bool_or(e.payload->>'event' = 'pipeline.connection.dropped') AS dropped,
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
               WHEN x.network_failed THEN 'network_connection_failed'
               WHEN x.decode_error THEN 'video_decode_error'
               WHEN x.dropped THEN 'connection_dropped'
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

-- Check 2, client connections: the tags.py rules in SQL vs connection_tags (sessions_wrong = saved under another session).
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
           min(e.recorded_at) FILTER (WHERE e.payload->>'event' = 'pipeline.connect.success') AS connected_at,
           bool_or(e.payload->>'event' = 'webrtc.connection.state' AND e.payload->>'state' = 'failed') AS video_failed,
           bool_or(e.payload->>'event' = 'ice.connection.state' AND e.payload->>'state' = 'failed') AS network_failed,
           bool_or(e.payload->>'event' = 'media.decode.error') AS decode_error,
           bool_or(e.payload->>'event' = 'pipeline.connection.dropped') AS dropped
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
           c.connected_at,
           c.tag,
           CASE
               WHEN c.tag <> 'not_connected' THEN NULL
               WHEN l.phase = 'pre-connect' THEN 'setup_error'
               WHEN l.phase = 'connecting' THEN 'error_while_connecting'
               WHEN l.phase IS NOT NULL THEN 'error_other'
               WHEN c.video_failed THEN 'video_connection_failed'
               WHEN c.network_failed THEN 'network_connection_failed'
               WHEN c.decode_error THEN 'video_decode_error'
               WHEN c.dropped THEN 'connection_dropped'
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
       count(*) FILTER (WHERE t.started_at <> x.started_at) AS dates_wrong,
       count(*) FILTER (WHERE t.connection_id IS NOT NULL AND t.connected_at IS DISTINCT FROM x.connected_at) AS connected_at_wrong
FROM expected x
LEFT JOIN connection_tags t USING (connection_id);

-- Check 3, facts: session_facts and error_events recounted from the raw events. sessions_missing is 0 after just facts.
WITH raw AS (
    SELECT session_id,
           count(*) AS events,
           bool_or(event_type = 'session_ended') AS has_end,
           count(*) FILTER (WHERE coalesce(payload->>'event', event_type::STRING) = 'pipeline.connect.attempt') AS attempts,
           count(*) FILTER (WHERE event_type = 'client_reconnected') AS reconnects,
           min(recorded_at) FILTER (WHERE coalesce(payload->>'event', event_type::STRING) = 'pipeline.connect.failure') AS first_failure,
           max(recorded_at) FILTER (WHERE coalesce(payload->>'event', event_type::STRING) = 'pipeline.connect.failure') AS last_failure,
           min(recorded_at) FILTER (WHERE coalesce(payload->>'event', event_type::STRING) = 'pipeline.connect.success') AS first_success,
           max(recorded_at) FILTER (WHERE coalesce(payload->>'event', event_type::STRING) = 'pipeline.connect.success') AS last_success,
           max(recorded_at) AS last_event_at,
           count(*) FILTER (WHERE level = 'error') AS errors
    FROM session_telemetry_events
    GROUP BY session_id
),
copied AS (
    SELECT session_id, count(*) AS errors FROM error_events GROUP BY session_id
)
SELECT count(*) AS sessions_with_events,
       count(*) FILTER (WHERE f.session_id IS NULL) AS sessions_missing,
       count(*) FILTER (WHERE f.events <> r.events OR f.has_end <> r.has_end OR f.attempts <> r.attempts OR f.reconnects <> r.reconnects) AS counts_wrong,
       count(*) FILTER (WHERE f.first_failure IS DISTINCT FROM r.first_failure OR f.last_failure IS DISTINCT FROM r.last_failure
                           OR f.first_success IS DISTINCT FROM r.first_success OR f.last_success IS DISTINCT FROM r.last_success
                           OR f.last_event_at <> r.last_event_at) AS times_wrong,
       count(*) FILTER (WHERE coalesce(c.errors, 0) <> r.errors) AS errors_wrong
FROM raw r
LEFT JOIN session_facts f USING (session_id)
LEFT JOIN copied c USING (session_id);
