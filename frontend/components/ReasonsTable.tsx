// ReasonsTable.tsx: client connections that didn't connect, per reason, then those in sessions where no client connected; each row opens its client connections in the sheet.

import Link from "next/link";
import { formatNumber, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getClientCounts, getConnectionReasons, type Range } from "@/lib/queries";

export default async function ReasonsTable({ range, sheet }: { range: Range; sheet: Sheet }) {   // Lists the client reasons for the range, the open one selected, then the clients_alone row. Called by the dashboard page
  const [rows, counts] = await Promise.all([getConnectionReasons(range), getClientCounts(range)]);

  return (
    <section>
      <h2>Why client connections didn&apos;t connect</h2>
      <p className="hint">no info = tried, but no failure event or failed video state was recorded.</p>
      {rows.length === 0 ? (
        <p className="hint">No client connections that didn&apos;t connect in this period.</p>
      ) : (
        <div className="list">
          {rows.map((row) => (
            <Link
              key={row.reason}
              href={link(range, { list: "client_reason", arg: row.reason })}
              scroll={false}
              className={sheet.list === "client_reason" && sheet.arg === row.reason ? "list-row selected" : "list-row"}
            >
              <span className="row-main mono">{reasonLabel(row.reason)}</span>
              <span className="row-end">{formatNumber(row.clients)} <span className="muted">{row.percent}%</span></span>
              <span className="chevron">›</span>
            </Link>
          ))}
          <Link
            href={link(range, { list: "clients_alone" })}
            scroll={false}
            className={sheet.list === "clients_alone" ? "list-row selected" : "list-row"}
          >
            <span className="row-main"><span className="mono">not_connected</span> in sessions where no client connected</span>
            <span className="row-end">{formatNumber(counts.clients_alone)}</span>
            <span className="chevron">›</span>
          </Link>
        </div>
      )}
    </section>
  );
}
