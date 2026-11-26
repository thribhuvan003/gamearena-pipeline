// ReasonsTable.tsx: why clients didn't connect: the pipeline's category per client with its one-line meaning; each row opens exactly its clients.

import Link from "next/link";
import { formatNumber, reasonExplanation, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getConnectionReasons, type Range } from "@/lib/queries";

export default async function ReasonsTable({ range, sheet }: { range: Range; sheet: Sheet }) {
  const rows = await getConnectionReasons(range);

  return (
    <section className="overview-panel" aria-labelledby="reasons-title">
      <h2 id="reasons-title">Why clients didn't connect</h2>
      <p className="hint">One category per client that didn't connect, from its logged failure phase or video state. A clue, not a proven cause.</p>
      {rows.length === 0 ? (
        <p className="hint">No clients that didn't connect in this period.</p>
      ) : (
        <ul className="list reason-list">
          {rows.map((row) => (
            <li key={row.reason}>
              <Link
                href={link(range, { list: "client_reason", arg: row.reason })}
                scroll={false}
                className={sheet.list === "client_reason" && sheet.arg === row.reason ? "list-row selected" : "list-row"}
              >
                <span className="row-main">
                  <strong>{reasonLabel(row.reason)}</strong>
                  {reasonExplanation(row.reason, "clients") && <span className="reason-detail">{reasonExplanation(row.reason, "clients")}</span>}
                </span>
                <span className="row-end"><strong>{formatNumber(row.clients)}</strong><small>{row.percent}%</small></span>
                <span className="chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
