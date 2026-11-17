WITH ended AS (                                                   -- list 1: every session that ended, with WHEN it first ended
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
expected AS (                                                     -- list 2: what each session's tag SHOULD be, worked out in plain SQL
    SELECT s.session_id,
           CASE
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.success') THEN 'connected'   -- any success? -> connected
               WHEN bool_or(e.payload->>'event' = 'pipeline.connect.attempt') THEN 'failed'      -- else any attempt? -> failed
               ELSE 'no_attempt'                                                                 -- else -> no_attempt
           END AS tag
    FROM ended s
    JOIN session_telemetry_events e ON e.session_id = s.session_id
    WHERE e.recorded_at <= s.ended_at                             -- only events up to the moment the session ended
    GROUP BY s.session_id
)
SELECT
    (SELECT count(*) FROM ended) AS ended_sessions,                                                       -- how many sessions ended
    (SELECT count(*) FROM session_tags) AS tag_rows,                                                      -- how many tags we saved
    (SELECT count(*) FROM expected x JOIN session_tags t USING (session_id) WHERE x.tag = t.tag) AS tags_matching,   -- saved tag = expected tag
    (SELECT count(*) FROM expected x LEFT JOIN session_tags t USING (session_id) WHERE t.tag IS DISTINCT FROM x.tag) AS tags_wrong_or_missing;   -- must be 0
SELECT tag, count(*) FROM session_tags GROUP BY tag ORDER BY 2 DESC;                                      -- how many of each tag
