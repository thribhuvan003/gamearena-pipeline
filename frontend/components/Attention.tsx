import Link from "next/link";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getClientCounts, getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

const MAIN = [
  ["several_attempts", "Multiple connection attempts"],
  ["failure", "Recorded connection failure"],
  ["reconnected", "Client reconnected"],
] as const;

const EXTRA = [
  ["failure_then_success", "Connected after a failed attempt"],
  ["success_then_failure", "Failed attempt after connecting"],
  ["reconnected_10", "10 or more client reconnects"],
  ["no_end_event", "Missing end event"],
] as const;

export default async function Attention({ range }: { range: Range }) {
  const [counts, reasons, clients] = await Promise.all([getSessionCounts(range), getSessionReasons(range), getClientCounts(range)]);
  const base = counts.with_telemetry;
  const signal = ([key, label]: (typeof MAIN | typeof EXTRA)[number]) => (
    <DiagnosticRow key={key} range={range} sheet={{ list: key }} label={label} count={counts[key]} base={base} />
  );

  return (
    <div className="diagnostics-grid">
      <section className="diagnostics-panel" aria-labelledby="signals-title">
        <h3 id="signals-title">Session patterns</h3>
        <p className="hint">Share of sessions with telemetry. Patterns can overlap.</p>
        <div className="diagnostic-list">{MAIN.map(signal)}</div>
        <details className="disclosure nested-disclosure">
          <summary>More session patterns</summary>
          <div className="diagnostic-list">{EXTRA.map(signal)}</div>
          {Number(clients.clients_alone) > 0 && (
            <DiagnosticRow range={range} sheet={{ list: "clients_alone" }} label="No client connected in the session" count={clients.clients_alone} note="Client connections" />
          )}
        </details>
      </section>
      <section className="diagnostics-panel" aria-labelledby="failed-sessions-title">
        <h3 id="failed-sessions-title">Failed sessions</h3>
        <p className="hint">Session outcomes grouped by the recorded reason.</p>
        {reasons.length === 0 ? <p className="hint">No failed sessions recorded.</p> : (
          <div className="diagnostic-list">
            {reasons.map((row) => (
              <DiagnosticRow key={row.reason} range={range} sheet={{ list: "session_reason", arg: row.reason }} label={reasonLabel(row.reason)} count={row.sessions} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DiagnosticRow({ range, sheet, label, count, base, note }: { range: Range; sheet: Sheet; label: string; count: string; base?: string; note?: string }) {
  return (
    <Link href={link(range, sheet)} scroll={false} className="list-row">
      <span className="row-main">{label}</span>
      <span className="row-end"><strong>{formatNumber(count)}</strong>{note && <small>{note}</small>}{base && Number(base) > 0 && <small>{percent(count, base)}%</small>}</span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  );
}
