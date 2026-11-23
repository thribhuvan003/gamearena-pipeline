// queries.ts: every SQL the dashboard runs, all read-only. The first three use the same SQL as the pipeline's sql/report.sql.

import { query } from "./db";

// Counts come back from CockroachDB as text, so they are typed as strings and formatted on screen.
export type SessionSummary = { sessions: string; connected: string; failed: string; no_attempt: string; connected_percent: string | null };
export type ConnectionSummary = { client_connections: string; connected: string; not_connected: string; unknown: string; connected_percent: string | null };
export type ReasonRow = { reason: string; failed_sessions: string; percent_of_failed: string };
export type ErrorRow = { event: string; events: string; sessions: string; connected_sessions: string };
export type SessionRow = { session_id: string; tag: string; reason: string | null; started_at: Date };
export type SessionListRow = SessionRow & { total: string };
export type ConnectionRow = { connection_id: string; tag: string; reason: string | null; started_at: Date };

export async function getSessionSummary(): Promise<SessionSummary> {      // Sessions by outcome (report 1). Called by SummaryCards for the first row of cards
  // Sessions: total, connected, failed, no_attempt, and % connected.
  const rows = await query<SessionSummary>(`
    SELECT count(*) AS sessions,
           count(*) FILTER (WHERE tag = 'connected') AS connected,
           count(*) FILTER (WHERE tag = 'failed') AS failed,
           count(*) FILTER (WHERE tag = 'no_attempt') AS no_attempt,
           round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
    FROM session_tags`);
  return rows[0];
}

export async function getConnectionSummary(): Promise<ConnectionSummary> {   // Client connections by outcome (report 2). Called by SummaryCards for the second row of cards
  // Client connections: total, connected, not_connected, unknown, and % connected (unknown counts in the total).
  const rows = await query<ConnectionSummary>(`
    SELECT count(*) AS client_connections,
           count(*) FILTER (WHERE tag = 'connected') AS connected,
           count(*) FILTER (WHERE tag = 'not_connected') AS not_connected,
           count(*) FILTER (WHERE tag = 'unknown') AS unknown,
           round(100.0 * count(*) FILTER (WHERE tag = 'connected') / nullif(count(*), 0), 1) AS connected_percent
    FROM connection_tags`);
  return rows[0];
}

export async function getFailureReasons(): Promise<ReasonRow[]> {          // Failed sessions per reason (report 3). Called by ReasonsTable so you can see why sessions failed
  // Failed sessions grouped by reason, most common first.
  return query<ReasonRow>(`
    SELECT reason,
           count(*) AS failed_sessions,
           round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent_of_failed
    FROM session_tags
    WHERE tag = 'failed'
    GROUP BY reason
    ORDER BY failed_sessions DESC`);
}

export async function getErrorFrequency(): Promise<ErrorRow[]> {          // How often each error-level event was recorded. Called by ErrorTable (Sravya's error frequency)
  // Every error-level event as the app named it: how many times, in how many sessions, and how many of those sessions still connected.
  return query<ErrorRow>(`
    SELECT coalesce(e.payload->>'event', e.event_type::STRING) AS event,
           count(*) AS events,
           count(DISTINCT e.session_id) AS sessions,
           count(DISTINCT e.session_id) FILTER (WHERE t.tag = 'connected') AS connected_sessions
    FROM session_telemetry_events e
    LEFT JOIN session_tags t ON t.session_id = e.session_id
    WHERE e.level = 'error'
    GROUP BY 1
    ORDER BY events DESC`);
}

export async function getSessionsByReason(reason: string): Promise<SessionListRow[]> {   // The latest 500 failed sessions with one reason, each carrying the real total. Called by SessionList when a reason is clicked
  // Failed sessions with this reason, latest first (at most 500); total = all matching sessions, counted before the LIMIT.
  return query<SessionListRow>(`
    SELECT session_id, tag, reason, started_at, count(*) OVER () AS total
    FROM session_tags
    WHERE tag = 'failed' AND reason = $1
    ORDER BY started_at DESC, session_id
    LIMIT 500`, [reason]);
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
