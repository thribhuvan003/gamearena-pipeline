// SessionList.tsx: the failed sessions behind a clicked reason.

import Link from "next/link";
import { formatNumber, formatTime } from "@/lib/format";
import { getSessionsByReason } from "@/lib/queries";

export default async function SessionList({ reason }: { reason: string }) {   // Lists the failed sessions with this reason, each linking to its page. Called by the dashboard page after a reason is clicked
  const rows = await getSessionsByReason(reason);
  const total = rows[0]?.total ?? "0";

  return (
    <section>
      <h2>Failed sessions: {reason} ({formatNumber(total)})</h2>
      {Number(total) > rows.length && <p className="hint">Showing the latest {rows.length} of {formatNumber(total)}.</p>}
      {rows.length === 0 ? (
        <p className="hint">No sessions.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Session</th><th>Started</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.session_id}>
                <td><Link href={`/session/${row.session_id}`} className="mono">{row.session_id}</Link></td>
                <td>{formatTime(row.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
