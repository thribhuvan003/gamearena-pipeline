-- Work out every ended session's tag, reason and start time again in plain SQL and compare them with what the pipeline saved (tags_wrong, reasons_wrong and dates_wrong must be 0; not_tagged_yet is 0 after a full run).
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
expected AS (
    SELECT s.session_id,
           min(e.recorded_at) AS started_at,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.attempt') THEN 'failed'
               ELSE 'no_attempt'
           END AS tag,
           bool_or(e.payload->>'event' = 'webrtc.connection.state' AND e.payload->>'state' = 'failed') AS video_failed,
           bool_or(coalesce(e.payload->>'event', e.event_type::STRING) = 'host_connected') AS host_joined,
           bool_or(coalesce(e.payload->>'event', e.event_type::STRING) = 'client_connected') AS client_joined
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
    ORDER BY e.session_id, e.recorded_at DESC
),
expected_reason AS (
    SELECT x.session_id,
           CASE
               WHEN x.tag <> 'failed' THEN NULL
               WHEN l.phase = 'pre-connect' THEN 'setup_error'
               WHEN l.phase = 'connecting' THEN 'error_while_connecting'
               WHEN l.phase IS NOT NULL THEN 'error_other'
               WHEN x.video_failed THEN 'video_connection_failed'
               WHEN NOT (x.host_joined AND x.client_joined) THEN 'someone_never_joined'
               ELSE 'no_video'
           END AS reason
    FROM expected x
    LEFT JOIN last_error l USING (session_id)
)
SELECT
    (SELECT count(*) FROM ended) AS ended_sessions,
    (SELECT count(*) FROM session_tags) AS tagged,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.session_id IS NULL) AS not_tagged_yet,
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE t.tag <> x.tag) AS tags_wrong,
    (SELECT count(*) FROM expected_reason r JOIN session_tags t USING (session_id) WHERE t.reason IS DISTINCT FROM r.reason) AS reasons_wrong,
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE t.started_at IS DISTINCT FROM x.started_at) AS dates_wrong;

-- How many sessions have each tag.
SELECT tag, count(*) FROM session_tags GROUP BY tag ORDER BY 2 DESC;

-- Work out every client connection's tag, reason and start time again in plain SQL and compare them with connection_tags (tags_wrong, reasons_wrong and dates_wrong must be 0; not_tagged_yet is 0 after a full run).
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
connections AS (
    SELECT e.connection_id,
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
    GROUP BY e.connection_id
),
last_error AS (
    SELECT DISTINCT ON (e.connection_id) e.connection_id, e.payload->>'phase' AS phase
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.payload->>'event' = 'pipeline.connect.failure'
      AND e.connection_role = 'client'
      AND e.connection_id IS NOT NULL
      AND e.recorded_at <= s.ended_at
    ORDER BY e.connection_id, e.recorded_at DESC
),
expected AS (
    SELECT c.connection_id,
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
       count(*) FILTER (WHERE t.tag <> x.tag) AS tags_wrong,
       count(*) FILTER (WHERE t.connection_id IS NOT NULL AND t.reason IS DISTINCT FROM x.reason) AS reasons_wrong,
       count(*) FILTER (WHERE t.started_at <> x.started_at) AS dates_wrong
FROM expected x
LEFT JOIN connection_tags t USING (connection_id);

-- How many client connections have each tag.
SELECT tag, count(*) FROM connection_tags GROUP BY tag ORDER BY 2 DESC;
