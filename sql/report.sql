-- 1. Overall: how many sessions, how many connected, failed (tried but never connected) or never tried, and the % that connected.
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags;

-- 2. Per day (the day each session started, in UTC): is it getting better or worse? Sessions, connected, failed, never tried, and the % that connected.
SELECT started_at::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags
GROUP BY day
ORDER BY day;

-- 3. What to fix first: each failure reason, how many sessions, and its % of all failed sessions.
SELECT reason,
       count(*) AS sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
FROM session_tags
WHERE tag = 'failed'
GROUP BY reason
ORDER BY sessions DESC;

-- 4. Which problem caused each bad day: failed sessions per day (UTC), split by reason (only days with failures).
SELECT started_at::DATE AS day,
       count(*) AS failed,
       count(*) FILTER (WHERE reason = 'setup_error') AS setup_error,
       count(*) FILTER (WHERE reason = 'no_video') AS no_video,
       count(*) FILTER (WHERE reason = 'video_connection_failed') AS video_failed,
       count(*) FILTER (WHERE reason = 'someone_never_joined') AS never_joined,
       count(*) FILTER (WHERE reason = 'error_while_connecting') AS error_while_connecting,
       count(*) FILTER (WHERE reason = 'error_other') AS error_other
FROM session_tags
WHERE tag = 'failed'
GROUP BY day
ORDER BY day;

-- 5. What exactly went wrong: the app's own error (code, phase, stage, error text) behind each reason, counted in sessions, using only errors before the session ended.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
)
SELECT t.reason,
       e.payload->>'code' AS code,
       e.payload->>'phase' AS phase,
       e.payload->>'stage' AS stage,
       e.payload->>'reason' AS error_text,
       count(DISTINCT e.session_id) AS sessions,
       min(e.recorded_at)::DATE AS first_seen,
       max(e.recorded_at)::DATE AS last_seen
FROM session_telemetry_events e
JOIN ended d ON d.session_id = e.session_id
JOIN session_tags t ON t.session_id = e.session_id
WHERE e.payload->>'event' = 'pipeline.connect.failure'
  AND e.recorded_at <= d.ended_at
  AND t.tag = 'failed'
GROUP BY 1, 2, 3, 4, 5
ORDER BY sessions DESC;

-- 6. Pipeline health: sessions in the raw data, how many have no end event, how many are tagged or still waiting, and how long and how fast the last run was.
WITH sessions AS (
    SELECT session_id, bool_or(event_type = 'session_ended') AS ended
    FROM session_telemetry_events
    GROUP BY session_id
),
last_run AS (
    SELECT status, sessions_tagged, finished_at - started_at AS duration,
           round(sessions_tagged / nullif(extract(epoch FROM finished_at - started_at), 0)) AS sessions_per_second
    FROM pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
)
SELECT count(*) AS all_sessions,
       count(*) FILTER (WHERE NOT ended) AS no_end_event,
       count(*) FILTER (WHERE t.session_id IS NOT NULL) AS tagged,
       count(*) FILTER (WHERE ended AND t.session_id IS NULL) AS waiting,
       (SELECT status FROM last_run) AS last_run_status,
       (SELECT sessions_tagged FROM last_run) AS last_run_sessions,
       (SELECT duration FROM last_run) AS last_run_took,
       (SELECT sessions_per_second FROM last_run) AS sessions_per_second
FROM sessions
LEFT JOIN session_tags t USING (session_id);
