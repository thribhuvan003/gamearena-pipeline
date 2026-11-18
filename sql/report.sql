-- 1. Overall: how many sessions, how many connected, how many didn't, and the % that connected.
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag <> 'connected') AS did_not_connect,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags;

-- 2. Per day: is it getting better or worse? Sessions, connected, didn't connect, and the % that connected.
SELECT started_at::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag <> 'connected') AS did_not_connect,
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

-- 4. Which problem caused each bad day: failed sessions per day, split by reason (only days with failures).
SELECT started_at::DATE AS day,
       count(*) AS failed,
       count(*) FILTER (WHERE reason = 'setup_error') AS setup_error,
       count(*) FILTER (WHERE reason = 'no_video') AS no_video,
       count(*) FILTER (WHERE reason = 'video_connection_failed') AS video_failed,
       count(*) FILTER (WHERE reason = 'someone_never_joined') AS never_joined,
       count(*) FILTER (WHERE reason IN ('error_while_connecting', 'error_other')) AS other_error
FROM session_tags
WHERE tag = 'failed'
GROUP BY day
ORDER BY day;

-- 5. What exactly went wrong: the app's own error (code, stage, error text) behind each reason, counted in sessions, using only errors before the session ended.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
)
SELECT t.reason,
       e.payload->>'code' AS code,
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
GROUP BY 1, 2, 3, 4
ORDER BY sessions DESC;

-- 6. Pipeline health: sessions in the raw data, how many never ended, how many are tagged or still waiting, and how long the last run took.
WITH sessions AS (
    SELECT session_id, bool_or(event_type = 'session_ended') AS ended
    FROM session_telemetry_events
    GROUP BY session_id
),
last_run AS (
    SELECT status, sessions_tagged, finished_at - started_at AS duration
    FROM pipeline_runs
    ORDER BY started_at DESC
    LIMIT 1
)
SELECT count(*) AS all_sessions,
       count(*) FILTER (WHERE NOT ended) AS never_ended,
       count(*) FILTER (WHERE t.session_id IS NOT NULL) AS tagged,
       count(*) FILTER (WHERE ended AND t.session_id IS NULL) AS waiting,
       (SELECT status FROM last_run) AS last_run_status,
       (SELECT sessions_tagged FROM last_run) AS last_run_sessions,
       (SELECT duration FROM last_run) AS last_run_took
FROM sessions
LEFT JOIN session_tags t USING (session_id);
