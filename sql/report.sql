SELECT tag, count(*) AS sessions
FROM session_tags
GROUP BY tag
ORDER BY sessions DESC;

SELECT session_id, tag, tagged_at
FROM session_tags
WHERE tag = 'failed'
ORDER BY session_id
LIMIT 20;
