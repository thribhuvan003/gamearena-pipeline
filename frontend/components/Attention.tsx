// Attention.tsx: the session cohorts worth a look (several attempts, failures, reconnects, no end event) and the failed sessions per reason, each opening its sessions.

import Link from "next/link";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { COHORTS, getClientCounts, getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

const ROWS = ["several_attempts", "failure", "failure_then_success", "success_then_failure", "reconnected", "reconnected_10", "no_end_event"] as const;

export default async function Attention({ range }: { range: Range }) {   // Lists the attention cohorts in a fixed order, then one row per failed-session reason, hiding rows with 0. Called by the dashboard page, after the totals
  const [counts, reasons, clients] = await Promise.all([getSessionCounts(range), getSessionReasons(range), getClientCounts(range)]);
  const rows = [
    ...ROWS.map((key) => ({ key, title: COHORTS[key].title, sessions: counts[key], sheet: { list: key } as Sheet })),
    ...reasons.map((row) => ({ key: `reason-${row.reason}`, title: <>Failed sessions: {reasonLabel(row.reason)}</>, sessions: row.sessions, sheet: { list: "session_reason", arg: row.reason } as Sheet })),
  ].filter((row) => Number(row.sessions) > 0);

  return (
    <section>
      <h2>Session investigation</h2>
      <p className="hint">Sessions with telemetry; a session can be in several rows.</p>
      {rows.length === 0 ? (
        <p className="hint">No matching sessions in this period.</p>
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
      {Number(clients.clients_alone) > 0 && (
        <p className="diagnostic-link">
          <Link href={link(range, { list: "clients_alone" })} scroll={false}>
            {formatNumber(clients.clients_alone)} failed connections in sessions where no client connected
          </Link>
        </p>
      )}
    </section>
  );
}
