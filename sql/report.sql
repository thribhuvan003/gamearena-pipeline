-- How many sessions have each tag, biggest first.
SELECT tag, count(*) AS sessions
FROM session_tags
GROUP BY tag
ORDER BY sessions DESC;

-- The first 20 failed sessions.
SELECT session_id, tag
FROM session_tags
WHERE tag = 'failed'
ORDER BY session_id
LIMIT 20;
