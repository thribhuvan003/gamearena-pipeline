// ConnectionTrend.tsx: daily chart of the client connections that didn't connect, by each client's first event day (UTC).

import ConnectionChart from "./ConnectionChart";
import { getDailyConnections, type Range } from "@/lib/queries";

export default async function ConnectionTrend({ range }: { range: Range }) {   // Reads the per-day counts and draws them. Called by the overview, next to the client categories
  const rows = await getDailyConnections(range);
  const days = rows.map((row) => ({
    day: Date.parse(row.day + "T00:00:00Z"),
    count: Number(row.not_connected),
  }));

  return (
    <section className="overview-panel" aria-labelledby="trend-title">
      <h2 id="trend-title">Clients that didn't connect, per day</h2>
      <p className="hint">By each client's first event day (UTC).</p>
      {days.length === 0 ? (
        <p className="hint">No measured connections in this period.</p>
      ) : (
        <ConnectionChart days={days} seriesLabel="Didn't connect" />
      )}
    </section>
  );
}
