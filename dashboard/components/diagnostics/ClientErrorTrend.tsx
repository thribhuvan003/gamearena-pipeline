// ClientErrorTrend.tsx: diagnostics' per-day chart of clients that didn't connect, by error (top 5 + Other), with what the app recorded for each error.

import { type ReactNode } from "react";
import ClientErrorChart, { type IssueSeries } from "./ClientErrorChart";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { getErrorDetails, getErrorSeries, type ErrorDetailRow, type Range } from "@/lib/queries";

const OTHER = "Other";
const FIELDS: { field: ErrorDetailRow["field"]; label: string }[] = [
  { field: "message", label: "App message" },
  { field: "phase", label: "Phase" },
  { field: "stage", label: "Stage" },
  { field: "text", label: "App error text" },
];

export default async function ClientErrorTrend({ range }: { range: Range }) {   // Reads the per-day counts and the details of each error and hands them to the chart, inside a fold. Called by the diagnostics view
  const [rows, key] = await Promise.all([getErrorSeries(range), getErrorDetails(range)]);
  const totals = rows.filter((row) => row.day === null).sort((a, b) => Number(b.clients) - Number(a.clients));
  const named = new Set(totals.filter((row) => row.series !== OTHER).map((row) => row.series));
  const folded = key.filter((row) => row.field === "clients" && !named.has(row.error));
  const days = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (!row.day) continue;
    const day = Date.parse(row.day + "T00:00:00Z");
    const counts = days.get(day) ?? new Map<string, number>();
    counts.set(row.series, Number(row.clients));
    days.set(day, counts);
  }

  const series: IssueSeries[] = totals.map((row) => ({
    id: row.series,
    title: row.series === OTHER ? "Other errors" : eventLabel(row.series),
    warning: row.warning,
    total: row.clients,
    points: [...days].map(([day, counts]) => ({ day, count: counts.get(row.series) ?? 0 })),
    details: row.series === OTHER
      ? <ul className="issue-signatures">{folded.map((error) => (
          <li key={error.error}><code>{error.error}</code><span>{formatNumber(error.events)} connections</span></li>
        ))}</ul>
      : <IssueDetails signature={row.series} values={key.filter((value) => value.error === row.series)} />,
  }));

  return (
    <details className="disclosure diagnostics-panel trend-disclosure">
      <summary>Per day: clients that didn't connect, by error</summary>
      <div className="disclosure-body">
        {series.length === 0 ? (
          <p className="hint">No errors on clients that didn't connect in this period.</p>
        ) : (
          <ClientErrorChart series={series} />
        )}
      </div>
    </details>
  );
}

function IssueDetails({ signature, values }: { signature: string; values: ErrorDetailRow[] }) {   // What the app recorded with one error (message, phase, stage, text; private bits hidden), with counts. Called by ClientErrorTrend for each error
  const fields: { label: string; value: ReactNode }[] = [{ label: "Event signature", value: <code>{signature}</code> }];
  for (const { field, label } of FIELDS) {
    const entries = values.filter((value) => value.field === field && value.value !== null);
    if (entries.length > 0) {
      fields.push({
        label,
        value: entries.map((value) => `${redact(value.value)} (${formatNumber(value.events)})`).join(", "),
      });
    }
  }
  return (
    <dl className="compact-facts">
      {fields.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
