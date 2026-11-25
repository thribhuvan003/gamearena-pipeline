// queries.ts: the database connection and every read-only SQL the dashboard runs. The session and reason summaries use the same SQL as backend/sql/report.sql; the session page also reads gamearena_source (the app's sessions and client connections, restored from Casey's backup).

import { connection } from "next/server";
import { Pool, type QueryResultRow } from "pg";

// One connection pool, with the same settings and defaults as the pipeline.
const pool = new Pool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 26257),
  database: process.env.DB_NAME ?? "gamearena_analytics",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD,
});

async function query<Row extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<Row[]> {   // Runs one SELECT with $1, $2 parameters and returns its rows. Called by every function below; connection() tells Next.js not to cache, so the numbers are always live
  await connection();
  const result = await pool.query<Row>(sql, params);
  return result.rows;
}

// A date range picked on the page: "YYYY-MM-DD" days in UTC, both included; null = no limit on that side.
export type Range = { from: string | null; to: string | null };

// Counts come back from CockroachDB as text, so they are typed as strings and formatted on screen.
// Distinct counts with a condition use count(DISTINCT CASE WHEN ... END), never count(DISTINCT ...) FILTER: CockroachDB 26.3.4 returned 451 instead of 6,136 for the FILTER form next to another count(DISTINCT) of the same column.
export type SessionSummary = { sessions: string; connected: string; failed: string; no_attempt: string; connected_percent: string | null };
export type ConnectionSummary = { client_connections: string; connected: string; not_connected: string; not_connected_nobody: string; unknown: string; connected_percent: string | null };
export type ReasonRow = { reason: string; failed_sessions: string; percent_of_failed: string };
export type ClientReasonRow = { reason: string; clients: string; percent: string };
export type ReasonErrorRow = { error: string | null; warning: boolean; clients: string; phase: string | null; stage: string | null; top_percent: string | null };
export type ReasonSteps = { clients: string; gathered: string; decoded: string };
export type ClientListRow = { connection_id: string; session_id: string; started_at: Date; client_number: string | null; seconds: string | null; other_connected: boolean; total: string };
export type ErrorRow = { error: string; warning: boolean; events: string; clients: string; not_connected_clients: string; connected_clients: string; not_connected_percent: string | null };
export type UntiedErrorRow = { error: string; events: string; sessions: string };
export type ErrorDayRow = { day: string; error: string; warning: boolean; clients: string };
export type ErrorKeyRow = { error: string; field: "clients" | "message" | "phase" | "stage" | "text"; value: string | null; events: string };
export type SessionDetail = {
  in_app: boolean; started_at: Date | null; ended_at: Date | null; end_reason: string | null;
  tag: string | null; reason: string | null; first_event_at: Date | null; events: string; has_end_event: boolean;
};
export type ClientConnectionRow = {
  connection_id: string; connected_at: Date; disconnected_at: Date | null; auth_type: string;
  device: string; os: string; browser: string; tag: string | null; reason: string | null;
};
export type TimelineRow = {
  recorded_at: Date; sent_by: string; connection: string; level: string; event: string; category: string | null; phase: string | null;
  stage: string | null; code: string | null; error_code: string | null; error_text: string | null; prev: string | null; state: string | null; attempt: string | null;
  auth_type: string | null; mode: string | null; end_reason: string | null; message: string | null; reason: string | null;
};

// The date filter used by the dashboard queries: $1 = first day, $2 = last day (included). Each is skipped when it is null.
const IN_RANGE = (column: string) =>
  `($1::DATE IS NULL OR ${column} >= $1::DATE::TIMESTAMPTZ) AND ($2::DATE IS NULL OR ${column} < ($2::DATE + 1)::TIMESTAMPTZ)`;

export async function getDataDays(): Promise<{ first: string | null; last: string | null }> {   // The first and last day (UTC) that has tagged sessions. Called by DateFilter to show which dates have data and limit the date boxes
  // Earliest and latest session start day.
  const rows = await query<{ first: string | null; last: string | null }>(`
    SELECT (min(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS first,
           (max(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS last
    FROM session_tags`);
  return rows[0];
}

export async function getSessionSummary(range: Range): Promise<SessionSummary> {      // Sessions by outcome (report 1), for sessions that started in the range. Called by SummaryCards for the first row of cards
  // Sessions: total, connected, failed, no_attempt, and % connected.
  const rows = await query<SessionSummary>(`
    SELECT count(*) AS sessions,
           count(*) FILTER (WHERE tag = 'connected') AS connected,
           count(*) FILTER (WHERE tag = 'failed') AS failed,
           count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
           round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
    FROM session_tags
    WHERE ${IN_RANGE("started_at")}`, [range.from, range.to]);
  return rows[0];
}

export async function getConnectionSummary(range: Range): Promise<ConnectionSummary> {   // Client connections by outcome (report 2), for connections that started in the range. Called by SummaryCards for the client connection numbers
  // Client connections: total, connected, not_connected (and how many of those were in a session where no client connected), unknown, and % connected (unknown counts in the total).
  const rows = await query<ConnectionSummary>(`
    SELECT count(*) AS client_connections,
           count(*) FILTER (WHERE t.tag = 'connected') AS connected,
           count(*) FILTER (WHERE t.tag = 'not_connected') AS not_connected,
           count(*) FILTER (WHERE t.tag = 'not_connected' AND s.session_id IS NULL) AS not_connected_nobody,
           count(*) FILTER (WHERE t.tag = 'unknown') AS unknown,
           round(100.0 * count(*) FILTER (WHERE t.tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
    FROM connection_tags t
    LEFT JOIN (SELECT DISTINCT session_id FROM connection_tags WHERE tag = 'connected') s ON s.session_id = t.session_id
    WHERE ${IN_RANGE("t.started_at")}`, [range.from, range.to]);
  return rows[0];
}

export async function getFailureReasons(range: Range): Promise<ReasonRow[]> {          // Failed sessions per reason (report 3), for sessions that started in the range. Called by ReasonsTable so you can see why sessions failed
  // Failed sessions grouped by reason, most common first.
  return query<ReasonRow>(`
    SELECT reason,
           count(*) AS failed_sessions,
           round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
    FROM session_tags
    WHERE tag = 'failed' AND ${IN_RANGE("started_at")}
    GROUP BY reason
    ORDER BY failed_sessions DESC`, [range.from, range.to]);
}

export async function getConnectionReasons(range: Range): Promise<ClientReasonRow[]> {   // Client connections that didn't connect, per reason, for connections that started in the range. Called by ReasonsTable
  // not_connected client connections grouped by the pipeline's reason, most common first.
  return query<ClientReasonRow>(`
    SELECT reason,
           count(*) AS clients,
           round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent
    FROM connection_tags
    WHERE tag = 'not_connected' AND ${IN_RANGE("started_at")}
    GROUP BY reason
    ORDER BY clients DESC`, [range.from, range.to]);
}

// The event's name as the app sent it.
const EVENT = `coalesce(e.payload->>'event', e.event_type::STRING)`;
// An error's name plus its code when the payload has one ("code" or "errorCode"), e.g. "pipeline.connect.failure 500".
const ERROR_NAME = `${EVENT} || coalesce(' ' || coalesce(e.payload->>'code', e.payload->>'errorCode'), '')`;
// ice.candidate.error is logged as an error, but most clients that hit it still connect, so the dashboard shows it as a warning, always last.
const WARNING = `(${EVENT} = 'ice.candidate.error')`;

export async function getReasonErrors(reason: string, range: Range): Promise<ReasonErrorRow[]> {   // What is inside one reason: the errors recorded on its client connections, by error + code, with the most common phase and stage. Called by ReasonSheet when a reason is opened
  // Error events of this reason's clients; per error + code: clients hit, and the most common phase + stage with its share of the times recorded. Then one row (error NULL) for the clients with no error at all. Warnings last.
  return query<ReasonErrorRow>(`
    WITH ev AS (
      SELECT ${ERROR_NAME} AS error, ${WARNING} AS warning, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage, e.connection_id
      FROM connection_tags t
      JOIN session_telemetry_events e ON e.connection_id = t.connection_id
      WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")} AND e.level = 'error'),
    per AS (SELECT error, bool_or(warning) AS warning, count(DISTINCT connection_id) AS clients, count(*) AS events FROM ev GROUP BY error),
    top AS (SELECT DISTINCT ON (error) error, phase, stage, count(*) AS n FROM ev GROUP BY error, phase, stage ORDER BY error, n DESC, phase, stage)
    SELECT p.error, p.warning, p.clients, top.phase, top.stage, round(100.0 * top.n / p.events)::STRING AS top_percent
    FROM per p JOIN top ON top.error = p.error
    UNION ALL
    SELECT NULL::STRING, false, count(*), NULL::STRING, NULL::STRING, NULL::STRING
    FROM connection_tags t
    WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")}
      AND NOT EXISTS (SELECT 1 FROM session_telemetry_events e WHERE e.connection_id = t.connection_id AND e.level = 'error')
    ORDER BY warning, error IS NULL, clients DESC, error`, [range.from, range.to, reason]);
}

export async function getReasonSteps(reason: string, range: Range): Promise<ReasonSteps> {   // How far one reason's clients got: how many recorded ice.gathering.complete and how many media.first_decode (every connected client has one). Called by ReasonSheet
  // This reason's clients, and how many of them recorded each of the two events.
  const rows = await query<ReasonSteps>(`
    SELECT count(DISTINCT t.connection_id) AS clients,
           count(DISTINCT CASE WHEN ${EVENT} = 'ice.gathering.complete' THEN t.connection_id END) AS gathered,
           count(DISTINCT CASE WHEN ${EVENT} = 'media.first_decode' THEN t.connection_id END) AS decoded
    FROM connection_tags t
    LEFT JOIN session_telemetry_events e ON e.connection_id = t.connection_id
    WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")}`, [range.from, range.to, reason]);
  return rows[0];
}

export async function getClientsByReason(reason: string, range: Range): Promise<ClientListRow[]> {   // The latest 500 client connections with one reason: session, client number, seconds connected, whether another client in the session connected, and the real total. Called by ReasonSheet when a reason is opened
  // Client connections with this reason, latest first (at most 500). Client number = order within its session, the same as the session view; seconds = the app's disconnected_at - connected_at. total is counted before the LIMIT.
  return query<ClientListRow>(`
    SELECT t.connection_id, t.session_id, t.started_at, c.client_number::STRING AS client_number,
           extract(epoch FROM c.disconnected_at - c.connected_at)::INT::STRING AS seconds,
           EXISTS (SELECT 1 FROM connection_tags o WHERE o.session_id = t.session_id AND o.tag = 'connected') AS other_connected,
           count(*) OVER () AS total
    FROM connection_tags t
    LEFT JOIN (SELECT id, connected_at, disconnected_at, row_number() OVER (PARTITION BY session_id ORDER BY connected_at, id) AS client_number
               FROM gamearena_source.session_client_connections
               WHERE session_id IN (SELECT session_id FROM connection_tags WHERE tag = 'not_connected' AND reason = $3)) c
           ON c.id = t.connection_id
    WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")}
    ORDER BY t.started_at DESC, t.connection_id
    LIMIT 500`, [range.from, range.to, reason]);
}

export async function getErrorFrequency(range: Range): Promise<ErrorRow[]> {          // Each error + code in the range, counted per client connection it hit, worst share first, warnings last. Called by ErrorTable (the error table Sravya asked for)
  // Events the app logged as errors that name a client connection: times recorded, client connections hit, how many of those didn't connect and how many connected anyway (pipeline tags). Warnings last, then by the share that didn't connect.
  return query<ErrorRow>(`
    SELECT ${ERROR_NAME} AS error,
           bool_or(${WARNING}) AS warning,
           count(*) AS events,
           count(DISTINCT e.connection_id) AS clients,
           count(DISTINCT CASE WHEN t.tag = 'not_connected' THEN e.connection_id END) AS not_connected_clients,
           count(DISTINCT CASE WHEN t.tag = 'connected' THEN e.connection_id END) AS connected_clients,
           round(100.0 * count(DISTINCT CASE WHEN t.tag = 'not_connected' THEN e.connection_id END) / count(DISTINCT e.connection_id), 1) AS not_connected_percent
    FROM session_telemetry_events e
    LEFT JOIN connection_tags t ON t.connection_id = e.connection_id
    WHERE e.level = 'error' AND e.connection_id IS NOT NULL AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY warning, not_connected_percent DESC, not_connected_clients DESC`, [range.from, range.to]);
}

export async function getUntiedErrors(range: Range): Promise<UntiedErrorRow[]> {     // Errors in the range that name no client connection (mostly setup failures before any player connected), counted per session. Called by ErrorTable for the line under the table
  // Events the app logged as errors with no connection_id: times recorded and sessions they happened in, per error + code.
  return query<UntiedErrorRow>(`
    SELECT ${ERROR_NAME} AS error, count(*) AS events, count(DISTINCT e.session_id) AS sessions
    FROM session_telemetry_events e
    WHERE e.level = 'error' AND e.connection_id IS NULL AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY events DESC`, [range.from, range.to]);
}

export async function getErrorsPerDay(range: Range): Promise<ErrorDayRow[]> {         // Per day (UTC) and error + code: how many client connections that didn't connect recorded it. Called by ErrorTrend for the daily bar chart
  // One row per day and error: the day, the error + code, whether it is a warning, and how many not_connected client connections recorded it that day.
  return query<ErrorDayRow>(`
    SELECT (e.recorded_at AT TIME ZONE 'UTC')::DATE::STRING AS day,
           ${ERROR_NAME} AS error,
           bool_or(${WARNING}) AS warning,
           count(DISTINCT e.connection_id) AS clients
    FROM session_telemetry_events e
    JOIN connection_tags t ON t.connection_id = e.connection_id
    WHERE e.level = 'error' AND t.tag = 'not_connected' AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1, 2
    ORDER BY 1, 2`, [range.from, range.to]);
}

export async function getErrorKey(range: Range): Promise<ErrorKeyRow[]> {   // For each error + code in the chart: the clients it hit over the whole range, and the app's message, phases, stages and own error text with how often each was recorded. Called by ErrorTrend for the key under the chart
  // The chart's errors (same filter as getErrorsPerDay); field "clients" = distinct clients over the range (events holds the count), then one row per error and each value of message, phase, stage and text (payload "reason" or "errorText").
  return query<ErrorKeyRow>(`
    WITH errs AS (
      SELECT ${ERROR_NAME} AS error, e.connection_id, e.message, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage,
             coalesce(e.payload->>'reason', e.payload->>'errorText') AS text
      FROM session_telemetry_events e
      JOIN connection_tags t ON t.connection_id = e.connection_id
      WHERE e.level = 'error' AND t.tag = 'not_connected' AND ${IN_RANGE("e.recorded_at")})
    SELECT error, 'clients' AS field, NULL::STRING AS value, count(DISTINCT connection_id) AS events FROM errs GROUP BY error
    UNION ALL
    SELECT error, 'message', message, count(*) FROM errs WHERE message IS NOT NULL GROUP BY error, message
    UNION ALL
    SELECT error, 'phase', phase, count(*) FROM errs GROUP BY error, phase
    UNION ALL
    SELECT error, 'stage', stage, count(*) FROM errs GROUP BY error, stage
    UNION ALL
    SELECT error, 'text', text, count(*) FROM errs WHERE text IS NOT NULL GROUP BY error, text
    ORDER BY error, field, events DESC`, [range.from, range.to]);
}

// Device, OS and browser from a client's user agent (column u), decided by well-known tokens. Only these labels leave the database, never the user agent itself.
const DEVICE = `CASE
    WHEN u ILIKE '%smart-tv%' OR u ILIKE '%smarttv%' OR u ILIKE '%tizen%' OR u ILIKE '%web0s%' OR u ILIKE '%webos%'
      OR u ILIKE '%crkey%' OR u ILIKE '%googletv%' OR u ILIKE '%android tv%' OR u ILIKE '%bravia%' OR u ILIKE '% aft%' THEN 'TV'
    WHEN u ILIKE '%iphone%' OR u ILIKE '%ipod%' OR (u ILIKE '%android%' AND u ILIKE '%mobile%') THEN 'Phone'
    WHEN u ILIKE '%ipad%' OR u ILIKE '%android%' THEN 'Tablet'
    WHEN u ILIKE '%samsungbrowser%' AND u ILIKE '%x11%' THEN 'Samsung desktop mode (phone, tablet or DeX: unconfirmed)'
    WHEN u ILIKE '%windows%' OR u ILIKE '%macintosh%' OR u ILIKE '%cros%' OR u ILIKE '%x11%' THEN 'Desktop'
    ELSE 'Unknown' END`;
const OS = `CASE
    WHEN u ILIKE '%tizen%' THEN 'Tizen (Samsung TV)'
    WHEN u ILIKE '%android%' THEN 'Android'
    WHEN u ILIKE '%iphone%' OR u ILIKE '%ipad%' OR u ILIKE '%ipod%' THEN 'iOS'
    WHEN u ILIKE '%windows%' THEN 'Windows'
    WHEN u ILIKE '%cros%' THEN 'ChromeOS'
    WHEN u ILIKE '%macintosh%' THEN 'macOS'
    WHEN u ILIKE '%linux%' THEN 'Linux'
    ELSE 'Unknown' END`;
const BROWSER = `CASE
    WHEN u ILIKE '%edg/%' OR u ILIKE '%edga/%' OR u ILIKE '%edgios/%' THEN 'Edge'
    WHEN u ILIKE '%; wv)%' THEN 'Android WebView (in-app)'
    WHEN u ILIKE '%opr/%' THEN 'Opera'
    WHEN u ILIKE '%samsungbrowser%' THEN 'Samsung Internet'
    WHEN u ILIKE '%firefox%' OR u ILIKE '%fxios%' THEN 'Firefox'
    WHEN u ILIKE '%crios%' OR u ILIKE '%chrome%' THEN 'Chrome'
    WHEN u ILIKE '%safari%' THEN 'Safari'
    ELSE 'Unknown' END`;

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | undefined> {   // One session: the app's own start, end and end reason, the pipeline's tag if any, and its event count. Called by the session page header; undefined = no app record and no events
  // Start from the wanted ID so a session found in only one place still returns a row; the app record and the tag are each joined on if they exist.
  const rows = await query<SessionDetail>(`
    SELECT h.id IS NOT NULL AS in_app, h.started_at, h.ended_at, h.end_reason, t.tag, t.reason,
           e.first_event_at, e.events, e.has_end_event
    FROM (SELECT $1::UUID AS id) wanted
    LEFT JOIN gamearena_source.host_sessions h ON h.id = wanted.id
    LEFT JOIN session_tags t ON t.session_id = wanted.id
    CROSS JOIN (SELECT min(recorded_at) AS first_event_at, count(*) AS events, coalesce(bool_or(event_type = 'session_ended'), false) AS has_end_event
                FROM session_telemetry_events WHERE session_id = $1) e
    WHERE h.id IS NOT NULL OR e.events > 0`, [sessionId]);
  return rows[0];
}

export async function getClientConnections(sessionId: string): Promise<ClientConnectionRow[]> {   // One session's client connections with device, OS, browser and the pipeline's tag for each. Called by the session page, because a session can have several
  // Client connections from the app, in the order they connected, with connection_tags joined on (missing = not tagged).
  return query<ClientConnectionRow>(`
    SELECT c.id AS connection_id, c.connected_at, c.disconnected_at, c.auth_type::STRING AS auth_type,
           ${DEVICE} AS device, ${OS} AS os, ${BROWSER} AS browser, t.tag, t.reason
    FROM (SELECT *, user_agent AS u FROM gamearena_source.session_client_connections WHERE session_id = $1) c
    LEFT JOIN connection_tags t ON t.connection_id = c.id
    ORDER BY c.connected_at, c.id`, [sessionId]);
}

export async function getTimeline(sessionId: string): Promise<TimelineRow[]> {   // One session's events in time order (first 1,000), with only the safe payload fields. Called by SessionTimeline on the session page
  // Each event: when, who sent it (client, host or server), which connection it is about (client number in connection order, or host), and the known fields. connected_to, url and newSessionId are never read.
  return query<TimelineRow>(`
    SELECT e.recorded_at,
           CASE e.source WHEN 'system' THEN 'Server' WHEN 'host' THEN 'Host' ELSE 'Client' END AS sent_by,
           CASE WHEN c.client_number IS NOT NULL THEN 'Client ' || c.client_number::STRING
                WHEN e.connection_role = 'host' THEN 'Host'
                WHEN e.connection_role = 'client' THEN 'A client'
                ELSE '-' END AS connection,
           e.level::STRING AS level,
           coalesce(e.payload->>'event', e.event_type::STRING) AS event,
           e.payload->>'category' AS category, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage,
           e.payload->>'code' AS code, e.payload->>'errorCode' AS error_code, e.payload->>'errorText' AS error_text,
           e.payload->>'prev' AS prev, e.payload->>'state' AS state, e.payload->>'attempt' AS attempt,
           e.payload->>'auth_type' AS auth_type, e.payload->>'mode' AS mode, e.payload->>'end_reason' AS end_reason,
           e.message, e.payload->>'reason' AS reason
    FROM session_telemetry_events e
    LEFT JOIN (SELECT id, row_number() OVER (ORDER BY connected_at, id) AS client_number
               FROM gamearena_source.session_client_connections WHERE session_id = $1) c ON c.id = e.connection_id
    WHERE e.session_id = $1
    ORDER BY e.recorded_at, e.id
    LIMIT 1000`, [sessionId]);
}
