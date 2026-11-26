-- report.sql (just report): session and client connection outcomes, and the reasons for each, from the tag tables.
-- Sessions and client connections are different units: one session can have several client connections.

-- 1. Session outcomes: did an ended session record a successful connection?
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'failed') AS failed,
       count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM session_tags;

-- 2. Client connection outcomes: how many individual connections recorded success?
SELECT count(*) AS client_connections,
       count(*) FILTER (WHERE tag = 'connected') AS connected,
       count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
       count(*) FILTER (WHERE tag = 'unknown') AS unknown,
       round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
FROM connection_tags;

-- 3. Failed sessions by assigned reason. This counts sessions, not connections.
SELECT reason,
       count(*) AS failed_sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
FROM session_tags
WHERE tag = 'failed'
GROUP BY reason
ORDER BY failed_sessions DESC;

-- 4. Client connections without recorded success, grouped by assigned reason.
SELECT c.reason,
       count(*) AS not_connected_connections,
       count(DISTINCT c.session_id) AS affected_sessions,
       count(*) FILTER (WHERE s.tag = 'connected') AS in_connected_sessions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_not_connected
FROM connection_tags c
JOIN session_tags s USING (session_id)
WHERE c.tag = 'not_connected'
GROUP BY c.reason
ORDER BY not_connected_connections DESC;
