// ReasonSheet.tsx: the side sheet for one reason: its clients count, how far they got, its errors and its clients; with ?client= it shows that client's session instead.

import Link from "next/link";
import SessionView from "./SessionView";
import { formatNumber, formatSeconds, formatTime, rangeQuery, reasonLabel, shortId } from "@/lib/format";
import { getClientsByReason, getConnectionReasons, getReasonErrors, getReasonSteps, type ClientListRow, type ReasonErrorRow, type Range } from "@/lib/queries";

export default async function ReasonSheet({ reason, client, range }: { reason: string; client?: string; range: Range }) {   // Shows the backdrop and the sheet, with the reason step or the client step. Called by the dashboard page when ?reason= is set
  const close = { pathname: "/", query: rangeQuery(range) };
  return (
    <>
      <Link href={close} scroll={false} className="sheet-backdrop" aria-label="Close" />
      <aside className="sheet">
        {client ? <ClientStep reason={reason} client={client} range={range} /> : <ReasonStep reason={reason} range={range} />}
      </aside>
    </>
  );
}

async function ReasonStep({ reason, range }: { reason: string; range: Range }) {   // The reason's clients count, the two events reached, its errors and its client list. Called by ReasonSheet when no client is open
  const [errors, steps, clients, reasons] = await Promise.all([
    getReasonErrors(reason, range), getReasonSteps(reason, range), getClientsByReason(reason, range), getConnectionReasons(range),
  ]);
  const shownErrors = errors.filter((row) => row.error !== null || row.clients !== "0");
  const percent = reasons.find((row) => row.reason === reason)?.percent;
  const total = clients[0]?.total ?? "0";
  const all = formatNumber(steps.clients);

  return (
    <>
      <div className="sheet-head">
        <h2 className="sheet-title mono">{reasonLabel(reason)}</h2>
        <Link href={{ pathname: "/", query: rangeQuery(range) }} scroll={false} className="sheet-close" aria-label="Close">×</Link>
      </div>
      <div className="sheet-section">
        <div className="stat-value">{all} {percent && <span className="muted">{percent}%</span>}</div>
        <p className="row-meta">
          Reached <span className="mono">ice.gathering.complete</span> {formatNumber(steps.gathered)} of {all} · <span className="mono">media.first_decode</span> {formatNumber(steps.decoded)} of {all}
        </p>
      </div>

      <div className="sheet-section">
        <h3>Errors</h3>
        <p className="hint">A client with several errors is counted in each.</p>
        <div className="list">{shownErrors.slice(0, 6).map(errorRow)}</div>
        {shownErrors.length > 6 && (
          <details className="more">
            <summary>Show all {shownErrors.length}</summary>
            <div className="list">{shownErrors.slice(6).map(errorRow)}</div>
          </details>
        )}
      </div>

      <div className="sheet-section">
        <h3>Clients ({formatNumber(total)})</h3>
        {Number(total) > clients.length && <p className="hint">Latest {clients.length} of {formatNumber(total)}.</p>}
        <div className="list">{clients.slice(0, 20).map((row) => clientRow(row, reason, range))}</div>
        {clients.length > 20 && (
          <details className="more">
            <summary>Show all {clients.length}</summary>
            <div className="list">{clients.slice(20).map((row) => clientRow(row, reason, range))}</div>
          </details>
        )}
      </div>
    </>
  );
}

async function ClientStep({ reason, client, range }: { reason: string; client: string; range: Range }) {   // Finds the client's session in the reason's latest 500 and shows it. Called by ReasonSheet when ?client= is set
  const clients = await getClientsByReason(reason, range);
  const sessionId = clients.find((row) => row.connection_id === client)?.session_id;
  const back = { pathname: "/", query: { ...rangeQuery(range), reason } };

  return (
    <>
      <div className="sheet-head">
        <Link href={back} scroll={false} className="sheet-back">‹ {reasonLabel(reason)}</Link>
        {sessionId && <h2 className="sheet-title" title={sessionId}>Session <span className="mono">{shortId(sessionId)}</span></h2>}
        <Link href={{ pathname: "/", query: rangeQuery(range) }} scroll={false} className="sheet-close" aria-label="Close">×</Link>
      </div>
      <div className="sheet-section">
        {sessionId ? <SessionView id={sessionId} highlight={client} /> : <p className="hint">This client is not in the latest 500.</p>}
      </div>
    </>
  );
}

function errorRow(row: ReasonErrorRow, i: number) {   // One error of the reason: name in mono (or "No error recorded"), its most common phase and stage, and its clients. Called by ReasonStep for the errors list
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

function clientRow(row: ClientListRow, reason: string, range: Range) {   // One client of the reason, linking to the client step. Called by ReasonStep for the clients list
  return (
    <Link
      key={row.connection_id}
      href={{ pathname: "/", query: { ...rangeQuery(range), reason, client: row.connection_id } }}
      scroll={false}
      className="list-row"
    >
      <div className="row-main">
        <div><span className="mono" title={row.session_id}>{shortId(row.session_id)}</span> {row.client_number ? `Client ${row.client_number}` : "-"}</div>
        <div className="row-meta">
          {formatTime(row.started_at)} · {formatSeconds(row.seconds)} connected · {row.other_connected ? "another client connected" : "no client connected"}
        </div>
      </div>
      <span className="chevron">›</span>
    </Link>
  );
}
