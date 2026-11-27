"use client";
// TrendChart.tsx: a list of series on the left (all clients that didn't connect, then each reason) and the picked one's daily bars and counts.

import { useState } from "react";
import DailyBarChart from "@/components/shared/DailyBarChart";
import { dayLabel, formatNumber, isoDay } from "@/lib/format";

export type Series = { id: string; title: string; total: string; points: { day: number; count: number; of?: number }[] };

export const ALL = "All";

export default function TrendChart({ series }: { series: Series[] }) {   // The series list, the picked series' bars and its daily counts (with the day's rate for All); runs in the browser for the picking
  const [picked, setPicked] = useState(ALL);
  const shown = series.find((item) => item.id === picked) ?? series[0];

  return (
    <div className="trend-layout">
      <div className="trend-list list" role="group" aria-label="Series">
        {series.map((item) => (
          <button key={item.id} type="button" className="list-row trend-choice" aria-pressed={item.id === shown.id} onClick={() => setPicked(item.id)}>
            <span className="row-main">{item.title}</span>
            <strong>{formatNumber(item.total)}</strong>
          </button>
        ))}
      </div>
      <div className="trend-main">
        <DailyBarChart days={shown.points} seriesLabel={shown.id === ALL ? "Didn't connect" : "Clients"} colour="var(--accent)" />
        <details className="disclosure" key={shown.id + "-days"}>
          <summary>Daily counts</summary>
          <ul className="daily-values">
            {shown.points.filter(({ count }) => count > 0).map(({ day, count, of }) => (
              <li key={day}>
                <time dateTime={isoDay(day)}>{dayLabel(isoDay(day))}</time>
                <span>{formatNumber(String(count))}{of ? ` of ${formatNumber(String(of))} tracked (${(100 * count / of).toFixed(1)}%)` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
