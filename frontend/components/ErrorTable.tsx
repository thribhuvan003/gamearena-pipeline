import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, type ErrorRow, type Range } from "@/lib/queries";

export default async function ErrorTable({ range }: { range: Range }) {
  const rows = await getErrorFrequency(range);
  const errors = rows.filter((row) => !row.warning).sort((a, b) => Number(b.clients) - Number(a.clients));
  const warnings = rows.filter((row) => row.warning);

  return (
    <section className="diagnostics-panel diagnostics-errors" aria-labelledby="logged-errors-title">
      <h3 id="logged-errors-title">Client error events</h3>
      <div className="diagnostics-error-list">
        <p className="hint">Same event log, counted by distinct client IDs with each error (UTC event day). One client can later succeed or have several errors. Code 500 is app-reported, not a proven cause or HTTP status.</p>
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

function ClientError({ row, range }: { row: ErrorRow; range: Range }) {
  const unknown = Number(row.clients) - Number(row.connected_clients) - Number(row.not_connected_clients);
  const stats = [
    ["Times recorded", formatNumber(row.events)],
    ["No success recorded", formatNumber(row.not_connected_clients)],
    ["Success recorded", formatNumber(row.connected_clients)],
    ["Unknown outcome", formatNumber(String(unknown))],
    ["Connections without telemetry tags", formatNumber(row.not_tagged_clients)],
    ["Share with no success recorded", row.not_connected_percent === null ? "Unavailable" : `${row.not_connected_percent}%`],
  ];
  return (
    <details className="disclosure">
      <summary>{eventLabel(row.error)} <span className="disclosure-value">{formatNumber(row.clients)}</span></summary>
      <div className="disclosure-body">
        {eventExplanation(row.error) && <p className="hint">{eventExplanation(row.error)}</p>}
        <dl className="compact-facts">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className="hint">The share excludes unknown and untagged connections. “Times recorded” counts events, so it may exceed the connection count.</p>
        <p className="id">{row.error}</p>
        {Number(row.clients) > 0 && <Link href={link(range, { list: "client_error", arg: row.error })} scroll={false}>View connections ›</Link>}
      </div>
    </details>
  );
}

function eventExplanation(signature: string): string | null {
  const event = signature.split(" ", 1)[0];
  if (event === "pipeline.connection.dropped") return "The app logged a drop event. This event alone does not prove a success was previously logged for this client ID.";
  if (event === "pipeline.connect.failure") return "The app logged a failed attempt. The same client or session may later have a success event.";
  if (event === "ice.connection.state") return "A network negotiation state was logged at error level. Open a connection to see its recorded state and timeline.";
  if (event === "webrtc.connection.state") return "A WebRTC state was logged at error level. Open a connection to see its recorded state and timeline.";
  return null;
}
