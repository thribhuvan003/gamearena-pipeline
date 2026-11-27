// ConnectionTrend.tsx: clients that didn't connect per day (UTC, each client's first event): all of them with the day's rate, or one reason.

import TrendChart, { ALL, type Series } from "./TrendChart";
import { reasonLabel } from "@/lib/format";
import { getDailyConnections, getReasonSeries, type Range } from "@/lib/queries";

const toDay = (day: string) => Date.parse(day + "T00:00:00Z");

export default async function ConnectionTrend({ range }: { range: Range }) {   // Builds "All" plus one series per reason (largest first, undetermined last)
  const [daily, rows] = await Promise.all([getDailyConnections(range), getReasonSeries(range)]);
  const all: Series = {
    id: ALL,
    title: "All clients that didn't connect",
    total: String(daily.reduce((sum, row) => sum + Number(row.not_connected), 0)),
    points: daily.map((row) => ({ day: toDay(row.day), count: Number(row.not_connected), of: Number(row.clients) })),
  };
  const count = (reason: string, day: string) => Number(rows.find((row) => row.reason === reason && row.day === day)?.clients ?? 0);
  const reasons: Series[] = rows
    .filter((row) => row.day === null)
    .sort((a, b) => Number(a.reason === "no_video") - Number(b.reason === "no_video") || Number(b.clients) - Number(a.clients))
    .map((row) => ({ id: row.reason, title: reasonLabel(row.reason), total: row.clients, points: daily.map((d) => ({ day: toDay(d.day), count: count(row.reason, d.day) })) }));

  return (
    <section className="overview-panel" aria-labelledby="trend-title">
      <h3 id="trend-title">Clients that didn&apos;t connect, per day</h3>
      <p className="hint">Every series counts by each client&apos;s first event day (UTC), so they line up with the daily totals.</p>
      {daily.length === 0 ? <p className="hint">No measured connections in this period.</p> : <TrendChart series={[all, ...reasons]} />}
    </section>
  );
}
