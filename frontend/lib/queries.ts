// queries.ts: the database connection and every read-only SQL the dashboard runs. Every clickable number is a cohort below: one SQL condition used for both its count and its list, so a number always opens exactly the records it counts.

import { connection } from "next/server";
import { Pool, type QueryResultRow } from "pg";
import { cache } from "react";
import { requireDashboardAccess } from "./access";

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
  await requireDashboardAccess();
  const result = await pool.query<Row>(sql, params);
  return result.rows;
}

// A date range picked on the page: "YYYY-MM-DD" days in UTC, both included; null = no limit on that side.
export type Range = { from: string | null; to: string | null; view?: "diagnostics" };

// Counts come back from CockroachDB as text, so they are typed as strings and formatted on screen.
// Distinct counts with a condition use count(DISTINCT CASE WHEN ... END), never count(DISTINCT ...) FILTER: CockroachDB 26.3.4 returned 451 instead of 6,136 for the FILTER form next to another count(DISTINCT) of the same column.
export type DailyConnectionRow = { day: string; not_connected: string };
export type ClientReasonRow = { reason: string; clients: string; percent: string };
export type SessionReasonRow = { reason: string; sessions: string };
export type ReasonErrorRow = { error: string | null; warning: boolean; clients: string; phase: string | null; stage: string | null; top_percent: string | null };
export type ReasonSteps = { clients: string; gathered: string; decoded: string };
export type ErrorRow = { error: string; warning: boolean; events: string; clients: string; not_tagged_clients: string; not_connected_clients: string; connected_clients: string; not_connected_percent: string | null };
export type SessionErrorRow = { error: string; events: string; sessions: string };
export type ErrorSeriesRow = { day: string | null; series: string; warning: boolean; clients: string };
export type ErrorKeyRow = { error: string; field: "clients" | "message" | "phase" | "stage" | "text"; value: string | null; events: string };
export type SessionListRow = { session_id: string; started_at: Date; ended_at: Date | null; events: string | null; tag: string | null; reason: string | null; clients: string };
export type ClientListRow = {
  connection_id: string; session_id: string; started_at: Date; tag: string; reason: string | null;
  client_number: string | null; seconds: string | null; other_connected: boolean;
};
export type SearchRow = { kind: "session" | "client"; id: string; session_id: string };
export type SessionDetail = {
  in_app: boolean; started_at: Date | null; ended_at: Date | null; end_reason: string | null;
  tag: string | null; reason: string | null; first_event_at: Date | null; events: string; error_events: string; warn_events: string; has_end_event: boolean;
};
export type WarningRow = { event: string; warning: boolean; events: string; first_at: Date; last_at: Date };
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

// The event's name as the app sent it.
const EVENT = `coalesce(e.payload->>'event', e.event_type::STRING)`;
// An error's name plus its code when the payload has one ("code" or "errorCode"), e.g. "pipeline.connect.failure 500".
const ERROR_NAME = `${EVENT} || coalesce(' ' || coalesce(e.payload->>'code', e.payload->>'errorCode'), '')`;
// ice.candidate.error is logged as an error, but most clients that hit it still connect, so the dashboard shows it as a warning, always last.
const WARNING = `(${EVENT} = 'ice.candidate.error')`;
const RECORDED_ERROR = `e.level = 'error' AND NOT ${WARNING} AND ${IN_RANGE("e.recorded_at")}`;

// One row per app session (gamearena_source.host_sessions, the whole population) with its telemetry facts (events NULL = no telemetry) and the pipeline's tag. No date filter here; the cohorts add it on the app's started_at.
const SESSIONS = `(
  SELECT h.id AS session_id, h.started_at, h.ended_at, t.tag, t.reason,
         ev.events, coalesce(ev.has_end, false) AS has_end, coalesce(ev.attempts, 0) AS attempts,
         ev.first_failure, ev.last_failure, ev.first_success, ev.last_success, coalesce(ev.reconnects, 0) AS reconnects
  FROM gamearena_source.host_sessions h
  LEFT JOIN (
    SELECT e.session_id, count(*) AS events, bool_or(e.event_type = 'session_ended') AS has_end,
           count(*) FILTER (WHERE ${EVENT} = 'pipeline.connect.attempt') AS attempts,
           min(e.recorded_at) FILTER (WHERE ${EVENT} = 'pipeline.connect.failure') AS first_failure,
           max(e.recorded_at) FILTER (WHERE ${EVENT} = 'pipeline.connect.failure') AS last_failure,
           min(e.recorded_at) FILTER (WHERE ${EVENT} = 'pipeline.connect.success') AS first_success,
           max(e.recorded_at) FILTER (WHERE ${EVENT} = 'pipeline.connect.success') AS last_success,
           count(*) FILTER (WHERE e.event_type = 'client_reconnected') AS reconnects
    FROM session_telemetry_events e
    GROUP BY e.session_id) ev ON ev.session_id = h.id
  LEFT JOIN session_tags t ON t.session_id = h.id) s`;

// One row per tagged client connection (connection_tags). The cohorts add the date filter on its first event time.
const CLIENTS = `(SELECT connection_id, session_id, started_at, tag, reason FROM connection_tags) s`;

// What a number counts: app sessions or tagged client connections. One number never mixes the two.
export type Unit = "sessions" | "clients";
type Cohort = { unit: Unit; title: string; arg: boolean; where: string };   // where = the whole condition on s, date filter included; $3 = the argument when arg is true

const S = IN_RANGE("s.started_at");
const ERROR_ON = (link: string, tied: boolean) =>   // An error event with this error + code ($3), recorded in the range, on this session (no client named) or this client
  `EXISTS (SELECT 1 FROM session_telemetry_events e WHERE ${link} AND e.level = 'error' AND e.connection_id IS ${tied ? "NOT NULL" : "NULL"} AND ${ERROR_NAME} = $3 AND ${IN_RANGE("e.recorded_at")})`;

// Every cohort. Titles use the data's own names; arg cohorts show their argument after the title.
export const COHORTS = {
  app_sessions: { unit: "sessions", title: "App sessions", arg: false, where: S },
  with_telemetry: { unit: "sessions", title: "App sessions with telemetry events", arg: false, where: `${S} AND s.events IS NOT NULL` },
  no_telemetry: { unit: "sessions", title: "App sessions with no telemetry events", arg: false, where: `${S} AND s.events IS NULL` },
  no_end_event: { unit: "sessions", title: "Sessions missing an end event", arg: false, where: `${S} AND s.events IS NOT NULL AND NOT s.has_end` },
  several_attempts: { unit: "sessions", title: "Sessions with multiple connection attempts", arg: false, where: `${S} AND s.attempts > 1` },
  failure: { unit: "sessions", title: "Sessions with a recorded connection failure", arg: false, where: `${S} AND s.first_failure IS NOT NULL` },
  failure_then_success: { unit: "sessions", title: "Sessions that connected after a failed attempt", arg: false, where: `${S} AND s.first_failure < s.last_success` },
  success_then_failure: { unit: "sessions", title: "Sessions with a failed attempt after connecting", arg: false, where: `${S} AND s.last_failure > s.first_success` },
  reconnected: { unit: "sessions", title: "Sessions with a client reconnect", arg: false, where: `${S} AND s.reconnects > 0` },
  reconnected_10: { unit: "sessions", title: "Sessions with 10 or more client reconnects", arg: false, where: `${S} AND s.reconnects >= 10` },
  tag_connected: { unit: "sessions", title: "Sessions tagged connected", arg: false, where: `${S} AND s.tag = 'connected'` },
  tag_failed: { unit: "sessions", title: "Sessions tagged failed", arg: false, where: `${S} AND s.tag = 'failed'` },
  tag_no_attempt: { unit: "sessions", title: "Sessions tagged no_attempt", arg: false, where: `${S} AND s.tag = 'no_attempt'` },
  session_reason: { unit: "sessions", title: "App sessions classified as failed", arg: true, where: `${S} AND s.tag = 'failed' AND s.reason = $3` },
  recorded_error: {
    unit: "sessions", title: "Affected sessions", arg: true,
    where: `EXISTS (SELECT 1 FROM session_telemetry_events e WHERE e.session_id = s.session_id AND ${RECORDED_ERROR} AND ${ERROR_NAME} = $3)`,
  },
  untied_error: { unit: "sessions", title: "Sessions with an error that names no client", arg: true, where: ERROR_ON("e.session_id = s.session_id", false) },
  clients: { unit: "clients", title: "Client connections with telemetry", arg: false, where: S },
  clients_connected: { unit: "clients", title: "Client connections that connected", arg: false, where: `${S} AND s.tag = 'connected'` },
  clients_not_connected: { unit: "clients", title: "Client connections that didn’t connect", arg: false, where: `${S} AND s.tag = 'not_connected'` },
  clients_alone: { unit: "clients", title: "Failed connections in sessions where no client connected", arg: false, where: `${S} AND s.tag = 'not_connected' AND NOT EXISTS (SELECT 1 FROM connection_tags o WHERE o.session_id = s.session_id AND o.tag = 'connected')` },
  clients_unknown: { unit: "clients", title: "Client connections with unknown outcomes", arg: false, where: `${S} AND s.tag = 'unknown'` },
  client_reason: { unit: "clients", title: "Client connections that didn’t connect", arg: true, where: `${S} AND s.tag = 'not_connected' AND s.reason = $3` },
  client_error: { unit: "clients", title: "Client connections that recorded", arg: true, where: ERROR_ON("e.connection_id = s.connection_id", true) },
} satisfies Record<string, Cohort>;
export type CohortKey = keyof typeof COHORTS;

export function isCohortKey(value: string): value is CohortKey {   // True for a known cohort name. Called by the sheet before it trusts ?list= from the URL
  return Object.hasOwn(COHORTS, value);
}

const SESSION_COUNTS = ["app_sessions", "with_telemetry", "no_telemetry", "no_end_event", "several_attempts", "failure", "failure_then_success", "success_then_failure", "reconnected", "reconnected_10", "tag_connected", "tag_failed", "tag_no_attempt"] as const;
const CLIENT_COUNTS = ["clients", "clients_connected", "clients_not_connected", "clients_alone", "clients_unknown"] as const;
export type SessionCounts = Record<(typeof SESSION_COUNTS)[number], string>;
export type ClientCounts = Record<(typeof CLIENT_COUNTS)[number], string>;

export const getSessionCounts = cache(async (range: Range): Promise<SessionCounts> => {   // Every session cohort without an argument, counted in one pass with each cohort's own condition; cache() runs it once per page load (the page passes one range object to every section). Called by SummaryCards and the attention list
  // One count per session cohort over all app sessions.
  const rows = await query<SessionCounts>(`
    SELECT ${SESSION_COUNTS.map((key) => `count(*) FILTER (WHERE ${COHORTS[key].where}) AS ${key}`).join(", ")}
    FROM ${SESSIONS}`, [range.from, range.to]);
  return rows[0];
});

export const getClientCounts = cache(async (range: Range): Promise<ClientCounts> => {   // Every client cohort without an argument, counted in one pass with each cohort's own condition; cache() runs it once per page load. Called by SummaryCards and ReasonsTable
  // One count per client cohort over all tagged client connections.
  const rows = await query<ClientCounts>(`
    SELECT ${CLIENT_COUNTS.map((key) => `count(*) FILTER (WHERE ${COHORTS[key].where}) AS ${key}`).join(", ")}
    FROM ${CLIENTS}`, [range.from, range.to]);
  return rows[0];
});

export const PAGE_SIZE = 50;

function cohortFilter(key: CohortKey, arg: string | null, range: Range, prefix?: string) {
  const cohort = COHORTS[key];
  const params = cohort.arg ? [range.from, range.to, arg] : [range.from, range.to];
  let where = cohort.where;
  if (prefix) {
    params.push(prefix + "%");
    const columns = cohort.unit === "sessions" ? ["session_id"] : ["connection_id", "session_id"];
    where += ` AND (${columns.map((column) => `s.${column}::STRING LIKE $${params.length}`).join(" OR ")})`;
  }
  return { params, where };
}

export async function getCohortCount(key: CohortKey, arg: string | null, range: Range, prefix?: string): Promise<string> {   // How many records a cohort holds. Called by the sheet's list step for its title and pages
  const { params, where } = cohortFilter(key, arg, range, prefix);
  const rows = await query<{ n: string }>(`
    SELECT count(*) AS n FROM ${COHORTS[key].unit === "sessions" ? SESSIONS : CLIENTS} WHERE ${where}`, params);
  return rows[0].n;
}

export async function getSessionPage(key: CohortKey, arg: string | null, range: Range, page: number, prefix?: string): Promise<SessionListRow[]> {   // One page (50) of a session cohort, latest first: app start and end, events, tag and client count. Called by the sheet's list step
  // The cohort's sessions, latest app start first; clients = the app's client connection records for the session.
  const { params, where } = cohortFilter(key, arg, range, prefix);
  return query<SessionListRow>(`
    SELECT s.session_id, s.started_at, s.ended_at, s.events, s.tag, s.reason,
           (SELECT count(*) FROM gamearena_source.session_client_connections c WHERE c.session_id = s.session_id) AS clients
    FROM ${SESSIONS}
    WHERE ${where}
    ORDER BY s.started_at DESC, s.session_id
    LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`, [...params, page * PAGE_SIZE]);
}

export async function getClientPage(key: CohortKey, arg: string | null, range: Range, page: number, prefix?: string): Promise<ClientListRow[]> {   // One page (50) of a client cohort, latest first: session, tag, client number, the app record's seconds and whether another client in the session connected. Called by the sheet's list step
  // The page of client connections first, then each one's client number and app timestamps from the app's records of its session.
  const { params, where } = cohortFilter(key, arg, range, prefix);
  return query<ClientListRow>(`
    WITH p AS (
      SELECT s.connection_id, s.session_id, s.started_at, s.tag, s.reason
      FROM ${CLIENTS}
      WHERE ${where}
      ORDER BY s.started_at DESC, s.connection_id
      LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}),
    c AS (
      SELECT id, connected_at, disconnected_at, row_number() OVER (PARTITION BY session_id ORDER BY connected_at, id) AS client_number
      FROM gamearena_source.session_client_connections
      WHERE session_id IN (SELECT session_id FROM p))
    SELECT p.connection_id, p.session_id, p.started_at, p.tag, p.reason, c.client_number::STRING AS client_number,
           extract(epoch FROM c.disconnected_at - c.connected_at)::INT::STRING AS seconds,
           EXISTS (SELECT 1 FROM connection_tags o WHERE o.session_id = p.session_id AND o.tag = 'connected' AND o.connection_id <> p.connection_id) AS other_connected
    FROM p LEFT JOIN c ON c.id = p.connection_id
    ORDER BY p.started_at DESC, p.connection_id`, [...params, page * PAGE_SIZE]);
}

export async function getDataDays(): Promise<{ first: string | null; last: string | null }> {   // The first and last day (UTC) of the app's sessions. Called by DateFilter to show which dates have data and limit the date boxes
  // Earliest and latest app session start day.
  const rows = await query<{ first: string | null; last: string | null }>(`
    SELECT (min(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS first,
           (max(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS last
    FROM gamearena_source.host_sessions`);
  return rows[0];
}

export async function getSessionReasons(range: Range): Promise<SessionReasonRow[]> {   // Failed sessions per reason (the session_reason cohort's condition, grouped). Called by the attention list
  // Sessions tagged failed, by the app's start in the range, grouped by the pipeline's reason.
  return query<SessionReasonRow>(`
    SELECT s.reason, count(*) AS sessions
    FROM ${SESSIONS}
    WHERE ${S} AND s.tag = 'failed'
    GROUP BY s.reason
    ORDER BY sessions DESC`, [range.from, range.to]);
}

export async function getConnectionReasons(range: Range): Promise<ClientReasonRow[]> {   // not_connected client connections per reason (the client_reason cohort's condition, grouped). Called by ReasonsTable
  // not_connected client connections grouped by the pipeline's reason, most common first.
  return query<ClientReasonRow>(`
    SELECT s.reason, count(*) AS clients, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent
    FROM ${CLIENTS}
    WHERE ${S} AND s.tag = 'not_connected'
    GROUP BY s.reason
    ORDER BY clients DESC`, [range.from, range.to]);
}

export async function getDailyConnections(range: Range): Promise<DailyConnectionRow[]> {
  return query<DailyConnectionRow>(`
    SELECT (s.started_at AT TIME ZONE 'UTC')::DATE::STRING AS day,
           count(*) FILTER (WHERE ${COHORTS.clients_not_connected.where}) AS not_connected
    FROM ${CLIENTS}
    WHERE ${COHORTS.clients.where}
    GROUP BY 1
    ORDER BY 1`, [range.from, range.to]);
}

export async function getReasonErrors(reason: string, range: Range): Promise<ReasonErrorRow[]> {   // What is inside one reason: the errors recorded on its client connections, by error + code, with the most common phase and stage. Called by the sheet's client_reason list
  // Error events of this reason's clients; per error + code: clients hit, and the most common phase + stage with its share of the times recorded. Then one row (error NULL) for the clients with no error at all. Warnings last.
  return query<ReasonErrorRow>(`
    WITH ev AS (
      SELECT ${ERROR_NAME} AS error, ${WARNING} AS warning, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage, e.connection_id
      FROM connection_tags t
      JOIN session_telemetry_events e ON e.connection_id = t.connection_id
      WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")} AND e.level = 'error'),
    per AS (SELECT error, bool_or(warning) AS warning, count(DISTINCT connection_id) AS clients, count(*) AS events FROM ev GROUP BY error),
    top AS (SELECT DISTINCT ON (error) error, phase, stage, count(*) AS n FROM ev GROUP BY error, phase, stage ORDER BY error, n DESC, phase, stage)
    SELECT * FROM (
      SELECT p.error, p.warning, p.clients, top.phase, top.stage, round(100.0 * top.n / p.events)::STRING AS top_percent
      FROM per p JOIN top ON top.error = p.error
      UNION ALL
      SELECT NULL::STRING, false, count(*), NULL::STRING, NULL::STRING, NULL::STRING
      FROM connection_tags t
      WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")}
        AND NOT EXISTS (SELECT 1 FROM session_telemetry_events e WHERE e.connection_id = t.connection_id AND e.level = 'error')
    ) evidence
    ORDER BY warning, error IS NULL, clients DESC, error`, [range.from, range.to, reason]);
}

export async function getReasonSteps(reason: string, range: Range): Promise<ReasonSteps> {   // How far one reason's clients got: how many recorded ice.gathering.complete and how many media.first_decode (every connected client has one). Called by the sheet's client_reason list
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

// Aggregate errors by app session, including host events and client-linked events.
export async function getTopSessionErrors(range: Range): Promise<SessionErrorRow[]> {
  return query<SessionErrorRow>(`
    SELECT ${ERROR_NAME} AS error, count(*) AS events, count(DISTINCT e.session_id) AS sessions
    FROM session_telemetry_events e
    JOIN gamearena_source.host_sessions h ON h.id = e.session_id
    WHERE ${RECORDED_ERROR}
    GROUP BY 1
    ORDER BY sessions DESC, events DESC, error
    LIMIT 3`, [range.from, range.to]);
}

export async function getErrorFrequency(range: Range): Promise<ErrorRow[]> {          // Each error + code in the range, counted per tagged client connection it hit, worst share first, warnings last. Called by ErrorTable (the error table Sravya asked for)
  // Error events that name a client: times recorded; tagged clients hit (the client_error cohort), untagged clients apart; of the tagged, how many didn't connect and connected anyway. % = didn't connect / (didn't connect + connected).
  return query<ErrorRow>(`
    SELECT ${ERROR_NAME} AS error,
           bool_or(${WARNING}) AS warning,
           count(*) AS events,
           count(DISTINCT CASE WHEN t.connection_id IS NOT NULL THEN e.connection_id END) AS clients,
           count(DISTINCT CASE WHEN t.connection_id IS NULL THEN e.connection_id END) AS not_tagged_clients,
           count(DISTINCT CASE WHEN t.tag = 'not_connected' THEN e.connection_id END) AS not_connected_clients,
           count(DISTINCT CASE WHEN t.tag = 'connected' THEN e.connection_id END) AS connected_clients,
           round(100.0 * count(DISTINCT CASE WHEN t.tag = 'not_connected' THEN e.connection_id END)
                 / nullif(count(DISTINCT CASE WHEN t.tag IN ('connected', 'not_connected') THEN e.connection_id END), 0), 1) AS not_connected_percent
    FROM session_telemetry_events e
    LEFT JOIN connection_tags t ON t.connection_id = e.connection_id
    WHERE e.level = 'error' AND e.connection_id IS NOT NULL AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY warning, not_connected_percent DESC NULLS LAST, not_connected_clients DESC`, [range.from, range.to]);
}

export async function getUntiedErrors(range: Range): Promise<SessionErrorRow[]> {     // Errors in the range that name no client connection (mostly setup failures before any player connected), with the sessions they happened in (the untied_error cohort). Called by ErrorTable
  // Events the app logged as errors with no connection_id: times recorded and sessions they happened in, per error + code.
  return query<SessionErrorRow>(`
    SELECT ${ERROR_NAME} AS error, count(*) AS events, count(DISTINCT e.session_id) AS sessions
    FROM session_telemetry_events e
    JOIN gamearena_source.host_sessions h ON h.id = e.session_id
    WHERE e.level = 'error' AND e.connection_id IS NULL AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY events DESC`, [range.from, range.to]);
}

export async function getErrorSeries(range: Range): Promise<ErrorSeriesRow[]> {         // Per day (UTC), not_connected client connections per error: the 5 errors that hit the most, warnings apart, the rest as one "Other" series. day NULL = the whole range. Called by ErrorTrend for the chart and its key
  // Rank the non-warning errors by clients over the range, keep the top 5 names, fold the rest into "Other", then count distinct clients per day and over the range.
  return query<ErrorSeriesRow>(`
    WITH ev AS (
      SELECT (e.recorded_at AT TIME ZONE 'UTC')::DATE::STRING AS day, ${ERROR_NAME} AS error, ${WARNING} AS warning, e.connection_id
      FROM session_telemetry_events e
      JOIN connection_tags t ON t.connection_id = e.connection_id
      WHERE e.level = 'error' AND t.tag = 'not_connected' AND ${IN_RANGE("e.recorded_at")}),
    ranked AS (SELECT error, row_number() OVER (ORDER BY count(DISTINCT connection_id) DESC, error) AS n FROM ev WHERE NOT warning GROUP BY error),
    named AS (SELECT ev.day, CASE WHEN ev.warning OR r.n <= 5 THEN ev.error ELSE 'Other' END AS series, ev.warning, ev.connection_id
              FROM ev LEFT JOIN ranked r ON r.error = ev.error)
    SELECT day, series, bool_or(warning) AS warning, count(DISTINCT connection_id) AS clients FROM named GROUP BY day, series
    UNION ALL
    SELECT NULL, series, bool_or(warning), count(DISTINCT connection_id) FROM named GROUP BY series
    ORDER BY 1, 2`, [range.from, range.to]);
}

export async function getErrorKey(range: Range): Promise<ErrorKeyRow[]> {   // For each error + code in the chart: the clients it hit over the whole range, and the app's message, phases, stages and own error text with how often each was recorded. Called by ErrorTrend for the key under the chart
  // The chart's errors (same filter as getErrorSeries); field "clients" = distinct clients over the range (events holds the count), then one row per error and each value of message, phase, stage and text (payload "reason" or "errorText").
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

export async function searchIds(prefix: string): Promise<SearchRow[]> {   // App sessions and client connections whose ID starts with prefix (8 to 36 lowercase hex or dash characters, checked by the caller), at most 20 of each. Called by the page (one match opens it) and the sheet's search step
  // Sessions, then client connections (with their session), by ID prefix; all telemetry sessions and tagged clients are in these app tables.
  return query<SearchRow>(`
    (SELECT 'session' AS kind, id::STRING AS id, id::STRING AS session_id FROM gamearena_source.host_sessions WHERE id::STRING LIKE $1 ORDER BY id LIMIT 20)
    UNION ALL
    (SELECT 'client', id::STRING, session_id::STRING FROM gamearena_source.session_client_connections WHERE id::STRING LIKE $1 ORDER BY id LIMIT 20)`, [`${prefix}%`]);
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

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | undefined> {   // One session: the app's own start, end and end reason, the pipeline's tag if any, and its event, error and warning counts (ice.candidate.error counts as a warning). Called by SessionView; undefined = no app record and no events
  // Start from the wanted ID so a session found in only one place still returns a row; the app record and the tag are each joined on if they exist.
  const rows = await query<SessionDetail>(`
    SELECT h.id IS NOT NULL AS in_app, h.started_at, h.ended_at, h.end_reason, t.tag, t.reason,
           e.first_event_at, e.events, e.error_events, e.warn_events, e.has_end_event
    FROM (SELECT $1::UUID AS id) wanted
    LEFT JOIN gamearena_source.host_sessions h ON h.id = wanted.id
    LEFT JOIN session_tags t ON t.session_id = wanted.id
    CROSS JOIN (SELECT min(e.recorded_at) AS first_event_at, count(*) AS events,
                       count(*) FILTER (WHERE e.level = 'error' AND NOT ${WARNING}) AS error_events,
                       count(*) FILTER (WHERE e.level = 'warn' OR ${WARNING}) AS warn_events,
                       coalesce(bool_or(e.event_type = 'session_ended'), false) AS has_end_event
                FROM session_telemetry_events e WHERE e.session_id = $1) e
    WHERE h.id IS NOT NULL OR e.events > 0`, [sessionId]);
  return rows[0];
}

export async function getClientConnections(sessionId: string): Promise<ClientConnectionRow[]> {   // One session's client connections with device, OS, browser and the pipeline's tag for each. Called by SessionView, because a session can have several
  // Client connections from the app, in the order they connected, with connection_tags joined on (missing = not tagged).
  return query<ClientConnectionRow>(`
    SELECT c.id AS connection_id, c.connected_at, c.disconnected_at, c.auth_type::STRING AS auth_type,
           ${DEVICE} AS device, ${OS} AS os, ${BROWSER} AS browser, t.tag, t.reason
    FROM (SELECT *, user_agent AS u FROM gamearena_source.session_client_connections WHERE session_id = $1) c
    LEFT JOIN connection_tags t ON t.connection_id = c.id
    ORDER BY c.connected_at, c.id`, [sessionId]);
}

export const EVENT_PAGE_SIZE = 100;
export const ERROR_LIMIT = 1000;

// One session's events in time order ($1 = session), with only the safe payload fields; where narrows the events, limit pages them.
const TIMELINE = (where: string, limit: string) => `
    SELECT e.recorded_at,
           CASE e.source WHEN 'system' THEN 'Server' WHEN 'host' THEN 'Host' ELSE 'Client' END AS sent_by,
           CASE WHEN c.client_number IS NOT NULL THEN 'Client ' || c.client_number::STRING
                WHEN e.connection_role = 'host' THEN 'Host'
                WHEN e.connection_role = 'client' THEN 'A client'
                ELSE '-' END AS connection,
           e.level::STRING AS level,
           ${EVENT} AS event,
           e.payload->>'category' AS category, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage,
           e.payload->>'code' AS code, e.payload->>'errorCode' AS error_code, e.payload->>'errorText' AS error_text,
           e.payload->>'prev' AS prev, e.payload->>'state' AS state, e.payload->>'attempt' AS attempt,
           e.payload->>'auth_type' AS auth_type, e.payload->>'mode' AS mode, e.payload->>'end_reason' AS end_reason,
           e.message, e.payload->>'reason' AS reason
    FROM session_telemetry_events e
    LEFT JOIN (SELECT id, row_number() OVER (ORDER BY connected_at, id) AS client_number
               FROM gamearena_source.session_client_connections WHERE session_id = $1) c ON c.id = e.connection_id
    WHERE e.session_id = $1 ${where}
    ORDER BY e.recorded_at, e.id
    ${limit}`;

export async function getErrorEvents(sessionId: string): Promise<TimelineRow[]> {   // One session's error-level events in time order (ice.candidate.error left out: it is shown with the warnings), read on their own so warnings or the event pages can never push an error out (no session has more than 1,000; SessionDetail has the real count). Called by SessionTimeline
  // Each error event: when, who sent it, which connection, and the known fields. connected_to, url and newSessionId are never read.
  return query<TimelineRow>(TIMELINE(`AND e.level = 'error' AND NOT ${WARNING}`, `LIMIT ${ERROR_LIMIT}`), [sessionId]);
}

export async function getWarningSummary(sessionId: string): Promise<WarningRow[]> {   // One session's warnings plus ice.candidate.error, one row per event name with its count and first and last time, so thousands of repeats read as one line. Called by SessionTimeline
  // Warning-level events and ice.candidate.error grouped by name, most frequent first, ice.candidate.error last.
  return query<WarningRow>(`
    SELECT ${EVENT} AS event, bool_or(${WARNING}) AS warning, count(*) AS events, min(e.recorded_at) AS first_at, max(e.recorded_at) AS last_at
    FROM session_telemetry_events e
    WHERE e.session_id = $1 AND (e.level = 'warn' OR ${WARNING})
    GROUP BY 1
    ORDER BY warning, events DESC, event`, [sessionId]);
}

export async function getEventPage(sessionId: string, page: number): Promise<TimelineRow[]> {   // One page (100) of a session's events in time order. Called by SessionTimeline for "All events"
  // Every event of the session, page by page, with the same fields as getErrorEvents.
  return query<TimelineRow>(TIMELINE("", `LIMIT ${EVENT_PAGE_SIZE} OFFSET $2`), [sessionId, page * EVENT_PAGE_SIZE]);
}
