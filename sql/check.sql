-- Work out every ended session's tag, reason and start time again in plain SQL and compare them with what the pipeline saved (tags_wrong_or_missing, reasons_wrong and dates_wrong must be 0).
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
    (SELECT count(*) FROM session_tags) AS tag_rows,
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE x.tag = t.tag) AS tags_matching,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.tag IS DISTINCT FROM x.tag) AS tags_wrong_or_missing,
    (SELECT count(*) FROM expected_reason r LEFT JOIN session_tags t USING (session_id) WHERE t.reason IS DISTINCT FROM r.reason) AS reasons_wrong,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.started_at IS DISTINCT FROM x.started_at) AS dates_wrong;

-- How many sessions have each tag.
SELECT tag, count(*) FROM session_tags GROUP BY tag ORDER BY 2 DESC;
