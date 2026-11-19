-- report.sql (just report): the founder reports. Sessions first (did the player get in, and why not), then client connections (retries and drops inside a session). Days are the session's start day in UTC.

-- 1. Overall: sessions, connected, failed (tried but never connected), no_attempt (never tried), and the % that connected.
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM session_tags;

-- 2. Per day: is it getting better or worse? The same columns, one row per day.
SELECT started_at::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags
GROUP BY day
ORDER BY day;

-- 3. What to fix first: each failure reason, how many sessions, and its % of the failed sessions.
SELECT reason,
       count(*) AS sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
FROM session_tags
WHERE tag = 'failed'
GROUP BY reason
ORDER BY sessions DESC;

-- 4. Which problem caused each bad day: failed sessions per day split by reason (only days with failures).
SELECT started_at::DATE AS day,
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

-- 5. What exactly went wrong: the app's own error (the LAST one before the end, the one that decided the reason) for each failed session, grouped; error_id is a short name for each distinct error.
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
       min(l.recorded_at)::DATE AS first_seen,
       max(l.recorded_at)::DATE AS last_seen
FROM last_error l
JOIN session_tags t USING (session_id)
WHERE t.tag = 'failed'
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY sessions DESC;

-- 6. Client connections: how many got video, and of those that didn't, how many were retries before the player got in, drops after the player was already in, or in sessions that never connected. unknown = the app sent nothing on it, so not counted as a failure.
WITH first_ok AS (
    SELECT session_id, min(started_at) AS first_ok_at
    FROM connection_tags
    WHERE tag = 'connected'
    GROUP BY session_id
)
SELECT count(*) AS client_connections,
       count(*) FILTER (WHERE c.tag = 'connected') AS connected,
       count(*) FILTER (WHERE c.tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE c.tag = 'unknown') AS unknown,
       count(*) FILTER (WHERE c.tag = 'not_connected' AND c.started_at < f.first_ok_at) AS retried_before_success,
       count(*) FILTER (WHERE c.tag = 'not_connected' AND c.started_at >= f.first_ok_at) AS dropped_after_success,
       count(*) FILTER (WHERE c.tag = 'not_connected' AND f.session_id IS NULL) AS in_session_never_connected,
       count(DISTINCT c.session_id) FILTER (WHERE c.tag = 'not_connected' AND c.started_at >= f.first_ok_at) AS sessions_with_a_drop
FROM connection_tags c
LEFT JOIN first_ok f USING (session_id);

-- 7. Why client connections didn't connect, split the same way as report 6.
WITH first_ok AS (
    SELECT session_id, min(started_at) AS first_ok_at
    FROM connection_tags
    WHERE tag = 'connected'
    GROUP BY session_id
)
SELECT c.reason,
       count(*) AS not_connected,
       count(*) FILTER (WHERE c.started_at < f.first_ok_at) AS retried_before_success,
       count(*) FILTER (WHERE c.started_at >= f.first_ok_at) AS dropped_after_success,
       count(*) FILTER (WHERE f.session_id IS NULL) AS in_session_never_connected
FROM connection_tags c
LEFT JOIN first_ok f USING (session_id)
WHERE c.tag = 'not_connected'
GROUP BY c.reason
ORDER BY not_connected DESC;
