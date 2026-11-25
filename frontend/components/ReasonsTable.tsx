// ReasonsTable.tsx: client connections that didn't connect, per reason, as a list; clicking a reason opens its sheet on the same page.

import Link from "next/link";
import { formatNumber, rangeQuery, reasonLabel } from "@/lib/format";
import { getConnectionReasons, getFailureReasons, type Range } from "@/lib/queries";

export default async function ReasonsTable({ reason, range }: { reason?: string; range: Range }) {   // Lists the client reasons for the range, the open one selected, then the reasons that exist only per session. Called by the dashboard page
  const [rows, sessionReasons] = await Promise.all([getConnectionReasons(range), getFailureReasons(range)]);
  const clientReasons = new Set(rows.map((row) => row.reason));
  const sessionOnly = sessionReasons.filter((row) => !clientReasons.has(row.reason));

  return (
    <section>
      <h2>Why client connections didn&apos;t connect</h2>
      <p className="hint">no info = tried, but no failure event or failed video state was recorded.</p>
      {rows.length === 0 && <p className="hint">No client connections that didn&apos;t connect in this period.</p>}
      {(rows.length > 0 || sessionOnly.length > 0) && (
        <div className="list">
          {rows.map((row) => (
            <Link
              key={row.reason}
              href={{ pathname: "/", query: { ...rangeQuery(range), reason: row.reason } }}
              scroll={false}
              className={row.reason === reason ? "list-row selected" : "list-row"}
            >
              <span className="row-main mono">{reasonLabel(row.reason)}</span>
              <span className="row-end">{formatNumber(row.clients)} <span className="muted">{row.percent}%</span></span>
              <span className="chevron">›</span>
            </Link>
          ))}
          {sessionOnly.length > 0 && (
            <div className="list-row muted">
              <span className="row-main">
                Only per session:{" "}
                {sessionOnly.map((row, i) => (
                  <span key={row.reason}>{i > 0 && ", "}<span className="mono">{reasonLabel(row.reason)}</span> {formatNumber(row.failed_sessions)}</span>
                ))}{" "}
                failed sessions
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
