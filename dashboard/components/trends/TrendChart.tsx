"use client";
// TrendChart.tsx: one per-day bar chart with a picker: all clients that didn't connect, or one error (warnings last).

import { useState, type ReactNode } from "react";
import DailyBarChart from "@/components/shared/DailyBarChart";
import { dayLabel, formatNumber, isoDay } from "@/lib/format";

export type Series = { id: string; title: string; warning: boolean; total: string; points: { day: number; count: number }[]; details: ReactNode };

export const ALL = "All";

export default function TrendChart({ series }: { series: Series[] }) {   // The picker, the picked series' bars, and its daily counts and details in folds; runs in the browser for the picker
  const [picked, setPicked] = useState(ALL);
  const shown = series.find((item) => item.id === picked) ?? series[0];
  const option = (item: Series) => <option key={item.id} value={item.id}>{item.title} ({formatNumber(item.total)})</option>;
  const warnings = series.filter((item) => item.warning);

  return (
    <>
      <label className="trend-picker">
        Show
        <select value={shown.id} onChange={(event) => setPicked(event.target.value)}>
          {series.filter((item) => !item.warning).map(option)}
          {warnings.length > 0 && <optgroup label="Warnings">{warnings.map(option)}</optgroup>}
        </select>
      </label>
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
    </>
  );
}
