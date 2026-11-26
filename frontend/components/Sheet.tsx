// Sheet.tsx: the side sheet: one session, the records behind a clicked number, or the results of an ID search.

import Link from "next/link";
import type { ReactNode } from "react";
import Pager from "./Pager";
import SessionView from "./SessionView";
import SheetFrame from "./SheetFrame";
import { cohortExplanation, eventLabel, formatNumber, formatSeconds, formatTime, reasonLabel, shortId, tagText } from "@/lib/format";
import { isUuid, link, linkString, searchPrefix, type Sheet as SheetState } from "@/lib/links";
import {
  COHORTS, getClientPage, getCohortCount, getReasonErrors, getReasonSteps, getSessionPage, isCohortKey, PAGE_SIZE, searchIds,
  type ClientListRow, type Range, type ReasonErrorRow, type SearchRow, type SessionListRow,
} from "@/lib/queries";

// What one step puts in the sheet: the dialog's label, the title (full = its hover text), where back goes, and the body.
type Step = { label: string; title: ReactNode; full?: string; back?: ReturnType<typeof link>; body: ReactNode };

export default async function Sheet({ range, sheet }: { range: Range; sheet: SheetState }) {   // Picks the step (session, then list, then search) and shows it in the dialog with the backdrop and the head. Called by the dashboard page when ?session=, ?list= or ?q= is set
  const step = sheet.session ? await sessionStep(range, sheet) : sheet.list ? await listStep(range, sheet) : await searchStep(range, sheet);
  return (
    <SheetFrame closeHref={linkString(range, {})} label={step.label} stepKey={linkString(range, sheet)}>
      <Link href={link(range, {})} scroll={false} className="sheet-backdrop" aria-label="Close" />
      <aside className="sheet" tabIndex={-1}>
        <div className="sheet-head">
          {step.back && <Link href={step.back} scroll={false} className="sheet-back">‹ Back</Link>}
          <h2 className="sheet-title" title={step.full}>{step.title}</h2>
          <Link href={link(range, {})} scroll={false} className="sheet-close" aria-label="Close">×</Link>
        </div>
        {step.body}
      </aside>
    </SheetFrame>
  );
}

function hintStep(title: string, hint: string): Step {   // A step with only a hint, for an ID or list the URL got wrong. Called by the three steps
  return { label: title, title, body: <div className="sheet-section"><p className="hint">{hint}</p></div> };
}

async function sessionStep(range: Range, sheet: SheetState): Promise<Step> {   // One session, with back to the list or the search it was opened from. Called by Sheet when ?session= is set
  const id = sheet.session;
  if (!isUuid(id)) return hintStep("Session", "Not a session ID.");
  const back = sheet.list ? link(range, { list: sheet.list, arg: sheet.arg, filter: sheet.filter, page: sheet.page }) : sheet.q ? link(range, { q: sheet.q }) : undefined;
  return {
    label: `Session ${shortId(id)}`,
    title: <>Session <span className="mono">{shortId(id)}</span></>,
    full: id,
    back,
    body: (
      <div className="sheet-section">
        <SessionView id={id} highlight={isUuid(sheet.client) ? sheet.client : undefined} eventPage={sheet.epage ?? 0} pageHref={(epage) => link(range, { ...sheet, epage })} />
      </div>
    ),
  };
}

async function listStep(range: Range, sheet: SheetState): Promise<Step> {   // The records behind a clicked number: its count, then one page of them; a reason's errors first for client_reason. Called by Sheet when ?list= is set
  const key = sheet.list!;
  if (!isCohortKey(key) || COHORTS[key].arg !== (sheet.arg !== undefined)) return hintStep("List", "Unknown list.");
  const cohort = COHORTS[key];
  const arg = sheet.arg ?? null;
  const page = sheet.page ?? 0;
  const prefix = searchPrefix(sheet.filter) ?? undefined;
  const shownArg = arg === null ? null : key === "session_reason" || key === "client_reason" ? reasonLabel(arg) : eventLabel(arg);
  const [total, rows, steps, errors] = await Promise.all([
    getCohortCount(key, arg, range, prefix),
    cohort.unit === "sessions"
      ? getSessionPage(key, arg, range, page, prefix).then((list) => list.map((row) => sessionRow(row, range, sheet)))
      : getClientPage(key, arg, range, page, prefix).then((list) => list.map((row) => clientRow(row, range, sheet))),
    key === "client_reason" && !prefix ? getReasonSteps(arg!, range) : null,
    key === "client_reason" && !prefix ? getReasonErrors(arg!, range) : null,
  ]);
  const unit = cohort.unit === "sessions" ? "sessions" : "client connections";

  const title = key === "client_error" || key === "untied_error"
    ? shownArg ?? cohort.title
    : shownArg === null ? cohort.title : `${cohort.title} · ${shownArg}`;

  return {
    label: title,
    title,
    body: (
      <>
        <div className="sheet-section">
          <div className="stat-value">{formatNumber(total)}</div>
          <div className="stat-sub">{prefix ? "Matching " : ""}{unit}</div>
          {cohortExplanation(key, arg) && <p className="row-meta">{cohortExplanation(key, arg)}</p>}
        </div>
        <div className="sheet-section">
          <form className="search sheet-list-filter" action="/" method="get">
            {Object.entries(link(range, { list: key, arg: sheet.arg }).query).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input
              name="filter" type="search" minLength={8} maxLength={36} pattern="(?:[0-9A-Fa-f]|-){8,36}"
              key={prefix} defaultValue={prefix} aria-label="Filter this list by ID" placeholder="Filter by ID (8+ characters)"
            />
            <button type="submit">Filter</button>
            {prefix && <Link href={link(range, { list: key, arg: sheet.arg })} scroll={false}>Clear</Link>}
          </form>
          {rows.length > 0 ? <div className="list">{rows}</div> : <p className="hint">No {unit} match this list.</p>}
          <Pager page={page} size={PAGE_SIZE} shown={rows.length} total={Number(total)} href={(to) => link(range, { list: key, arg: sheet.arg, filter: prefix, page: to })} />
        </div>
        {errors && steps && (
          <details className="sheet-section">
            <summary>Connection evidence</summary>
            <p className="row-meta">
              Network discovery completed for {formatNumber(steps.gathered)} of {formatNumber(steps.clients)} connections.
              First video frame decoded for {formatNumber(steps.decoded)}.
            </p>
            <ReasonErrors errors={errors} />
          </details>
        )}
      </>
    ),
  };
}

function ReasonErrors({ errors }: { errors: ReasonErrorRow[] }) {   // The errors recorded on one reason's client connections, six shown and the rest behind "Show all" (the round-1 reason sheet's look). Called by listStep for client_reason
  const shown = errors.filter((row) => row.error !== null || row.clients !== "0");
  return (
    <div className="sheet-section">
      <h3>Errors</h3>
      <p className="hint">A client connection with several errors is counted in each.</p>
      <div className="list">{shown.slice(0, 6).map(errorRow)}</div>
      {shown.length > 6 && (
        <details className="more">
          <summary>Show all {shown.length}</summary>
          <div className="list">{shown.slice(6).map(errorRow)}</div>
        </details>
      )}
    </div>
  );
}

function errorRow(row: ReasonErrorRow, i: number) {   // One error of the reason: name in mono (or "No error recorded"), its most common phase and stage, and its client connections. Called by ReasonErrors
  return (
    <div key={i} className={row.warning ? "list-row muted" : "list-row"}>
      <div className="row-main">
        <div>
          {row.error === null ? "No error recorded" : <span className="mono">{row.error}</span>}
          {row.warning && <> <span className="badge badge-warning">warning</span></>}
        </div>
        {row.error !== null && (
          <div className="row-meta">mostly phase {row.phase ?? "-"} · stage {row.stage ?? "-"} ({row.top_percent}% of times)</div>
        )}
      </div>
      <span className="row-end">{formatNumber(row.clients)}</span>
    </div>
  );
}

function sessionRow(row: SessionListRow, range: Range, sheet: SheetState) {   // One session of a list: short ID, app start, tag or "no telemetry events", events and client connections; opens the session. Called by listStep
  return (
    <Link key={row.session_id} href={link(range, { list: sheet.list, arg: sheet.arg, filter: sheet.filter, page: sheet.page, session: row.session_id })} scroll={false} className="list-row">
      <div className="row-main">
        <div><span className="mono" title={row.session_id}>{shortId(row.session_id)}</span></div>
        <div className="row-meta">
          {formatTime(row.started_at)} · {row.events === null ? "no telemetry events" : <>{row.tag ? <span>{tagText(row.tag, row.reason)}</span> : "not classified"} · {formatNumber(row.events)} events</>} · {formatNumber(row.clients)} client connections
        </div>
      </div>
      <span className="chevron">›</span>
    </Link>
  );
}

function clientRow(row: ClientListRow, range: Range, sheet: SheetState) {   // One client connection of a list: its session, client number, start, tag, the app's connected_at → disconnected_at and whether another client connected; opens the session with it marked. Called by listStep
  return (
    <Link key={row.connection_id} href={link(range, { list: sheet.list, arg: sheet.arg, filter: sheet.filter, page: sheet.page, session: row.session_id, client: row.connection_id })} scroll={false} className="list-row">
      <div className="row-main">
        <div><span className="mono" title={row.session_id}>{shortId(row.session_id)}</span> {row.client_number ? `Client ${row.client_number}` : ""}</div>
        <div className="row-meta">
          {formatTime(row.started_at)} · <span>{tagText(row.tag, row.reason)}</span>{row.seconds !== null && ` · ${formatSeconds(row.seconds)} between app timestamps`}{row.other_connected && " · another client in this session connected"}
        </div>
      </div>
      <span className="chevron">›</span>
    </Link>
  );
}

async function searchStep(range: Range, sheet: SheetState): Promise<Step> {   // Lists the sessions and client connections whose ID starts with the search (a single match was already opened by the page). Called by Sheet when ?q= is set
  const q = searchPrefix(sheet.q);
  if (q === null) return hintStep("Search", "Type at least the first 8 characters of an ID.");
  const rows = await searchIds(q);
  if (rows.length === 0) return hintStep("Search", `No session or client connection ID starts with ${q}.`);
  const sessions = rows.filter((row) => row.kind === "session");
  const clients = rows.filter((row) => row.kind === "client");

  return {
    label: `Search: ${q}`,
    title: <>Search: <span className="mono">{q}</span></>,
    body: (
      <div className="sheet-section">
        {(sessions.length >= 20 || clients.length >= 20) && <p className="hint">First 20 shown; type more characters.</p>}
        {sessions.length > 0 && <><div className="group-label">Sessions</div><div className="list">{sessions.map((row) => searchRow(row, q, range))}</div></>}
        {clients.length > 0 && <><div className="group-label">Client connections</div><div className="list">{clients.map((row) => searchRow(row, q, range))}</div></>}
      </div>
    ),
  };
}

function searchRow(row: SearchRow, q: string, range: Range) {   // One search result: short ID and full ID; opens its session (with the client marked for a client connection). Called by searchStep
  return (
    <Link key={row.id} href={link(range, { q, session: row.session_id, client: row.kind === "client" ? row.id : undefined })} scroll={false} className="list-row">
      <div className="row-main">
        <div className="mono">{shortId(row.id)}</div>
        <div className="id">{row.id}</div>
      </div>
      <span className="chevron">›</span>
    </Link>
  );
}
