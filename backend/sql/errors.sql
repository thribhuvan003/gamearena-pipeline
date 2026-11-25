-- Diagnostic detail: last explicitly recorded pipeline.connect.failure per failed session.
-- This is a subset of failed sessions, not a separate failure population.
-- pipeline.connect.failure carries its code in payload 'code' (500 or 400), never in 'errorCode' (that key is only on ice.candidate.error). See just profile, part 4.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events
    WHERE event_type = 'session_ended'
    GROUP BY session_id
),
last_error AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.recorded_at, e.payload
    FROM session_telemetry_events e
    JOIN ended d ON d.session_id = e.session_id
    WHERE e.payload->>'event' = 'pipeline.connect.failure'
      AND e.recorded_at <= d.ended_at
    ORDER BY e.session_id, e.recorded_at DESC, e.id DESC
)
SELECT t.reason AS session_reason,
       l.payload->>'code' AS error_code,
       l.payload->>'phase' AS phase,
       l.payload->>'stage' AS stage,
       l.payload->>'reason' AS error_text,
       count(*) AS affected_sessions,
       (min(l.recorded_at) AT TIME ZONE 'UTC')::DATE AS first_seen,
       (max(l.recorded_at) AT TIME ZONE 'UTC')::DATE AS last_seen
FROM last_error l
JOIN session_tags t USING (session_id)
WHERE t.tag = 'failed'
GROUP BY 1, 2, 3, 4, 5
ORDER BY affected_sessions DESC;
