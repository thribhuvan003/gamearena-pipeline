import ConnectionChart from "./ConnectionChart";
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
        <ConnectionChart days={days} seriesLabel="No success recorded" />
      )}
    </section>
  );
}
