"use client";
// TrendChart.tsx: a list of series on the left (all clients that didn't connect, then each error, warnings last) and the picked one's daily bars.

import { useState, type ReactNode } from "react";
import DailyBarChart from "@/components/shared/DailyBarChart";
import { dayLabel, formatNumber, isoDay } from "@/lib/format";

export type Series = { id: string; title: string; warning: boolean; total: string; points: { day: number; count: number }[]; details: ReactNode };

export const ALL = "All";

export default function TrendChart({ series }: { series: Series[] }) {   // The series list, the picked series' bars, and its daily counts and details; runs in the browser for the picking
  const [picked, setPicked] = useState(ALL);
  const shown = series.find((item) => item.id === picked) ?? series[0];
  const choice = (item: Series) => (
    <button key={item.id} type="button" className="list-row trend-choice" aria-pressed={item.id === shown.id} onClick={() => setPicked(item.id)}>
      <span className="row-main">{item.title}</span>
      <strong>{formatNumber(item.total)}</strong>
    </button>
  );
  const warnings = series.filter((item) => item.warning);

  return (
    <div className="trend-layout">
      <div className="trend-list list" role="group" aria-label="Series">
        {series.filter((item) => !item.warning).map(choice)}
        {warnings.length > 0 && <div className="trend-list-label">Warnings</div>}
        {warnings.map(choice)}
      </div>
      <div className="trend-main">
        <p className="hint">{shown.id === ALL ? "By each client's first event day (UTC)." : "Clients that didn't connect and logged this, by the day it was logged (UTC)."}</p>
        <DailyBarChart days={shown.points} seriesLabel={shown.id === ALL ? "Didn't connect" : "Clients"} colour={shown.warning ? "var(--warn)" : "var(--accent)"} />
        <details className="disclosure" key={shown.id + "-days"}>
          <summary>Daily counts</summary>
          <ul className="daily-values">
            {shown.points.filter(({ count }) => count > 0).map(({ day, count }) => (
              <li key={day}><time dateTime={isoDay(day)}>{dayLabel(isoDay(day))}</time><span>{formatNumber(String(count))}</span></li>
            ))}
          </ul>
        </details>
        {shown.details && (
          <details className="disclosure" key={shown.id + "-details"}>
            <summary>{shown.id === "Other" ? "Included errors" : "Recorded details"}</summary>
            <div className="disclosure-body">{shown.details}</div>
          </details>
        )}
      </div>
    </div>
  );
}
