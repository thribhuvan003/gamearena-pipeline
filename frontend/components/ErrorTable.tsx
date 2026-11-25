import Link from "next/link";
import { eventLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getErrorFrequency, getUntiedErrors, type ErrorRow, type Range, type UntiedErrorRow } from "@/lib/queries";

export default async function ErrorTable({ range }: { range: Range }) {
  const [rows, untied] = await Promise.all([getErrorFrequency(range), getUntiedErrors(range)]);
  const errors = rows.filter((row) => !row.warning).sort((a, b) => Number(b.clients) - Number(a.clients));
  const warnings = rows.filter((row) => row.warning);

  return (
    <section className="diagnostics-panel diagnostics-errors" aria-labelledby="logged-errors-title">
      <h3 id="logged-errors-title">Recorded errors</h3>
      <div className="diagnostics-grid">
        <div>
          <h4>By client connection</h4>
          <p className="hint">Counts show connections with telemetry.</p>
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
        <div>
          <h4>By app session</h4>
          <p className="hint">These events name a session but no client.</p>
          {untied.length === 0 ? <p className="hint">No session errors recorded.</p> : (
            <div className="diagnostic-list">
              {untied.map((row) => <SessionError key={row.error} row={row} range={range} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ClientError({ row, range }: { row: ErrorRow; range: Range }) {
  const unknown = Number(row.clients) - Number(row.connected_clients) - Number(row.not_connected_clients);
  const stats = [
    ["Times recorded", formatNumber(row.events)],
    ["Didn’t connect", formatNumber(row.not_connected_clients)],
    ["Connected", formatNumber(row.connected_clients)],
    ["Unknown outcome", formatNumber(String(unknown))],
    ["Connections without telemetry tags", formatNumber(row.not_tagged_clients)],
    ["Share that didn’t connect", row.not_connected_percent === null ? "Unavailable" : `${row.not_connected_percent}%`],
  ];
  return (
    <details className="disclosure">
      <summary>{eventLabel(row.error)} <span className="disclosure-value">{formatNumber(row.clients)}</span></summary>
      <div className="disclosure-body">
        <dl className="compact-facts">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <p className="hint">The share uses connections with a known outcome.</p>
        <p className="id">{row.error}</p>
        {Number(row.clients) > 0 && <Link href={link(range, { list: "client_error", arg: row.error })} scroll={false}>View connections ›</Link>}
      </div>
    </details>
  );
}

function SessionError({ row, range }: { row: UntiedErrorRow; range: Range }) {
  return (
    <details className="disclosure">
      <summary>{eventLabel(row.error)} <span className="disclosure-value">{formatNumber(row.sessions)}</span></summary>
      <div className="disclosure-body">
        <p className="hint">{formatNumber(row.events)} times recorded</p>
        <p className="id">{row.error}</p>
        <Link href={link(range, { list: "untied_error", arg: row.error })} scroll={false}>View sessions ›</Link>
      </div>
    </details>
  );
}
