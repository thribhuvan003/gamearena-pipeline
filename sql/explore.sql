SHOW TABLES;

SHOW COLUMNS FROM session_telemetry_events;

SHOW COLUMNS FROM session_telemetry_stats;

SHOW ENUMS;

SELECT DISTINCT payload->>'event' AS step
FROM session_telemetry_events
WHERE payload->>'event' IS NOT NULL
ORDER BY step;

SELECT DISTINCT jsonb_object_keys(payload) AS field
FROM session_telemetry_events
ORDER BY field;

SELECT DISTINCT jsonb_object_keys(samples) AS measure
FROM session_telemetry_stats
ORDER BY measure;
