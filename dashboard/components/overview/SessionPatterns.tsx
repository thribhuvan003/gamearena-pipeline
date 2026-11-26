// SessionPatterns.tsx: session activity (attempts, failures, reconnects, missing end); counts overlap and are not outcomes.

import DiagnosticRow from "./DiagnosticRow";
import { getSessionCounts, type Range } from "@/lib/queries";

// Each pattern: its cohort and its name; its one-line logic shows when its list opens.
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

export default async function SessionPatterns({ range }: { range: Range }) {   // The activity rows, the less common ones in a fold; each opens its sessions
  const counts = await getSessionCounts(range);
  const row = ([key, label]: (typeof MAIN | typeof EXTRA)[number]) => (
    <DiagnosticRow key={key} range={range} sheet={{ list: key }} label={label} count={counts[key]} />
  );

  return (
    <section className="overview-panel" aria-labelledby="activity-title">
      <h3 id="activity-title">Session activity</h3>
      <p className="hint">A session can be in several rows.</p>
      <div className="diagnostic-list">{MAIN.map(row)}</div>
      <details className="disclosure nested-disclosure">
        <summary>More activity</summary>
        <div className="diagnostic-list">{EXTRA.map(row)}</div>
      </details>
    </section>
  );
}
