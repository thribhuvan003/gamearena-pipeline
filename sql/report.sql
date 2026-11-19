-- report.sql (just report): analytics. Reports 1-5 are sessions, 6-8 are client connections. Days are UTC.

-- 1. Session summary
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM session_tags;

-- 2. Daily session summary
SELECT (started_at AT TIME ZONE 'UTC')::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags
GROUP BY day
ORDER BY day;

-- 3. Session failure reasons
SELECT reason,
       count(*) AS sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
FROM session_tags
WHERE tag = 'failed'
GROUP BY reason
ORDER BY sessions DESC;

-- 4. Daily session failures
SELECT (started_at AT TIME ZONE 'UTC')::DATE AS day,
       count(*) FILTER (WHERE reason = 'setup_error') AS setup_error,
       count(*) FILTER (WHERE reason = 'no_video') AS no_video,
       count(*) FILTER (WHERE reason = 'video_connection_failed') AS video_connection_failed,
       count(*) FILTER (WHERE reason = 'someone_never_joined') AS someone_never_joined,
       count(*) FILTER (WHERE reason = 'error_while_connecting') AS error_while_connecting,
       count(*) FILTER (WHERE reason = 'error_other') AS error_other
FROM session_tags
WHERE tag = 'failed'
GROUP BY day
ORDER BY day;

-- 5. Application errors: the last recorded failure of each failed session
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
last_error AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.recorded_at, e.payload
    FROM session_telemetry_events e
    JOIN ended d ON d.session_id = e.session_id
    WHERE e.payload->>'event' = 'pipeline.connect.failure'
      AND e.recorded_at <= d.ended_at
    ORDER BY e.session_id, e.recorded_at DESC, e.id DESC
)
SELECT t.reason,
       left(md5(concat_ws('|', l.payload->>'code', l.payload->>'stage', l.payload->>'reason')), 6) AS error_id,
       l.payload->>'code' AS code,
       l.payload->>'phase' AS phase,
       l.payload->>'stage' AS stage,
       l.payload->>'reason' AS error_text,
       count(*) AS sessions,
       (min(l.recorded_at) AT TIME ZONE 'UTC')::DATE AS first_seen,
       (max(l.recorded_at) AT TIME ZONE 'UTC')::DATE AS last_seen
FROM last_error l
JOIN session_tags t USING (session_id)
WHERE t.tag = 'failed'
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY sessions DESC;

-- 6. Connection summary (connected_percent counts unknown connections in the total)
SELECT count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM connection_tags;

-- 7. Daily connection summary
SELECT (started_at AT TIME ZONE 'UTC')::DATE AS day,
       count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM connection_tags
GROUP BY day
ORDER BY day;

-- 8. Connection failure reasons
SELECT c.reason,
       count(*) AS connections,
       count(DISTINCT c.session_id) AS sessions,
       count(*) FILTER (WHERE s.tag = 'connected') AS in_connected_sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_not_connected
FROM connection_tags c
JOIN session_tags s USING (session_id)
WHERE c.tag = 'not_connected'
GROUP BY c.reason
ORDER BY connections DESC;
