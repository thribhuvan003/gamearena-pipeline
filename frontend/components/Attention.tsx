// Attention.tsx: the session cohorts worth a look (several attempts, failures, reconnects, no end event) and the failed sessions per reason, each opening its sessions.

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { COHORTS, getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

const ROWS = ["several_attempts", "failure", "failure_then_success", "success_then_failure", "reconnected", "reconnected_10", "no_end_event"] as const;

export default async function Attention({ range }: { range: Range }) {   // Lists the attention cohorts in a fixed order, then one row per failed-session reason, hiding rows with 0. Called by the dashboard page, after the totals
  const [counts, reasons] = await Promise.all([getSessionCounts(range), getSessionReasons(range)]);
  const rows = [
    ...ROWS.map((key) => ({ key, title: monoNames(COHORTS[key].title), sessions: counts[key], sheet: { list: key } as Sheet })),
    ...reasons.map((row) => ({ key: `reason-${row.reason}`, title: <>Failed sessions: <span className="mono">{reasonLabel(row.reason)}</span></>, sessions: row.sessions, sheet: { list: "session_reason", arg: row.reason } as Sheet })),
  ].filter((row) => Number(row.sessions) > 0);

  return (
    <section>
      <h2>What needs attention</h2>
      <p className="hint">Sessions with telemetry; a session can be in several rows.</p>
      {rows.length === 0 ? (
        <p className="hint">Nothing in this period.</p>
      ) : (
        <>
          <div className="group-label">Sessions</div>
          <div className="list">
            {rows.map((row) => (
              <Link key={row.key} href={link(range, row.sheet)} scroll={false} className="list-row">
                <span className="row-main">{row.title}</span>
                <span className="row-end">{formatNumber(row.sessions)} <span className="muted">{percent(row.sessions, counts.with_telemetry)}%</span></span>
                <span className="chevron">›</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function monoNames(title: string): ReactNode {   // A cohort title with its raw event names (words joined by . or _, like pipeline.connect.failure) in .mono. Called by Attention above for each cohort row
  return title.split(/([a-z]+(?:[._][a-z]+)+)/).map((part, i) => (i % 2 ? <span key={i} className="mono">{part}</span> : <Fragment key={i}>{part}</Fragment>));
}
