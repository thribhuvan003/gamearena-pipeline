// ReasonsTable.tsx: section 2, failed sessions per reason. Each reason links to its sessions.

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { getFailureReasons, type Range } from "@/lib/queries";

export default async function ReasonsTable({ selected, range }: { selected?: string; range: Range }) {   // Lists the failure reasons with counts for the range. Called by the dashboard page; `selected` highlights the clicked reason
  const rows = await getFailureReasons(range);
  const dates = { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };

  return (
    <section>
      <h2>Why sessions failed</h2>
      {rows.length === 0 ? (
        <p className="hint">No failed sessions in this period.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Reason</th><th className="num">Failed sessions</th><th className="num">% of failed</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.reason} className={row.reason === selected ? "selected" : undefined}>
                <td><Link href={{ pathname: "/", query: { ...dates, reason: row.reason } }}>{row.reason}</Link></td>
                <td className="num">{formatNumber(row.failed_sessions)}</td>
                <td className="num">{row.percent_of_failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
