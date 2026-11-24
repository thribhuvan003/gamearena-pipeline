// ErrorTrend.tsx: section 4, per day, how many sessions that did not connect had each error. Reads the counts on the server and hands them to the chart.

import ErrorChart from "./ErrorChart";
import { getErrorsPerDay, type Range } from "@/lib/queries";

export default async function ErrorTrend({ range }: { range: Range }) {   // Turns the per-day rows into one row per day with a count per error, and shows the chart. Called by the dashboard page, after the errors table
  const rows = await getErrorsPerDay(range);

  const days = new Map<string, Record<string, number | string>>();
  const totals = new Map<string, number>();
  for (const row of rows) {
    const day = days.get(row.day) ?? { day: row.day };
    day[row.event] = Number(row.sessions);
    days.set(row.day, day);
    totals.set(row.event, (totals.get(row.event) ?? 0) + Number(row.sessions));
  }
  const events = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)!);

  return (
    <section>
      <h2>Errors in sessions that didn&apos;t connect, per day</h2>
      <p className="hint">Each bar is one day (UTC): how many sessions that never connected recorded each error that day. A rising bar means more players are being stopped by that error.</p>
      {rows.length === 0 ? <p className="hint">No failed sessions with errors in this period.</p> : <ErrorChart days={[...days.values()]} events={events} />}
    </section>
  );
}
