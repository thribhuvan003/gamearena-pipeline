-- Historical trends. Each day is UTC, based on the start time of the relevant record.

-- Session outcomes by session start day.
SELECT (started_at AT TIME ZONE 'UTC')::DATE AS day,
       count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM session_tags
GROUP BY day
ORDER BY day;

-- Client connection outcomes by connection start day.
SELECT (started_at AT TIME ZONE 'UTC')::DATE AS day,
       count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / count(*), 1) AS connected_percent
FROM connection_tags
GROUP BY day
ORDER BY day;
