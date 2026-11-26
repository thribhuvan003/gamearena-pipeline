// Attention.tsx: the sessions that didn't connect, by pipeline category, and the session-level event patterns; every row has a one-line meaning taken from its rule and opens exactly its sessions.

import Link from "next/link";
import { cohortExplanation, formatNumber, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

// Each pattern: its cohort and its name; its one-line meaning comes from cohortExplanation.
const MAIN = [
  ["several_attempts", "2+ attempt events"],
  ["failure", "Failure event logged"],
  ["reconnected", "Reconnect event logged"],
] as const;

const EXTRA = [
  ["failure_then_success", "Failure, then connected"],
  ["success_then_failure", "Connected, then a failure"],
  ["reconnected_10", "10+ reconnect events"],
  ["no_end_event", "No session end event"],
] as const;

export default async function Attention({ range }: { range: Range }) {   // Shows the two panels for the range, hiding nothing; each row links to its cohort. Called by the dashboard's diagnostics view
  const [counts, reasons] = await Promise.all([getSessionCounts(range), getSessionReasons(range)]);
  const signal = ([key, label]: (typeof MAIN | typeof EXTRA)[number]) => (
    <DiagnosticRow key={key} range={range} sheet={{ list: key }} label={label} detail={cohortExplanation(key, null)} count={counts[key]} />
  );

  return (
    <div className="diagnostics-grid">
      <section className="diagnostics-panel" aria-labelledby="failed-sessions-title">
        <h3 id="failed-sessions-title">Sessions that didn't connect</h3>
        <p className="hint">{formatNumber(counts.tag_failed)} ended sessions tried to connect but never logged pipeline.connect.success. One category per session.</p>
        {reasons.length === 0 ? <p className="hint">No sessions in this outcome.</p> : (
          <div className="diagnostic-list">
            {reasons.map((row) => (
              <DiagnosticRow key={row.reason} range={range} sheet={{ list: "session_reason", arg: row.reason }} label={reasonLabel(row.reason)} detail={cohortExplanation("session_reason", row.reason)} count={row.sessions} />
            ))}
          </div>
        )}
      </section>
      <section className="diagnostics-panel" aria-labelledby="signals-title">
        <h3 id="signals-title">Session-level event patterns</h3>
        <p className="hint">Counted once per session; a session can be in several rows.</p>
        <div className="diagnostic-list">{MAIN.map(signal)}</div>
        <details className="disclosure nested-disclosure">
          <summary>More event patterns</summary>
          <div className="diagnostic-list">{EXTRA.map(signal)}</div>
        </details>
      </section>
    </div>
  );
}

function DiagnosticRow({ range, sheet, label, detail, count }: { range: Range; sheet: Sheet; label: string; detail: string | null; count: string }) {   // One row: the name, its one-line meaning underneath, and the count; opens its sessions. Called by Attention for every row
  return (
    <Link href={link(range, sheet)} scroll={false} className="list-row">
      <span className="row-main">{label}{detail && <span className="reason-detail">{detail}</span>}</span>
      <span className="row-end"><strong>{formatNumber(count)}</strong></span>
      <span className="chevron" aria-hidden="true">›</span>
    </Link>
  );
}
