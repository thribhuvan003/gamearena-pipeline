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
    <section className="diagnostics-panel diagnostics-errors" aria-labelledby="logged-errors-title">
      <h3 id="logged-errors-title">Client error events</h3>
      <div className="diagnostics-error-list">
        <p className="hint">Distinct client IDs with each error (UTC event day); one ID can have several errors or succeed later. “Times recorded” counts events; the share leaves out unknown and untagged connections.</p>
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
    ["Connected", formatNumber(row.connected_clients)],
    ["Unknown outcome", formatNumber(String(unknown))],
    ["Connections without telemetry tags", formatNumber(row.not_tagged_clients)],
    ["Share that didn't connect", row.not_connected_percent === null ? "Unavailable" : `${row.not_connected_percent}%`],
  ];
  return (
    <details className="disclosure">
      <summary>{eventLabel(row.error)} <span className="disclosure-value">{formatNumber(row.clients)}</span></summary>
      <div className="disclosure-body">
        {eventExplanation(row.error) && <p className="hint">{eventExplanation(row.error)}</p>}
        <dl className="compact-facts">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className="id">{row.error}</p>
        {Number(row.clients) > 0 && <Link href={link(range, { list: "client_error", arg: row.error })} scroll={false}>View connections ›</Link>}
      </div>
    </details>
  );
}

function eventExplanation(signature: string): string | null {   // A one-line note on what an error event does and doesn't prove, for the events that need one. Called by ClientError
  const event = signature.split(" ", 1)[0];
  if (event === "pipeline.connection.dropped") return "The app logged a drop event. It alone does not prove the client had connected before.";
  if (event === "pipeline.connect.failure") return "The app logged a failed attempt. The same client or session may still connect later.";
  if (event === "ice.connection.state") return "A network negotiation state was logged at error level. Open a connection to see its recorded state and timeline.";
  if (event === "webrtc.connection.state") return "A WebRTC state was logged at error level. Open a connection to see its recorded state and timeline.";
  return null;
}
