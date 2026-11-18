-- Every table in the database.
SHOW TABLES;

-- The columns of the raw events table.
SHOW COLUMNS FROM session_telemetry_events;

-- The columns of the raw stats table.
SHOW COLUMNS FROM session_telemetry_stats;

-- The fixed lists of allowed values (enums), e.g. the event types.
SHOW ENUMS;

-- Every different event name the app sends.
SELECT DISTINCT payload->>'event' AS step
FROM session_telemetry_events
WHERE payload->>'event' IS NOT NULL
ORDER BY step;

-- Every different field name found inside the events' payloads.
SELECT DISTINCT jsonb_object_keys(payload) AS field
FROM session_telemetry_events
ORDER BY field;

-- Every different measure found inside the stats' samples.
SELECT DISTINCT jsonb_object_keys(samples) AS measure
FROM session_telemetry_stats
ORDER BY measure;
