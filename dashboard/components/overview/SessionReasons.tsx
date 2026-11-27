// SessionReasons.tsx: sessions that didn't connect, one reason each; the rows add up. Each row opens its sessions.

import Link from "next/link";
import { formatNumber, percent, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getSessionCounts, getSessionReasons, type Range } from "@/lib/queries";

// The session reasons shown on their own row; every other reason is one "Other reasons" row (those sessions are counted per client below).
const OWN_ROW = ["setup_error", "someone_never_joined"];

export default async function SessionReasons({ range, sheet }: { range: Range; sheet: Sheet }) {   // The own-row reasons plus "Other reasons", each with its count and share
  const [counts, reasons] = await Promise.all([getSessionCounts(range), getSessionReasons(range)]);
  const total = counts.tag_failed;
  const rows = [
    ...reasons.filter((row) => OWN_ROW.includes(row.reason)).map((row) => ({ key: row.reason, label: reasonLabel(row.reason), count: row.sessions, to: { list: "session_reason", arg: row.reason } })),
    { key: "other", label: "Other reasons (see Clients)", count: counts.failed_other, to: { list: "failed_other", arg: undefined } },
  ];

  return (
    <section className="overview-panel" aria-labelledby="session-reasons-title">
      <h3 id="session-reasons-title">{formatNumber(total)} sessions didn&apos;t connect</h3>
      <p className="hint">One reason per session; the rows add up to {formatNumber(total)}.</p>
      <div className="card-body">
        <ul className="list reason-list">
          {rows.map((row) => (
            <li key={row.key}>
              <Link href={link(range, row.to)} scroll={false} className={sheet.list === row.to.list && sheet.arg === row.to.arg ? "list-row selected" : "list-row"}>
                <span className="row-main"><strong>{row.label}</strong></span>
                <span className="row-end"><strong>{formatNumber(row.count)}</strong><small>{percent(row.count, total)}%</small></span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
