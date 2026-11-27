// Daily totals use the same client cohort as the summary. Click a day to inspect its clients.
import Link from "next/link";
import DailyBarChart from "@/components/shared/DailyBarChart";
import { dayLabel, formatNumber, percent } from "@/lib/format";
import { link } from "@/lib/links";
import { getDailyConnections, type Range } from "@/lib/queries";

export default async function ConnectionTrend({ range }: { range: Range }) {
  const daily = await getDailyConnections(range);
  const points = daily.map((row) => ({ day: Date.parse(row.day + "T00:00:00Z"), count: Number(row.not_connected) }));
  return (
    <section className="overview-panel" aria-labelledby="trend-title">
      <h3 id="trend-title">Clients that didn't connect, per day</h3>
      <p className="hint">By first event day (UTC). Select a day's count to inspect those clients.</p>
      {points.length === 0 ? <p className="hint">No tracked connections in this period.</p> : <>
        <DailyBarChart days={points} />
        <details className="disclosure">
          <summary>Daily counts and share of tracked clients</summary>
          <ul className="daily-values">
            {daily.map((row) => <li key={row.day}>
              <time dateTime={row.day}>{dayLabel(row.day)}</time>
              <Link href={link({ from: row.day, to: row.day }, { list: "clients_not_connected" })} scroll={false}>
                {formatNumber(row.not_connected)} of {formatNumber(row.clients)} ({percent(row.not_connected, row.clients)}%)
              </Link>
            </li>)}
          </ul>
        </details>
      </>}
    </section>
  );
}
