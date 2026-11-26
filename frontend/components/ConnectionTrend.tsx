import Link from "next/link";
import ConnectionChart from "./ConnectionChart";
import { dayLabel, formatNumber } from "@/lib/format";
import { link } from "@/lib/links";
import { getDailyConnections, type Range } from "@/lib/queries";

export default async function ConnectionTrend({ range }: { range: Range }) {
  const rows = await getDailyConnections(range);
  const days = rows.map((row) => ({
    day: Date.parse(row.day + "T00:00:00Z"),
    count: Number(row.not_connected),
  }));

  return (
    <section className="overview-panel" aria-labelledby="trend-title">
      <h2 id="trend-title">No recorded success over time</h2>
      <p className="hint">Client connection IDs with events but no success event, by their first recorded day (UTC). This is an outcome count, not a count of failure events.</p>
      {days.length === 0 ? (
        <p className="hint">No measured connections in this period.</p>
      ) : (
        <>
          <ConnectionChart days={days} seriesLabel="No success recorded" />
          <details className="daily-values">
            <summary>View daily counts</summary>
            <ul className="list">
              {[...rows].reverse().map((row) => (
                <li key={row.day}>
                  <Link href={link({ from: row.day, to: row.day }, { list: "clients_not_connected" })} scroll={false} className="list-row" aria-label={`${dayLabel(row.day)}: ${formatNumber(row.not_connected)} connections without a recorded success. View connections.`}>
                    <span className="row-main">{dayLabel(row.day)}</span>
                    <span className="row-end">{formatNumber(row.not_connected)}</span>
                    <span className="chevron" aria-hidden="true">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
