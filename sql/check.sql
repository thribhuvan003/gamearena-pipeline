WITH ended AS (
    SELECT DISTINCT session_id FROM session_telemetry_events WHERE event_type = 'session_ended'
),
expected AS (
    SELECT s.session_id,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.attempt') THEN 'failed'
               ELSE 'no_attempt'
           END AS tag
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    GROUP BY s.session_id
)
SELECT
    (SELECT count(*) FROM ended) AS ended_sessions,
    (SELECT count(*) FROM session_tags) AS tag_rows,
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE x.tag = t.tag) AS tags_matching,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.tag IS DISTINCT FROM x.tag) AS tags_wrong_or_missing;
SELECT tag, count(*) FROM session_tags GROUP BY tag ORDER BY 2 DESC;
