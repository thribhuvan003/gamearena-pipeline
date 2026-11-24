// queries.ts: the dashboard's data: the database connection and every SQL it runs, all read-only. The first three use the same SQL as the pipeline's backend/sql/report.sql, plus an optional date range.

import { connection } from "next/server";
import { Pool } from "pg";

// One connection pool, with the same settings and defaults as the pipeline.
const pool = new Pool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 26257),
  database: process.env.DB_NAME ?? "gamearena_analytics",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD,
});

async function query<Row>(sql: string, params: unknown[] = []): Promise<Row[]> {   // Runs one SELECT with $1, $2 parameters and returns its rows. Called by every function below; connection() makes it run on each page load, so the numbers are always live
  await connection();
  const result = await pool.query(sql, params);
  return result.rows as Row[];
}

// A date range picked on the page: "YYYY-MM-DD" days in UTC, both included; null = no limit on that side.
export type Range = { from: string | null; to: string | null };

// Counts come back from CockroachDB as text, so they are typed as strings and formatted on screen.
export type SessionSummary = { sessions: string; connected: string; failed: string; no_attempt: string; connected_percent: string | null };
export type ConnectionSummary = { client_connections: string; connected: string; not_connected: string; unknown: string; connected_percent: string | null };
export type ReasonRow = { reason: string; failed_sessions: string; percent_of_failed: string };
export type ErrorRow = { event: string; events: string; sessions: string; not_connected_sessions: string; connected_sessions: string };
export type ErrorDayRow = { day: string; event: string; events: string };
export type SessionRow = { session_id: string; tag: string; reason: string | null; started_at: Date };
export type SessionListRow = SessionRow & { total: string };
export type ConnectionRow = { connection_id: string; tag: string; reason: string | null; started_at: Date };

// The date filter used by every query below: $1 = first day, $2 = last day (included). Each is skipped when it is null.
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
  // Every error-level event as the app named it: times recorded, sessions it happened in, how many of those sessions failed to connect (failed or no_attempt) and how many connected anyway. Most harmful first.
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

export async function getErrorsPerDay(range: Range): Promise<ErrorDayRow[]> {         // How many times each error-level event was recorded per day (UTC) in the range. Called by ErrorTrend for the daily bar chart
  // One row per day and error event: the day, the event name, and how many times it was recorded that day.
  return query<ErrorDayRow>(`
    SELECT (recorded_at AT TIME ZONE 'UTC')::DATE::STRING AS day,
           coalesce(payload->>'event', event_type::STRING) AS event,
           count(*) AS events
    FROM session_telemetry_events
    WHERE level = 'error' AND ${IN_RANGE("recorded_at")}
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

export async function getSession(sessionId: string): Promise<SessionRow | undefined> {   // One session's tag, reason and start. Called by the session page header
  // The saved result for one session.
  const rows = await query<SessionRow>(`
    SELECT session_id, tag, reason, started_at
    FROM session_tags
    WHERE session_id = $1`, [sessionId]);
  return rows[0];
}

export async function getConnections(sessionId: string): Promise<ConnectionRow[]> {   // One session's client connections. Called by the session page, because a session can have several
  // All client connections of one session, in the order they started.
  return query<ConnectionRow>(`
    SELECT connection_id, tag, reason, started_at
    FROM connection_tags
    WHERE session_id = $1
    ORDER BY started_at, connection_id`, [sessionId]);
}
