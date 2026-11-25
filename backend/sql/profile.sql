-- profile.sql (just profile): how complete the data is and what each result rests on, using only what the payload records. Read-only, counts only (no IDs, messages, user agents or IPs). Needs gamearena_source (the app's sessions and client connections, restored from the 11 Nov backup).
-- Note: "success" below always means a recorded pipeline.connect.success event, nothing more.

-- 1a. Session coverage: every app session in exactly one row. Rows add up to all app sessions (host_sessions).
WITH ev AS (
    SELECT session_id, bool_or(event_type = 'session_ended') AS has_end_event
    FROM session_telemetry_events
    GROUP BY session_id
)
SELECT ev.session_id IS NOT NULL AS has_events,
       coalesce(ev.has_end_event, false) AS has_session_ended_event,
       h.ended_at IS NOT NULL AS has_app_end_time,
       t.session_id IS NOT NULL AS tagged,
       count(*) AS sessions
FROM gamearena_source.host_sessions h
LEFT JOIN ev ON ev.session_id = h.id
LEFT JOIN session_tags t ON t.session_id = h.id
GROUP BY 1, 2, 3, 4
ORDER BY sessions DESC;

-- 1b. The totals behind 1a, and records that exist on only one side.
SELECT (SELECT count(*) FROM gamearena_source.host_sessions) AS app_sessions,
       (SELECT count(DISTINCT session_id) FROM session_telemetry_events) AS sessions_with_events,
       (SELECT count(*) FROM (SELECT DISTINCT session_id FROM session_telemetry_events) e
         WHERE NOT EXISTS (SELECT 1 FROM gamearena_source.host_sessions h WHERE h.id = e.session_id)) AS event_sessions_not_in_app,
       (SELECT count(*) FROM session_tags) AS tagged_sessions,
       (SELECT count(DISTINCT session_id) FROM session_telemetry_stats) AS sessions_with_stats;

-- 2. Client connection coverage: every app client connection by whether any event names it and whether the pipeline tagged it. Rows add up to all app client connections.
WITH ev AS (
    SELECT DISTINCT connection_id FROM session_telemetry_events WHERE connection_id IS NOT NULL
)
SELECT ev.connection_id IS NOT NULL AS has_events,
       coalesce(t.tag, '(not tagged)') AS tag,
       count(*) AS client_connections
FROM gamearena_source.session_client_connections c
LEFT JOIN ev ON ev.connection_id = c.id
LEFT JOIN connection_tags t ON t.connection_id = c.id
GROUP BY 1, 2
ORDER BY client_connections DESC;

-- 3a. Which connection events name the connection they belong to (connection_id). Events without one can only be matched to the session.
SELECT payload->>'event' AS event,
       count(*) AS events,
       count(*) FILTER (WHERE connection_id IS NOT NULL) AS with_connection_id
FROM session_telemetry_events
WHERE payload->>'event' LIKE 'pipeline.%' OR payload->>'event' = 'media.first_decode'
GROUP BY 1
ORDER BY 1;

-- 3b. Per client connection: does a recorded success always come with a first decoded video frame (media.first_decode), and which comes first?
WITH c AS (
    SELECT connection_id,
           count(*) FILTER (WHERE payload->>'event' = 'pipeline.connect.success') AS successes,
           count(*) FILTER (WHERE payload->>'event' = 'media.first_decode') AS decodes,
           min(recorded_at) FILTER (WHERE payload->>'event' = 'pipeline.connect.success') AS first_success,
           min(recorded_at) FILTER (WHERE payload->>'event' = 'media.first_decode') AS first_decode
    FROM session_telemetry_events
    WHERE connection_id IS NOT NULL AND payload->>'event' IN ('pipeline.connect.success', 'media.first_decode')
    GROUP BY 1
)
SELECT count(*) AS connections_with_either,
       count(*) FILTER (WHERE successes > 0 AND decodes > 0) AS with_both,
       count(*) FILTER (WHERE successes > 0 AND decodes = 0) AS success_without_decode,
       count(*) FILTER (WHERE decodes > 0 AND successes = 0) AS decode_without_success,
       count(*) FILTER (WHERE first_decode <= first_success) AS decode_first,
       round(max(extract(epoch FROM first_success - first_decode)), 2) AS longest_gap_seconds
FROM c;

-- 3c. Per session (all events): attempts, successes and failures, and their order. Failures are matched per session because most have no connection_id (see 3a).
WITH s AS (
    SELECT session_id,
           count(*) FILTER (WHERE payload->>'event' = 'pipeline.connect.attempt') AS attempts,
           min(recorded_at) FILTER (WHERE payload->>'event' = 'pipeline.connect.failure') AS first_failure,
           max(recorded_at) FILTER (WHERE payload->>'event' = 'pipeline.connect.failure') AS last_failure,
           min(recorded_at) FILTER (WHERE payload->>'event' = 'pipeline.connect.success') AS first_success,
           max(recorded_at) FILTER (WHERE payload->>'event' = 'pipeline.connect.success') AS last_success
    FROM session_telemetry_events
    GROUP BY session_id
)
SELECT count(*) AS sessions_with_events,
       count(*) FILTER (WHERE attempts > 0) AS with_attempt,
       count(*) FILTER (WHERE attempts > 1) AS with_several_attempts,
       count(*) FILTER (WHERE first_success IS NOT NULL) AS with_success,
       count(*) FILTER (WHERE first_failure IS NOT NULL) AS with_failure,
       count(*) FILTER (WHERE first_failure IS NOT NULL AND first_success IS NOT NULL) AS with_both,
       count(*) FILTER (WHERE first_failure < last_success) AS failure_then_later_success,
       count(*) FILTER (WHERE last_failure > first_success) AS success_then_later_failure
FROM s;

-- 4a. Error and warning events, and which payload fields they carry. code and errorCode are different keys in the payload, so they are counted apart.
SELECT coalesce(payload->>'event', event_type::STRING) AS event,
       level::STRING AS level,
       count(*) AS events,
       count(*) FILTER (WHERE payload ? 'code') AS with_code,
       count(*) FILTER (WHERE payload ? 'errorCode') AS with_error_code,
       count(*) FILTER (WHERE payload ? 'phase') AS with_phase,
       count(*) FILTER (WHERE payload ? 'stage') AS with_stage
FROM session_telemetry_events
WHERE level IN ('warn', 'error') OR payload ? 'code' OR payload ? 'errorCode'
GROUP BY 1, 2
ORDER BY events DESC;

-- 4b. The recorded values of code / errorCode with their phase and stage (short labels only, never the reason text).
SELECT payload->>'event' AS event,
       coalesce(payload->>'code', '-') AS code,
       coalesce(payload->>'errorCode', '-') AS error_code,
       coalesce(payload->>'phase', '-') AS phase,
       coalesce(payload->>'stage', '-') AS stage,
       count(*) AS events,
       count(DISTINCT session_id) AS sessions
FROM session_telemetry_events
WHERE payload ? 'code' OR payload ? 'errorCode'
GROUP BY 1, 2, 3, 4, 5
ORDER BY events DESC;

-- 5. Failed sessions per reason, against the evidence behind it (events up to session_ended, like the pipeline). no_error_evidence = no failure event, no failed video state and no error-level event: the reason was reached by elimination.
WITH ended AS (
    SELECT session_id, min(recorded_at) AS ended_at
    FROM session_telemetry_events WHERE event_type = 'session_ended' GROUP BY session_id
), ev AS (
    SELECT e.session_id,
           bool_or(e.payload->>'event' = 'pipeline.connect.failure') AS failure_event,
           bool_or(e.payload->>'event' = 'webrtc.connection.state' AND e.payload->>'state' = 'failed') AS video_failed,
           bool_or(coalesce(e.payload->>'event', e.event_type::STRING) = 'host_connected')
             AND bool_or(coalesce(e.payload->>'event', e.event_type::STRING) = 'client_connected') AS both_joined,
           bool_or(e.level = 'error') AS any_error
    FROM session_telemetry_events e
    JOIN ended d ON d.session_id = e.session_id
    WHERE e.recorded_at <= d.ended_at
    GROUP BY e.session_id
)
SELECT t.reason,
       count(*) AS failed_sessions,
       count(*) FILTER (WHERE ev.failure_event) AS with_failure_event,
       count(*) FILTER (WHERE ev.video_failed) AS with_failed_video_state,
       count(*) FILTER (WHERE ev.both_joined) AS host_and_client_joined,
       count(*) FILTER (WHERE ev.any_error) AS with_any_error_event,
       count(*) FILTER (WHERE NOT ev.failure_event AND NOT ev.video_failed AND NOT ev.any_error) AS no_error_evidence
FROM session_tags t
JOIN ev ON ev.session_id = t.session_id
WHERE t.tag = 'failed'
GROUP BY t.reason
ORDER BY failed_sessions DESC;

-- 6. Client reconnects: how many, and how concentrated in a few sessions, with those sessions' tags.
WITH r AS (
    SELECT session_id, count(*) AS reconnects
    FROM session_telemetry_events WHERE event_type = 'client_reconnected' GROUP BY session_id
)
SELECT count(*) AS sessions_with_reconnects,
       sum(r.reconnects) AS reconnect_events,
       max(r.reconnects) AS most_in_one_session,
       count(*) FILTER (WHERE r.reconnects >= 10) AS sessions_with_10_or_more,
       sum(r.reconnects) FILTER (WHERE r.reconnects >= 10) AS reconnects_in_those,
       count(*) FILTER (WHERE r.reconnects >= 10 AND t.tag = 'connected') AS of_those_connected,
       count(*) FILTER (WHERE r.reconnects >= 10 AND t.tag IS NULL) AS of_those_not_tagged
FROM r
LEFT JOIN session_tags t ON t.session_id = r.session_id;
