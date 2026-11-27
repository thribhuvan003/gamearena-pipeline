// queries.ts: every read-only SQL the dashboard runs. Every clickable number is a cohort: one condition used for both its count and its list.

import { connection } from "next/server";
import { Pool, type QueryResultRow } from "pg";
import { cache } from "react";
import { requireDashboardAccess } from "./auth/access";

// One connection pool, with the same settings and defaults as the pipeline.
const pool = new Pool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 26257),
  database: process.env.DB_NAME ?? "gamearena_analytics",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD,
});

async function query<Row extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<Row[]> {   // Runs one SELECT after the sign-in check; never cached, so numbers are live
  await connection();
  await requireDashboardAccess();
  const result = await pool.query<Row>(sql, params);
  return result.rows;
}

// ---------- Row types (counts come back from CockroachDB as text) ----------

// A date range picked on the page: "YYYY-MM-DD" days in UTC, both included; null = no limit on that side.
export type Range = { from: string | null; to: string | null };

type DailyConnectionRow = { day: string; clients: string; not_connected: string };
export type ClientLabelRow = { kind: "device" | "os" | "browser" | "access"; value: string; clients: string; connected: string; not_connected: string };
type ClientReasonRow = { reason: string; clients: string; percent: string };
type SessionReasonRow = { reason: string; sessions: string };
export type EvidenceRow = { event: string | null; level: string | null; count: string };
export type WarningCountRow = { event: string; clients: string };
type ReasonProgress = { clients: string; gathered: string; decoded: string };
export type ErrorRow = { error: string; warning: boolean; clients: string };
export type FailedComboRow = { combo: string; sessions: string };
export type FailedSessionErrorRow = { error: string; sessions: string; phase: string | null; stage: string | null; detail: string | null };
type ReasonSeriesRow = { day: string | null; reason: string; clients: string };
export type SessionListRow = { session_id: string; started_at: Date; ended_at: Date | null; events: string | null; has_end: boolean; tag: string | null; reason: string | null; clients: string };
export type ClientListRow = {
  connection_id: string; session_id: string; started_at: Date; tag: string; reason: string | null;
  client_number: string | null; seconds: string | null; other_connected: boolean;
};
export type SearchRow = { kind: "session" | "client"; id: string; session_id: string };
export type SessionDetail = {
  in_app: boolean; started_at: Date | null; ended_at: Date | null; end_reason: string | null;
  tag: string | null; reason: string | null; first_event_at: Date | null; events: string; error_events: string; warn_events: string; has_end_event: boolean;
  failure_no_client: boolean | null;
};
type WarningRow = { event: string; connection: string; warning: boolean; events: string; first_at: Date; last_at: Date };
export type ClientConnectionRow = {
  connection_id: string; connected_at: Date; disconnected_at: Date | null; auth_type: string;
  device: string; os: string; browser: string; tag: string | null; reason: string | null;
};
export type TimelineRow = {
  recorded_at: Date; sent_by: string; connection: string; level: string; event: string; category: string | null; phase: string | null;
  stage: string | null; code: string | null; error_code: string | null; error_text: string | null; prev: string | null; state: string | null; attempt: string | null;
  auth_type: string | null; mode: string | null; end_reason: string | null; message: string | null; reason: string | null;
};

// ---------- Shared SQL pieces ----------
// Use count(DISTINCT CASE WHEN … END), not count(DISTINCT …) FILTER: CockroachDB 26.3.4 miscounts the FILTER form.

// The date filter: $1 = first day, $2 = last day (included); each is skipped when null.
const IN_RANGE = (column: string) =>
  `($1::DATE IS NULL OR ${column} >= ($1::DATE::TIMESTAMP AT TIME ZONE 'UTC')) AND ($2::DATE IS NULL OR ${column} < (($2::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC'))`;
const STARTED_IN_RANGE = IN_RANGE("s.started_at");

// A raw event's name (alias e); ice.candidate.error counts as a warning, as most clients that hit it still connect.
const RAW_EVENT = `coalesce(e.payload->>'event', e.event_type::STRING)`;
const RAW_IS_WARNING = `(${RAW_EVENT} = 'ice.candidate.error')`;

// The same two for error_events, the pipeline's copy of the error-level events: error + code, e.g. "pipeline.connect.failure 500".
const ERROR_NAME = `e.event || coalesce(' → ' || e.state, '') || coalesce(' ' || coalesce(e.code, e.error_code), '')`;
// The same signature read straight from a raw event (for warnings, which error_events doesn't copy).
const RAW_NAME = `coalesce(e.payload->>'event', e.event_type::STRING) || coalesce(' → ' || (e.payload->>'state'), '') || coalesce(' ' || coalesce(e.payload->>'code', e.payload->>'errorCode'), '')`;
// A warn-level event (or ice.candidate.error) with this signature ($3) in the range, logged by this client itself (raw events).
// The exact set of errors a session logged with no client ID, as one string ("a + b", sorted); NULL if none.
const FAILED_COMBO = `(SELECT string_agg(sig, ' + ' ORDER BY sig) FROM (SELECT DISTINCT ${ERROR_NAME} AS sig FROM error_events e
  WHERE e.session_id = s.session_id AND e.connection_id IS NULL) x)`;
const WARNING_ON = `EXISTS (SELECT 1 FROM session_telemetry_events e WHERE e.session_id = s.session_id AND e.connection_id = s.connection_id
  AND (e.level = 'warn' OR ${RAW_IS_WARNING}) AND ${RAW_NAME} = $3 AND ${IN_RANGE("e.recorded_at")})`;
const IS_WARNING = `(e.event = 'ice.candidate.error')`;

// Every app session (host_sessions) with the pipeline's facts (events NULL = no telemetry) and tag, as alias s.
const SESSIONS = `(
  SELECT h.id AS session_id, h.started_at, h.ended_at, h.end_reason, t.tag, t.reason,
         f.events, coalesce(f.has_end, false) AS has_end, coalesce(f.attempts, 0) AS attempts,
         f.first_failure, f.last_failure, f.first_success, f.last_success, coalesce(f.reconnects, 0) AS reconnects
  FROM gamearena_source.host_sessions h
  LEFT JOIN session_facts f ON f.session_id = h.id
  LEFT JOIN session_tags t ON t.session_id = h.id) s`;

// Every tagged client connection, as alias s.
const CLIENTS = `(SELECT connection_id, session_id, started_at, tag, reason, device, os, browser, access, gathered, decoded FROM connection_tags) s`;

// One client's stored label of a kind ($3 = "kind|value", kind = device, os, browser or access).
const CLIENT_LABEL = `CASE split_part($3, '|', 1) WHEN 'device' THEN s.device WHEN 'os' THEN s.os WHEN 'browser' THEN s.browser ELSE s.access END`;

// An error with this error + code ($3), recorded in the range, on this session with no client named (tied false) or on this client (tied true).
const ERROR_ON = (link: string, tied: boolean) =>
  `EXISTS (SELECT 1 FROM error_events e WHERE ${link} AND e.connection_id IS ${tied ? "NOT NULL" : "NULL"} AND ${ERROR_NAME} = $3 AND ${IN_RANGE("e.recorded_at")})`;

// ---------- Cohorts: every clickable number and the list it opens ----------

// What a number counts: app sessions or tagged client connections, never a mix. where = the whole condition on s; $3 = the argument when arg is true.
type Unit = "sessions" | "clients";
type Cohort = { unit: Unit; title: string; arg: boolean; where: string };

export const COHORTS = {
  app_sessions: { unit: "sessions", title: "App sessions", arg: false, where: STARTED_IN_RANGE },
  with_telemetry: { unit: "sessions", title: "App sessions with telemetry events", arg: false, where: `${STARTED_IN_RANGE} AND s.events IS NOT NULL` },
  no_telemetry: { unit: "sessions", title: "App sessions with no telemetry events", arg: false, where: `${STARTED_IN_RANGE} AND s.events IS NULL` },
  failed_session_errors: { unit: "sessions", title: "Sessions that didn't connect and logged, with no client ID", arg: true, where: `${STARTED_IN_RANGE} AND s.tag = 'failed' AND ${FAILED_COMBO} = $3` },
  failed_client_error_only: { unit: "sessions", title: "Sessions that didn't connect and logged errors only with a client ID", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'failed' AND NOT EXISTS (SELECT 1 FROM error_events e WHERE e.session_id = s.session_id AND e.connection_id IS NULL) AND EXISTS (SELECT 1 FROM error_events e WHERE e.session_id = s.session_id)` },
  failed_no_error: { unit: "sessions", title: "Sessions that didn't connect and logged no error", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'failed' AND NOT EXISTS (SELECT 1 FROM error_events e WHERE e.session_id = s.session_id)` },
  tag_connected: { unit: "sessions", title: "Sessions that connected", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'connected'` },
  tag_failed: { unit: "sessions", title: "Sessions that didn't connect", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'failed'` },
  no_end_event: { unit: "sessions", title: "Sessions with events but no session_ended logged", arg: false, where: `${STARTED_IN_RANGE} AND s.events IS NOT NULL AND NOT s.has_end` },
  tag_no_attempt: { unit: "sessions", title: "Ended sessions with no connection attempt logged", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'no_attempt'` },
  session_reason: { unit: "sessions", title: "Sessions that didn't connect", arg: true, where: `${STARTED_IN_RANGE} AND s.tag = 'failed' AND s.reason = $3` },
  clients: { unit: "clients", title: "Client connections with telemetry", arg: false, where: STARTED_IN_RANGE },
  clients_connected: { unit: "clients", title: "Clients that connected", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'connected'` },
  clients_not_connected: { unit: "clients", title: "Clients that didn't connect", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'not_connected'` },
  clients_unknown: { unit: "clients", title: "Clients with no app events before session_ended", arg: false, where: `${STARTED_IN_RANGE} AND s.tag = 'unknown'` },
  client_reason: { unit: "clients", title: "Clients that didn't connect", arg: true, where: `${STARTED_IN_RANGE} AND s.tag = 'not_connected' AND s.reason = $3` },
  client_label: { unit: "clients", title: "Clients that didn't connect", arg: true, where: `${STARTED_IN_RANGE} AND s.tag = 'not_connected' AND ${CLIENT_LABEL} = substring($3 FROM position('|' IN $3) + 1)` },
  client_logged: { unit: "clients", title: "Clients that logged", arg: true, where: ERROR_ON("e.connection_id = s.connection_id", true) },
  client_warning: { unit: "clients", title: "Clients that logged", arg: true, where: WARNING_ON },
} satisfies Record<string, Cohort>;
export type CohortKey = keyof typeof COHORTS;

export function isCohortKey(value: string): value is CohortKey {   // True for a known cohort name; the sheet checks ?list= with it
  return Object.hasOwn(COHORTS, value);
}

const SESSION_COUNTS = ["app_sessions", "with_telemetry", "no_telemetry", "tag_connected", "tag_failed", "no_end_event", "tag_no_attempt", "failed_client_error_only", "failed_no_error"] as const;
const CLIENT_COUNTS = ["clients", "clients_connected", "clients_not_connected", "clients_unknown"] as const;

async function countEach<Key extends CohortKey>(keys: readonly Key[], rows: string, range: Range): Promise<Record<Key, string>> {   // One count per cohort, all in one pass over the same rows
  const result = await query<Record<Key, string>>(`
    SELECT ${keys.map((key) => `count(*) FILTER (WHERE ${COHORTS[key].where}) AS ${key}`).join(", ")}
    FROM ${rows}`, [range.from, range.to]);
  return result[0];
}

// cache() runs each once per page load; the page passes one range object to every section.
export const getSessionCounts = cache((range: Range) => countEach(SESSION_COUNTS, SESSIONS, range));   // Every session number without an argument
export const getClientCounts = cache((range: Range) => countEach(CLIENT_COUNTS, CLIENTS, range));      // Every client number without an argument

export const PAGE_SIZE = 50;

function cohortFilter(key: CohortKey, arg: string | null, range: Range, prefix?: string) {   // A cohort's condition and parameters, narrowed to IDs starting with prefix
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

export async function getCohortCount(key: CohortKey, arg: string | null, range: Range, prefix?: string): Promise<string> {   // How many records a list holds
  const { params, where } = cohortFilter(key, arg, range, prefix);
  const rows = await query<{ n: string }>(`
    SELECT count(*) AS n FROM ${COHORTS[key].unit === "sessions" ? SESSIONS : CLIENTS} WHERE ${where}`, params);
  return rows[0].n;
}

export async function getSessionPage(key: CohortKey, arg: string | null, range: Range, page: number, prefix?: string): Promise<SessionListRow[]> {   // One page of a session list, latest first, with its client count
  const { params, where } = cohortFilter(key, arg, range, prefix);
  return query<SessionListRow>(`
    SELECT s.session_id, s.started_at, s.ended_at, s.events, s.has_end, s.tag, s.reason,
           (SELECT count(*) FROM gamearena_source.session_client_connections c WHERE c.session_id = s.session_id) AS clients
    FROM ${SESSIONS}
    WHERE ${where}
    ORDER BY s.started_at DESC, s.session_id
    LIMIT ${PAGE_SIZE} OFFSET $${params.length + 1}`, [...params, page * PAGE_SIZE]);
}

export async function getClientPage(key: CohortKey, arg: string | null, range: Range, page: number, prefix?: string): Promise<ClientListRow[]> {   // One page of a client list, latest first, with client number, app seconds and "another client connected"
  const { params, where } = cohortFilter(key, arg, range, prefix);
  return query<ClientListRow>(`
    WITH p AS (
      SELECT s.connection_id, s.session_id, s.started_at, s.tag, s.reason AS reason
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

// ---------- Header ----------

export async function getDataDays(): Promise<{ first: string | null; last: string | null }> {   // First and last day (UTC) of the app's sessions, for the date filter
  const rows = await query<{ first: string | null; last: string | null }>(`
    SELECT (min(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS first,
           (max(started_at) AT TIME ZONE 'UTC')::DATE::STRING AS last
    FROM gamearena_source.host_sessions`);
  return rows[0];
}

// ---------- Overview ----------

export async function getConnectionReasons(range: Range): Promise<ClientReasonRow[]> {   // Clients that didn't connect, per reason, with their share (the clients_not_connected condition)
  return query<ClientReasonRow>(`
    SELECT s.reason AS reason, count(*) AS clients, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS percent
    FROM ${CLIENTS}
    WHERE ${COHORTS.clients_not_connected.where}
    GROUP BY 1
    ORDER BY bool_or(s.reason = 'no_video'), clients DESC, reason`, [range.from, range.to]);
}

export async function getSessionReasons(range: Range): Promise<SessionReasonRow[]> {   // Sessions that didn't connect, per reason (the tag_failed condition)
  return query<SessionReasonRow>(`
    SELECT s.reason, count(*) AS sessions
    FROM ${SESSIONS}
    WHERE ${COHORTS.tag_failed.where}
    GROUP BY s.reason
    ORDER BY sessions DESC`, [range.from, range.to]);
}

export async function getErrorFrequency(range: Range): Promise<ErrorRow[]> {   // Each error clients logged (event, state, code), with the clients that logged it
  return query<ErrorRow>(`
    SELECT ${ERROR_NAME} AS error, bool_or(${IS_WARNING}) AS warning, count(DISTINCT e.connection_id) AS clients
    FROM error_events e
    JOIN connection_tags t ON t.connection_id = e.connection_id
    WHERE ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY clients DESC, error`, [range.from, range.to]);
}

// cache(): the device and browser cards share one query per page load.
export const getClientsByLabel = cache(async (range: Range): Promise<ClientLabelRow[]> => {   // Tagged clients per stored device, OS, browser and access type, with how many connected or didn't
  return query<ClientLabelRow>(`
    WITH c AS (SELECT s.tag, s.device, s.os, s.browser, s.access FROM ${CLIENTS} WHERE ${STARTED_IN_RANGE})
    SELECT kind, value, count(*) AS clients, count(*) FILTER (WHERE tag = 'connected') AS connected, count(*) FILTER (WHERE tag = 'not_connected') AS not_connected
    FROM (SELECT 'device' AS kind, device AS value, tag FROM c UNION ALL SELECT 'os', os, tag FROM c
          UNION ALL SELECT 'browser', browser, tag FROM c UNION ALL SELECT 'access', access, tag FROM c) k
    GROUP BY kind, value
    ORDER BY kind, clients DESC, value`, [range.from, range.to]);
});

// ---------- Trends ----------

export async function getDailyConnections(range: Range): Promise<DailyConnectionRow[]> {   // Per day (UTC, client's first event): tracked clients and how many didn't connect
  return query<DailyConnectionRow>(`
    SELECT (s.started_at AT TIME ZONE 'UTC')::DATE::STRING AS day, count(*) AS clients,
           count(*) FILTER (WHERE ${COHORTS.clients_not_connected.where}) AS not_connected
    FROM ${CLIENTS}
    WHERE ${COHORTS.clients.where}
    GROUP BY 1
    ORDER BY 1`, [range.from, range.to]);
}

export async function getReasonSeries(range: Range): Promise<ReasonSeriesRow[]> {   // Per day (UTC, client's first event, as the daily totals), clients that didn't connect per reason; day NULL = whole range
  return query<ReasonSeriesRow>(`
    SELECT (s.started_at AT TIME ZONE 'UTC')::DATE::STRING AS day, s.reason, count(*) AS clients
    FROM ${CLIENTS}
    WHERE ${COHORTS.clients_not_connected.where}
    GROUP BY 1, 2
    UNION ALL
    SELECT NULL::STRING, s.reason, count(*)
    FROM ${CLIENTS}
    WHERE ${COHORTS.clients_not_connected.where}
    GROUP BY 2
    ORDER BY 1, 2`, [range.from, range.to]);
}

// ---------- Sheet: inside one reason ----------

export async function getFailedSessionCombos(range: Range): Promise<FailedComboRow[]> {   // Sessions that didn't connect, each once, by the exact set of errors they logged with no client ID
  return query<FailedComboRow>(`
    SELECT ${FAILED_COMBO} AS combo, count(*) AS sessions
    FROM ${SESSIONS}
    WHERE ${STARTED_IN_RANGE} AND s.tag = 'failed' AND ${FAILED_COMBO} IS NOT NULL
    GROUP BY 1
    ORDER BY sessions DESC, combo`, [range.from, range.to]);
}

export async function getFailedSessionErrors(range: Range): Promise<FailedSessionErrorRow[]> {   // Errors with no client ID in sessions that didn't connect (by session start): sessions, and the most common phase, stage and message
  return query<FailedSessionErrorRow>(`
    WITH ev AS (
      SELECT ${ERROR_NAME} AS error, s.session_id, e.phase, e.stage, e.detail
      FROM ${SESSIONS}
      JOIN error_events e ON e.session_id = s.session_id AND e.connection_id IS NULL
      WHERE ${STARTED_IN_RANGE} AND s.tag = 'failed'),
    per AS (SELECT error, count(DISTINCT session_id) AS sessions FROM ev GROUP BY error),
    top AS (SELECT DISTINCT ON (error) error, phase, stage, detail FROM ev GROUP BY error, phase, stage, detail ORDER BY error, count(*) DESC, phase, stage, detail)
    SELECT p.error, p.sessions, top.phase, top.stage, top.detail
    FROM per p JOIN top ON top.error = p.error
    ORDER BY p.sessions DESC, p.error`, [range.from, range.to]);
}

export async function getWarnings(range: Range): Promise<WarningCountRow[]> {   // Each warning on clients' own connections (warn level, and ice.candidate.error), from the raw events, with the clients that had it
  return query<WarningCountRow>(`
    SELECT ${RAW_NAME} AS event, count(DISTINCT t.connection_id) AS clients
    FROM session_telemetry_events e
    JOIN connection_tags t ON t.session_id = e.session_id AND t.connection_id = e.connection_id
    WHERE (e.level = 'warn' OR ${RAW_IS_WARNING}) AND ${IN_RANGE("e.recorded_at")}
    GROUP BY 1
    ORDER BY clients DESC, 1`, [range.from, range.to]);
}

export async function getReasonEvents(reason: string, range: Range): Promise<EvidenceRow[]> {   // A client reason's evidence: each warn or error event the clients logged themselves (state and code included), then those that logged none
  return query<EvidenceRow>(`
    SELECT * FROM (
      SELECT ${RAW_NAME} AS event, e.level::STRING AS level, count(DISTINCT t.connection_id) AS count
      FROM connection_tags t
      JOIN session_telemetry_events e ON e.session_id = t.session_id AND e.connection_id = t.connection_id
      WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")} AND e.level IN ('warn', 'error')
      GROUP BY 1, 2
      UNION ALL
      SELECT NULL::STRING, NULL::STRING, count(*)
      FROM connection_tags t
      WHERE t.tag = 'not_connected' AND t.reason = $3 AND ${IN_RANGE("t.started_at")}
        AND NOT EXISTS (SELECT 1 FROM session_telemetry_events e
                        WHERE e.session_id = t.session_id AND e.connection_id = t.connection_id AND e.level IN ('warn', 'error'))
    ) evidence
    ORDER BY event IS NULL, level = 'warn', count DESC, event`, [range.from, range.to, reason]);
}

export async function getSessionReasonEvents(reason: string, range: Range): Promise<EvidenceRow[]> {   // A session reason's evidence: each error the sessions logged (any client or none), then those that logged none
  return query<EvidenceRow>(`
    SELECT * FROM (
      SELECT ${ERROR_NAME} || CASE WHEN e.connection_id IS NULL THEN ' (no client ID)' ELSE '' END AS event, 'error' AS level, count(DISTINCT s.session_id) AS count
      FROM ${SESSIONS}
      JOIN error_events e ON e.session_id = s.session_id
      WHERE ${COHORTS.session_reason.where}
      GROUP BY 1
      UNION ALL
      SELECT NULL::STRING, NULL::STRING, count(*)
      FROM ${SESSIONS}
      WHERE ${COHORTS.session_reason.where} AND NOT EXISTS (SELECT 1 FROM error_events e WHERE e.session_id = s.session_id)
    ) evidence
    ORDER BY event IS NULL, count DESC, event`, [range.from, range.to, reason]);
}

export async function getReasonProgress(reason: string, range: Range): Promise<ReasonProgress> {   // How far a reason's clients got: network discovery done, first video frame decoded (stored by the pipeline)
  const rows = await query<ReasonProgress>(`
    SELECT count(*) AS clients, count(*) FILTER (WHERE s.gathered) AS gathered, count(*) FILTER (WHERE s.decoded) AS decoded
    FROM ${CLIENTS}
    WHERE ${STARTED_IN_RANGE} AND s.tag = 'not_connected' AND s.reason = $3`, [range.from, range.to, reason]);
  return rows[0];
}

// ---------- Search ----------

export async function searchIds(prefix: string): Promise<SearchRow[]> {   // Sessions and client connections whose ID starts with prefix, 20 of each, by index range
  const [low, high] = uuidBounds(prefix);
  return query<SearchRow>(`
    (SELECT 'session' AS kind, id::STRING AS id, id::STRING AS session_id FROM gamearena_source.host_sessions WHERE id BETWEEN $1::UUID AND $2::UUID ORDER BY id LIMIT 20)
    UNION ALL
    (SELECT 'client', id::STRING, session_id::STRING FROM gamearena_source.session_client_connections WHERE id BETWEEN $1::UUID AND $2::UUID ORDER BY id LIMIT 20)`, [low, high]);
}

function uuidBounds(prefix: string): [string, string] {   // Lowest and highest UUID starting with these hex digits, e.g. 1a2b3c4d-0000-… to 1a2b3c4d-ffff-…
  const hex = prefix.replaceAll("-", "").slice(0, 32);
  const shape = (digits: string) => `${digits.slice(0, 8)}-${digits.slice(8, 12)}-${digits.slice(12, 16)}-${digits.slice(16, 20)}-${digits.slice(20)}`;
  return [shape(hex.padEnd(32, "0")), shape(hex.padEnd(32, "f"))];
}

// ---------- Session ----------

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | undefined> {   // One session: app record, tag, event counts, and whether its last connect failure named no client
  // Starts from the wanted ID, so a session found in one place only still returns a row; failure_no_client stops at session_ended.
  const rows = await query<SessionDetail>(`
    SELECT h.id IS NOT NULL AS in_app, h.started_at, h.ended_at, h.end_reason, t.tag, t.reason,
           e.first_event_at, e.events, e.error_events, e.warn_events, e.has_end_event,
           (SELECT f.connection_id IS NULL FROM session_telemetry_events f
            WHERE f.session_id = $1 AND coalesce(f.payload->>'event', f.event_type::STRING) = 'pipeline.connect.failure'
              AND f.recorded_at <= (SELECT coalesce(min(x.recorded_at), 'infinity') FROM session_telemetry_events x WHERE x.session_id = $1 AND x.event_type = 'session_ended')
            ORDER BY f.recorded_at DESC, f.id DESC LIMIT 1) AS failure_no_client
    FROM (SELECT $1::UUID AS id) wanted
    LEFT JOIN gamearena_source.host_sessions h ON h.id = wanted.id
    LEFT JOIN session_tags t ON t.session_id = wanted.id
    CROSS JOIN (SELECT min(e.recorded_at) AS first_event_at, count(*) AS events,
                       count(*) FILTER (WHERE e.level = 'error' AND NOT ${RAW_IS_WARNING}) AS error_events,
                       count(*) FILTER (WHERE e.level = 'warn' OR ${RAW_IS_WARNING}) AS warn_events,
                       coalesce(bool_or(e.event_type = 'session_ended'), false) AS has_end_event
                FROM session_telemetry_events e WHERE e.session_id = $1) e
    WHERE h.id IS NOT NULL OR e.events > 0`, [sessionId]);
  return rows[0];
}

export async function getClientConnections(sessionId: string): Promise<ClientConnectionRow[]> {   // A session's client connections in connect order, with their stored device, OS, browser and tag
  return query<ClientConnectionRow>(`
    SELECT c.id AS connection_id, c.connected_at, c.disconnected_at, c.auth_type::STRING AS auth_type,
           coalesce(t.device, 'Unknown') AS device, coalesce(t.os, 'Unknown') AS os, coalesce(t.browser, 'Unknown') AS browser, t.tag, t.reason AS reason
    FROM gamearena_source.session_client_connections c
    LEFT JOIN connection_tags t ON t.connection_id = c.id
    WHERE c.session_id = $1
    ORDER BY c.connected_at, c.id`, [sessionId]);
}

export const EVENT_PAGE_SIZE = 100;
export const ERROR_LIMIT = 1000;

// Which client an event of session $1 belongs to, numbered in connect order ("Client 2"), else Host or "-"; needs EVENT_CLIENT_JOIN.
const EVENT_CLIENT = `CASE WHEN c.client_number IS NOT NULL THEN 'Client ' || c.client_number::STRING
                WHEN e.connection_role = 'host' THEN 'Host'
                WHEN e.connection_role = 'client' THEN 'A client'
                ELSE '-' END`;
const EVENT_CLIENT_JOIN = `LEFT JOIN (SELECT id, row_number() OVER (ORDER BY connected_at, id) AS client_number
               FROM gamearena_source.session_client_connections WHERE session_id = $1) c ON c.id = e.connection_id`;

// One session's events in time order ($1 = session) with only the safe payload fields; where narrows them, limit pages them.
const TIMELINE = (where: string, limit: string) => `
    SELECT e.recorded_at,
           CASE e.source WHEN 'system' THEN 'Server' WHEN 'host' THEN 'Host' ELSE 'Client' END AS sent_by,
           ${EVENT_CLIENT} AS connection,
           e.level::STRING AS level,
           ${RAW_EVENT} AS event,
           e.payload->>'category' AS category, e.payload->>'phase' AS phase, e.payload->>'stage' AS stage,
           e.payload->>'code' AS code, e.payload->>'errorCode' AS error_code, e.payload->>'errorText' AS error_text,
           e.payload->>'prev' AS prev, e.payload->>'state' AS state, e.payload->>'attempt' AS attempt,
           e.payload->>'auth_type' AS auth_type, e.payload->>'mode' AS mode, e.payload->>'end_reason' AS end_reason,
           e.message, e.payload->>'reason' AS reason
    FROM session_telemetry_events e
    ${EVENT_CLIENT_JOIN}
    WHERE e.session_id = $1 ${where}
    ORDER BY e.recorded_at, e.id
    ${limit}`;

export async function getErrorEvents(sessionId: string): Promise<TimelineRow[]> {   // A session's errors, read on their own so no warning or page can push one out (ice.candidate.error goes with warnings)
  return query<TimelineRow>(TIMELINE(`AND e.level = 'error' AND NOT ${RAW_IS_WARNING}`, `LIMIT ${ERROR_LIMIT}`), [sessionId]);
}

export async function getWarningSummary(sessionId: string): Promise<WarningRow[]> {   // A session's warnings (and ice.candidate.error), one row per event name and client, with count, first and last time
  return query<WarningRow>(`
    SELECT ${RAW_EVENT} AS event, ${EVENT_CLIENT} AS connection, bool_or(${RAW_IS_WARNING}) AS warning, count(*) AS events,
           min(e.recorded_at) AS first_at, max(e.recorded_at) AS last_at
    FROM session_telemetry_events e
    ${EVENT_CLIENT_JOIN}
    WHERE e.session_id = $1 AND (e.level = 'warn' OR ${RAW_IS_WARNING})
    GROUP BY 1, 2
    ORDER BY warning, min(e.recorded_at), event`, [sessionId]);
}

export async function getEventPage(sessionId: string, page: number): Promise<TimelineRow[]> {   // One page (100) of all a session's events, in time order
  return query<TimelineRow>(TIMELINE("", `LIMIT ${EVENT_PAGE_SIZE} OFFSET $2`), [sessionId, page * EVENT_PAGE_SIZE]);
}
