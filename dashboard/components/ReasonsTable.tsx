// ReasonsTable.tsx: section 2, failed sessions per reason. Each reason links to its sessions.

import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { getFailureReasons } from "@/lib/queries";

export default async function ReasonsTable({ selected }: { selected?: string }) {   // Lists the failure reasons with counts. Called by the dashboard page; `selected` highlights the clicked reason
  const rows = await getFailureReasons();

  return (
    <section>
      <h2>Why sessions failed</h2>
      <table>
        <thead>
          <tr><th>Reason</th><th className="num">Failed sessions</th><th className="num">% of failed</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reason} className={row.reason === selected ? "selected" : undefined}>
              <td><Link href={{ pathname: "/", query: { reason: row.reason } }}>{row.reason}</Link></td>
              <td className="num">{formatNumber(row.failed_sessions)}</td>
              <td className="num">{row.percent_of_failed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
