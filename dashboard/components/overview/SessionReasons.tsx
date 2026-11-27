// SessionReasons.tsx: sessions that didn't connect, one reason each (the first rule that matched); the rows add up. Each row opens its sessions.

import Link from "next/link";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

export default async function SessionReasons({ range, sheet }: { range: Range; sheet: Sheet }) {   // Every reason with its count and share, undetermined last
  const [counts, reasons] = await Promise.all([getSessionCounts(range), getSessionReasons(range)]);
  const total = counts.tag_failed;
  const rows = [...reasons].sort((a, b) => Number(a.reason === "no_video") - Number(b.reason === "no_video") || Number(b.sessions) - Number(a.sessions));

  return (
    <section className="overview-panel" aria-labelledby="session-reasons-title">
      <h3 id="session-reasons-title">{formatNumber(total)} sessions didn&apos;t connect</h3>
      <p className="hint">One reason per session, the first rule that matched; the rows add up to {formatNumber(total)}.</p>
      <div className="card-body">
        <ul className="list reason-list">
          {rows.map((row) => (
            <li key={row.reason}>
              <Link href={link(range, { list: "session_reason", arg: row.reason })} scroll={false}
                className={sheet.list === "session_reason" && sheet.arg === row.reason ? "list-row selected" : "list-row"}>
                <span className="row-main"><strong>{reasonLabel(row.reason)}</strong></span>
                <span className="row-end"><strong>{formatNumber(row.sessions)}</strong><small>{percent(row.sessions, total)}%</small></span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
