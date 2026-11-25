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
export type SessionSummary = { sessions: string; connected: string; failed: string; no_attempt: string; connected_percent: string | null };
export type ConnectionSummary = { client_connections: string; connected: string; not_connected: string; unknown: string; connected_percent: string | null };
export type ReasonRow = { reason: string; failed_sessions: string; percent_of_failed: string };
export type ErrorRow = { event: string; events: string; sessions: string; not_connected_sessions: string; connected_sessions: string };
export type ErrorDayRow = { day: string; event: string; sessions: string };
export type SessionRow = { session_id: string; tag: string; reason: string | null; started_at: Date };
export type SessionListRow = SessionRow & { total: string };
export type SessionDetail = {
  in_app: boolean; started_at: Date | null; ended_at: Date | null; end_reason: string | null;
  tag: string | null; reason: string | null; first_event_at: Date | null; events: string;
};
export type ClientConnectionRow = {
  connection_id: string; connected_at: Date; disconnected_at: Date | null; auth_type: string;
  device: string; os: string; browser: string; tag: string | null; reason: string | null;
};
export type TimelineRow = {
  recorded_at: Date; sent_by: string; connection: string; level: string; event: string; category: string | null; phase: string | null;
  stage: string | null; code: string | null; error_text: string | null; prev: string | null; state: string | null; attempt: string | null;
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

export async function getConnectionSummary(range: Range): Promise<ConnectionSummary> {   // Client connections by outcome (report 2), for connections that started in the range. Called by SummaryCards for the second row of cards
  // Client connections: total, connected, not_connected, unknown, and % connected (unknown counts in the total).
  const rows = await query<ConnectionSummary>(`
    SELECT count(*) AS client_connections,
           count(*) FILTER (WHERE tag = 'connected') AS connected,
           count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
           count(*) FILTER (WHERE tag = 'unknown') AS unknown,
           round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
    FROM connection_tags
    WHERE ${IN_RANGE("started_at")}`, [range.from, range.to]);
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

export async function getErrorFrequency(range: Range): Promise<ErrorRow[]> {          // Each error-level event in the range, ordered by how many sessions it hit that did not connect. Called by ErrorTable (Sravya's error frequency)
  // Every event the app logged as an error: times recorded, sessions it happened in, how many of those sessions didn't connect (failed or no_attempt) and how many connected anyway. Ordered by sessions that didn't connect.
  return query<ErrorRow>(`
    SELECT coalesce(e.payload->>'event', e.event_type::STRING) AS event,
           count(*) AS events,
           count(DISTINCT e.session_id) AS sessions,
           count(DISTINCT e.session_id) FILTER (WHERE t.tag IN ('failed', 'no_attempt')) AS not_connected_sessions,
           count(DISTINCT e.session_id) FILTER (WHERE t.tag = 'connected') AS connected_sessions
    FROM session_telemetry_events e
    LEFT JOIN session_tags t ON t.session_id = e.session_id
    WHERE e.level = 'error' AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY not_connected_sessions DESC, events DESC`, [range.from, range.to]);
}

export async function getErrorsPerDay(range: Range): Promise<ErrorDayRow[]> {         // Per day (UTC) and error: how many sessions that did not connect recorded it. Called by ErrorTrend for the daily bar chart
  // One row per day and error event: the day, the event name, and how many failed or no_attempt sessions recorded it that day.
  return query<ErrorDayRow>(`
    SELECT (e.recorded_at AT TIME ZONE 'UTC')::DATE::STRING AS day,
           coalesce(e.payload->>'event', e.event_type::STRING) AS event,
           count(DISTINCT e.session_id) AS sessions
    FROM session_telemetry_events e
    JOIN session_tags t ON t.session_id = e.session_id
    WHERE e.level = 'error' AND t.tag IN ('failed', 'no_attempt') AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1, 2
    ORDER BY 1, 2`, [range.from, range.to]);
}

export async function getSessionsByReason(reason: string, range: Range): Promise<SessionListRow[]> {   // The latest 500 failed sessions with one reason in the range, each carrying the real total. Called by SessionList when a reason is clicked
  // Failed sessions with this reason, latest first (at most 500); total = all matching sessions, counted before the LIMIT.
  return query<SessionListRow>(`
    SELECT session_id, tag, reason, started_at, count(*) OVER () AS total
    FROM session_tags
    WHERE tag = 'failed' AND reason = $3 AND ${IN_RANGE("started_at")}
    ORDER BY started_at DESC, session_id
    LIMIT 500`, [range.from, range.to, reason]);
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
           e.first_event_at, e.events
    FROM (SELECT $1::UUID AS id) wanted
    LEFT JOIN gamearena_source.host_sessions h ON h.id = wanted.id
    LEFT JOIN session_tags t ON t.session_id = wanted.id
    CROSS JOIN (SELECT min(recorded_at) AS first_event_at, count(*) AS events FROM session_telemetry_events WHERE session_id = $1) e
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
           coalesce(e.payload->>'code', e.payload->>'errorCode') AS code, e.payload->>'errorText' AS error_text,
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
