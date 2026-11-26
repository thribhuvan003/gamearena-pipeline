// ClientReasons.tsx: why clients didn't connect: the pipeline's category per client with its one-line meaning; each row opens exactly its clients.

import Link from "next/link";
import { formatNumber, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getConnectionReasons, type Range } from "@/lib/queries";

export default async function ClientReasons({ range, sheet }: { range: Range; sheet: Sheet }) {   // Lists each category with its meaning, count and share; the open one is highlighted. Called by the overview
  const rows = await getConnectionReasons(range);
  const total = rows.reduce((sum, row) => sum + Number(row.clients), 0);

  return (
    <section className="overview-panel" aria-labelledby="reasons-title">
      <h3 id="reasons-title">{formatNumber(String(total))} clients didn&apos;t connect</h3>
      <p className="hint">One reason per client; the rows add up to {formatNumber(String(total))}.</p>
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
