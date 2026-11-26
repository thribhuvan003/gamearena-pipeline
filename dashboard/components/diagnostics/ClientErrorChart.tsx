"use client";
// ClientErrorChart.tsx: the per-day chart of one chosen client error at a time, with buttons to switch errors (warnings last) and that error's details.

import { useState, type ReactNode } from "react";
import { dayLabel, formatNumber } from "@/lib/format";
import DailyBarChart from "@/components/shared/DailyBarChart";

export type IssueSeries = {
  id: string;
  title: string;
  warning: boolean;
  total: string;
  points: { day: number; count: number }[];
  details: ReactNode;
};

export default function ClientErrorChart({ series }: { series: IssueSeries[] }) {   // Shows one error's daily bars and lets you pick another (errors by size, then Other, then warnings). Called by ClientErrorTrend; client JS because the choice happens in the browser
  const errors = series.filter((issue) => !issue.warning);
  const warnings = series.filter((issue) => issue.warning);
  const choices = [...errors.filter((issue) => issue.id !== "Other"), ...errors.filter((issue) => issue.id === "Other"), ...warnings];
  const [selected, setSelected] = useState(choices[0].id);
  const issue = choices.find((choice) => choice.id === selected) ?? choices[0];

  function issueButton(choice: IssueSeries) {
    return (
      <button
        className="issue-choice"
        type="button"
        aria-pressed={choice.id === issue.id}
        key={choice.id}
        onClick={() => setSelected(choice.id)}
      >
        <span>{choice.title}</span>
        <strong>{formatNumber(choice.total)}</strong>
      </button>
    );
  }

  return (
    <>
      <p className="hint">Clients that didn't connect, by error and event day (UTC). Pick an error to see its daily count.</p>
      <div className="issue-trend-grid">
        <div>
          <div className="issue-list-heading"><strong>Issue</strong><span>Connections</span></div>
          {errors.length > 0 && <div className="issue-choices" role="group" aria-label="Errors">{choices.filter((choice) => !choice.warning).map(issueButton)}</div>}
          {warnings.length > 0 && (
            <div className="issue-warning-group" role="group" aria-label="Warnings">
              <h4>Warnings</h4>
              <div className="issue-choices">{warnings.map(issueButton)}</div>
            </div>
          )}
        </div>
        <div className="issue-trend-panel">
          <div aria-live="polite">
            <h4>{issue.title}</h4>
            <p className="hint">Client IDs with this event per day (UTC)</p>
          </div>
          <DailyBarChart
            days={issue.points}
            seriesLabel="Client IDs"
            height={220}
            colour={issue.warning ? "var(--warn)" : "var(--accent)"}
          />
          <details className="disclosure" key={issue.id + "-days"}>
            <summary>Daily counts</summary>
            <ul className="issue-daily-values">
              {issue.points.filter(({ count }) => count > 0).map(({ day, count }) => (
                <li key={day}>
                  <time dateTime={dayString(day)}>{dayLabel(dayString(day))}</time>
                  <span>{formatNumber(String(count))}</span>
                </li>
              ))}
            </ul>
          </details>
          <details className="disclosure" key={issue.id + "-details"}>
            <summary>{issue.id === "Other" ? "Included errors" : "Recorded details"}</summary>
            <div className="disclosure-body">{issue.details}</div>
          </details>
        </div>
      </div>
      <p className="hint issue-count-note">Totals count each connection once per issue. A connection can appear under multiple issues or on multiple days.</p>
    </>
  );
}

function dayString(value: number): string {   // A chart day (milliseconds) as "YYYY-MM-DD". Called by ClientErrorChart for its day labels
  return new Date(value).toISOString().slice(0, 10);
}
