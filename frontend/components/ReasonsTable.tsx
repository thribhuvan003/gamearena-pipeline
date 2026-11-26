import Link from "next/link";
import { formatNumber, reasonLabel } from "@/lib/format";
import { link, type Sheet } from "@/lib/links";
import { getConnectionReasons, type Range } from "@/lib/queries";

export default async function ReasonsTable({ range, sheet }: { range: Range; sheet: Sheet }) {
  const rows = await getConnectionReasons(range);

  return (
    <section className="overview-panel" aria-labelledby="reasons-title">
      <h2 id="reasons-title">No success recorded: pipeline categories</h2>
      <p className="hint">The pipeline assigns one category per client connection without a success event, using logged failure phase, video state, or missing evidence. These are clues, not confirmed root causes.</p>
      {rows.length === 0 ? (
        <p className="hint">No connections without a recorded success in this period.</p>
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
                  {row.reason === "no_video" && <span className="reason-detail">The logs don’t establish a cause.</span>}
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
