-- Work out every ended session's tag and start time again in plain SQL and compare them with what the pipeline saved (tags_wrong_or_missing and dates_wrong must be 0).
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
expected AS (
    SELECT s.session_id,
           min(e.recorded_at) AS started_at,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.attempt') THEN 'failed'
               ELSE 'no_attempt'
           END AS tag
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.recorded_at <= s.ended_at
    GROUP BY s.session_id
)
SELECT
    (SELECT count(*) FROM ended) AS ended_sessions,
    (SELECT count(*) FROM session_tags) AS tag_rows,
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE x.tag = t.tag) AS tags_matching,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.tag IS DISTINCT FROM x.tag) AS tags_wrong_or_missing,
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.started_at IS DISTINCT FROM x.started_at) AS dates_wrong;

-- How many sessions have each tag.
SELECT tag, count(*) FROM session_tags GROUP BY tag ORDER BY 2 DESC;
