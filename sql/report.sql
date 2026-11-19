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

-- 6. Client connections that didn't connect, one row per kind (each connection gets exactly one kind, so the rows add up to not_connected): in a session that never connected; a retry before the player got in; a reconnect after the earlier connection lost its video/network link (the real drops); a reconnect after a clean end (not a proven drop); opened while an earlier one was still working (not a drop). Columns split each kind by reason.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
life AS (
    SELECT e.connection_id,
           coalesce(min(e.recorded_at) FILTER (WHERE e.event_type = 'client_disconnected'), max(e.recorded_at)) AS ended_at,
           bool_or(e.payload->>'event' = 'pipeline.connection.dropped'
                   OR (e.payload->>'event' IN ('webrtc.connection.state', 'ice.connection.state')
                       AND e.payload->>'state' IN ('disconnected', 'failed'))) AS link_lost
    FROM session_telemetry_events e
    JOIN ended d ON d.session_id = e.session_id
    WHERE e.connection_role = 'client'
      AND e.connection_id IS NOT NULL
      AND e.recorded_at <= d.ended_at
    GROUP BY e.connection_id
),
not_connected AS (
    SELECT DISTINCT ON (c.connection_id)
           c.connection_id, c.session_id, c.reason, c.started_at,
           p.connection_id AS previous_ok,
           EXISTS (SELECT 1 FROM connection_tags o WHERE o.session_id = c.session_id AND o.tag = 'connected') AS session_connected
    FROM connection_tags c
    LEFT JOIN connection_tags p ON p.session_id = c.session_id AND p.tag = 'connected' AND p.started_at <= c.started_at
    WHERE c.tag = 'not_connected'
    ORDER BY c.connection_id, p.started_at DESC
),
kinds AS (
    SELECT n.session_id,
           n.reason,
           CASE
               WHEN NOT n.session_connected THEN 'in_session_never_connected'
               WHEN n.previous_ok IS NULL THEN 'retried_before_success'
               WHEN l.ended_at > n.started_at THEN 'opened_while_still_connected'
               WHEN l.link_lost THEN 'reconnect_after_link_lost'
               ELSE 'reconnect_after_clean_end'
           END AS kind
    FROM not_connected n
    LEFT JOIN life l ON l.connection_id = n.previous_ok
)
SELECT kind,
       count(*) AS connections,
       count(DISTINCT session_id) AS sessions,
       count(*) FILTER (WHERE reason = 'no_video') AS no_video,
       count(*) FILTER (WHERE reason = 'video_connection_failed') AS video_connection_failed,
       count(*) FILTER (WHERE reason IN ('setup_error', 'error_while_connecting', 'error_other')) AS error_logged
FROM kinds
GROUP BY kind
ORDER BY connections DESC;
