-- 1. How many sessions have each tag, and what % of all tagged sessions that is.
SELECT tag,
       count(*) AS sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent
FROM session_tags
GROUP BY tag
ORDER BY sessions DESC;

-- 2. Why the failed sessions failed: each reason, how many, and what % of the failed sessions.
SELECT reason,
       count(*) AS sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
FROM session_tags
WHERE tag = 'failed'
GROUP BY reason
ORDER BY sessions DESC;

-- 3. Coverage: all sessions in the raw data, how many ended, how many never ended, and how many ended but are not tagged yet.
WITH sessions AS (
    SELECT session_id, bool_or(event_type = 'session_ended') AS ended
    FROM session_telemetry_events
    GROUP BY session_id
)
SELECT count(*) AS all_sessions,
       count(*) FILTER (WHERE ended) AS ended,
       count(*) FILTER (WHERE NOT ended) AS never_ended,
       count(*) FILTER (WHERE ended AND t.session_id IS NULL) AS waiting_to_be_tagged
FROM sessions
LEFT JOIN session_tags t USING (session_id);

-- 4. Per day (the day each session started): how many sessions, how many connected, how many didn't connect, and the % that connected.
SELECT started_at::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag <> 'connected') AS did_not_connect,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags
GROUP BY day
ORDER BY day;

-- 5. The last 10 pipeline runs: how many sessions, how long each took, and sessions per second.
SELECT started_at,
       status,
       sessions_tagged,
       finished_at - started_at AS duration,
       round(sessions_tagged / nullif(extract(epoch FROM finished_at - started_at), 0)) AS sessions_per_second,
       error
FROM pipeline_runs
ORDER BY started_at DESC
LIMIT 10;
