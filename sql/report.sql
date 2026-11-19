-- report.sql (just report): analytics. Reports 1-5 are sessions (did the player get in, and why not); 6-8 are client connections (one session can have several). Days are the session's start day in UTC.

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

-- 6. Connection summary: all client connections, how many recorded a success, how many had app events but no success (not_connected), how many had no app events (unknown), and the % connected.
SELECT count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM connection_tags;

-- 7. Daily connection summary: the same, per day (the day the connection started, UTC).
SELECT started_at::DATE AS day,
       count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM connection_tags
GROUP BY day
ORDER BY day;

-- 8. Connection failure reasons: why not_connected connections had no success, how many sessions they were in, and how many of them were in sessions that still connected overall (the failures a session-level view hides).
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
