// ClientErrors.tsx: each client error with the clients it hit and how many connected or didn't; warnings last.

import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, type ErrorRow, type Range } from "@/lib/queries";

export default async function ClientErrors({ range }: { range: Range }) {   // Lists the five client errors that hit the most clients, the rest and the warnings folded below. Called by the diagnostics view
  const rows = await getErrorFrequency(range);
  const errors = rows.filter((row) => !row.warning).sort((a, b) => Number(b.clients) - Number(a.clients));
  const warnings = rows.filter((row) => row.warning);

  return (
    <section className="overview-panel diagnostics-errors" aria-labelledby="logged-errors-title">
      <h3 id="logged-errors-title">Errors logged by clients</h3>
      <div className="diagnostics-error-list">
        <p className="hint">Clients that logged each error; a client can be under several.</p>
        {errors.length === 0 && <p className="hint">No client errors recorded.</p>}
        <div className="diagnostic-list">
          {errors.slice(0, 5).map((row) => <ClientError key={row.error} row={row} range={range} />)}
        </div>
        {errors.length > 5 && (
          <details className="disclosure nested-disclosure">
            <summary>More client errors <span className="disclosure-value">{formatNumber(String(errors.length - 5))}</span></summary>
            <div className="diagnostic-list">{errors.slice(5).map((row) => <ClientError key={row.error} row={row} range={range} />)}</div>
          </details>
        )}
        {warnings.length > 0 && (
          <details className="disclosure nested-disclosure">
            <summary>Warnings</summary>
            <div className="diagnostic-list">{warnings.map((row) => <ClientError key={row.error} row={row} range={range} />)}</div>
          </details>
        )}
      </div>
    </section>
  );
}

function ClientError({ row, range }: { row: ErrorRow; range: Range }) {   // One error as a fold: clients hit, how many connected or didn't, and a link to exactly those clients. Called by ClientErrors for each error
  const unknown = Number(row.clients) - Number(row.connected_clients) - Number(row.not_connected_clients);
  const stats = [
    ["Times recorded", formatNumber(row.events)],
    ["Didn't connect", formatNumber(row.not_connected_clients)],
    ["Connected, then this error", formatNumber(row.connected_then_error)],
    ["This error, then connected", formatNumber(row.error_then_connected)],
    ["Outcome not recorded", formatNumber(String(unknown))],
    ["Connections without telemetry tags", formatNumber(row.not_tagged_clients)],
    ["Didn't connect, of known outcomes", row.not_connected_percent === null ? "Unavailable" : `${formatNumber(row.not_connected_clients)} of ${formatNumber(String(Number(row.not_connected_clients) + Number(row.connected_clients)))} (${row.not_connected_percent}%)`],
  ];
  return (
    <details className="disclosure">
      <summary>{eventLabel(row.error)} <span className="disclosure-value">{formatNumber(row.clients)} clients</span></summary>
      <div className="disclosure-body">
        <dl className="compact-facts">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className="id">{row.error}</p>
        {Number(row.clients) > 0 && <Link href={link(range, { list: "client_error", arg: row.error })} scroll={false}>View connections ›</Link>}
      </div>
    </details>
  );
}
