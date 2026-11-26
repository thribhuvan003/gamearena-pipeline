import Link from "next/link";
import { formatNumber, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

const MAIN = [
  ["several_attempts", "2+ attempt events"],
  ["failure", "Failure event logged"],
  ["reconnected", "Reconnect event logged"],
] as const;

const EXTRA = [
  ["failure_then_success", "Failure event before success event"],
  ["success_then_failure", "Failure event after success event"],
  ["reconnected_10", "10+ reconnect events"],
  ["no_end_event", "No session end event"],
] as const;

export default async function Attention({ range }: { range: Range }) {
  const [counts, reasons] = await Promise.all([getSessionCounts(range), getSessionReasons(range)]);
  const signal = ([key, label]: (typeof MAIN | typeof EXTRA)[number]) => (
    <DiagnosticRow key={key} range={range} sheet={{ list: key }} label={label} count={counts[key]} />
  );

  return (
    <div className="diagnostics-grid">
      <section className="diagnostics-panel" aria-labelledby="failed-sessions-title">
        <h3 id="failed-sessions-title">Sessions without recorded success</h3>
        <p className="hint">{formatNumber(counts.tag_failed)} ended app sessions had an attempt event but no success event. Counted by app start; one category per session, inferred from its logs.</p>
        {reasons.length === 0 ? <p className="hint">No sessions in this outcome.</p> : (
          <div className="diagnostic-list">
            {reasons.map((row) => (
              <DiagnosticRow key={row.reason} range={range} sheet={{ list: "session_reason", arg: row.reason }} label={reasonLabel(row.reason)} count={row.sessions} />
            ))}
          </div>
        )}
      </section>
      <section className="diagnostics-panel" aria-labelledby="signals-title">
        <h3 id="signals-title">Events seen during sessions</h3>
        <p className="hint">App sessions by start day. Rows overlap and can include successful sessions; events may belong to different clients.</p>
        <div className="diagnostic-list">{MAIN.map(signal)}</div>
        <details className="disclosure nested-disclosure">
          <summary>More event patterns</summary>
          <div className="diagnostic-list">{EXTRA.map(signal)}</div>
        </details>
      </section>
    </div>
  );
}

function DiagnosticRow({ range, sheet, label, count }: { range: Range; sheet: Sheet; label: string; count: string }) {
  return (
    <Link href={link(range, sheet)} scroll={false} className="list-row">
      <span className="row-main">{label}</span>
      <span className="row-end"><strong>{formatNumber(count)}</strong></span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  );
}
