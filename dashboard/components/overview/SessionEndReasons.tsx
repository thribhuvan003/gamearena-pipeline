// SessionEndReasons.tsx: app sessions by the end reason in their own record, with how many connected or didn't; each row opens its sessions.

import Link from "next/link";
import { formatNumber, redact } from "@/lib/format";
import { link } from "@/lib/links";
import { getSessionsByEndReason, type Range } from "@/lib/queries";

export default async function SessionEndReasons({ range }: { range: Range }) {   // One row per end reason; the rows add up to all app sessions
  const rows = await getSessionsByEndReason(range);
  const total = rows.reduce((sum, row) => sum + Number(row.sessions), 0);

  return (
    <section className="overview-panel" aria-labelledby="end-reasons-title">
      <h3 id="end-reasons-title">Sessions by end reason</h3>
      <p className="hint">From the app&apos;s own session record; the rows add up to {formatNumber(String(total))}.</p>
      <div className="card-body">
        <ul className="list reason-list">
          {rows.map((row) => (
            <li key={row.end_reason}>
              <Link href={link(range, { list: "session_end_reason", arg: row.end_reason })} scroll={false} className="list-row">
                <span className="row-main">
                  <strong>{row.end_reason === "(none)" ? "No end reason recorded" : redact(row.end_reason)}</strong>
                  <span className="row-meta">{formatNumber(row.connected)} connected · {formatNumber(row.not_connected)} didn&apos;t connect</span>
                </span>
                <span className="row-end"><strong>{formatNumber(row.sessions)}</strong></span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
