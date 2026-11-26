// ConnectionTrend.tsx: clients that didn't connect per day: all of them, or one error at a time with what the app logged for it.

import TrendChart, { ALL, type Series } from "./TrendChart";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { getDailyConnections, getErrorDetails, getErrorSeries, type ErrorDetailRow, type Range } from "@/lib/queries";

const OTHER = "Other";
const FIELDS: { field: ErrorDetailRow["field"]; label: string }[] = [
  { field: "message", label: "App message" },
  { field: "phase", label: "Phase" },
  { field: "stage", label: "Stage" },
  { field: "text", label: "App error text" },
];
const toDay = (day: string) => Date.parse(day + "T00:00:00Z");

export default async function ConnectionTrend({ range }: { range: Range }) {   // Builds "All" plus one series per error (by size, Other, then warnings) for the chart
  const [daily, rows, details] = await Promise.all([getDailyConnections(range), getErrorSeries(range), getErrorDetails(range)]);
  const all: Series = {
    id: ALL,
    title: "All clients that didn't connect",
    warning: false,
    total: String(daily.reduce((sum, row) => sum + Number(row.not_connected), 0)),
    points: daily.map((row) => ({ day: toDay(row.day), count: Number(row.not_connected) })),
    details: null,
  };

  const totals = rows.filter((row) => row.day === null).sort((a, b) =>
    Number(a.warning) - Number(b.warning) || Number(a.series === OTHER) - Number(b.series === OTHER) || Number(b.clients) - Number(a.clients));
  const named = new Set(totals.filter((row) => row.series !== OTHER).map((row) => row.series));
  const days = [...new Set(rows.filter((row) => row.day).map((row) => row.day!))].sort();
  const count = (series: string, day: string) => Number(rows.find((row) => row.series === series && row.day === day)?.clients ?? 0);

  const errors: Series[] = totals.map((row) => ({
    id: row.series,
    title: row.series === OTHER ? "Other errors" : eventLabel(row.series),
    warning: row.warning,
    total: row.clients,
    points: days.map((day) => ({ day: toDay(day), count: count(row.series, day) })),
    details: row.series === OTHER
      ? <ul className="daily-values">{details.filter((value) => value.field === "clients" && !named.has(value.error)).map((value) => (
          <li key={value.error}><code>{value.error}</code><span>{formatNumber(value.events)} clients</span></li>
        ))}</ul>
      : <ErrorDetails signature={row.series} values={details.filter((value) => value.error === row.series)} />,
  }));

  return (
    <section className="overview-panel" aria-labelledby="trend-title">
      <h3 id="trend-title">Clients that didn't connect, per day</h3>
      {daily.length === 0 ? <p className="hint">No measured connections in this period.</p> : <TrendChart series={[all, ...errors]} />}
    </section>
  );
}

function ErrorDetails({ signature, values }: { signature: string; values: ErrorDetailRow[] }) {   // What the app logged with one error (message, phase, stage, text; private bits hidden), with counts
  const fields = FIELDS
    .map(({ field, label }) => ({ label, entries: values.filter((value) => value.field === field && value.value !== null) }))
    .filter(({ entries }) => entries.length > 0);
  return (
    <dl className="compact-facts">
      <div><dt>Event signature</dt><dd><code>{signature}</code></dd></div>
      {fields.map(({ label, entries }) => (
        <div key={label}><dt>{label}</dt><dd>{entries.map((value) => `${redact(value.value)} (${formatNumber(value.events)})`).join(", ")}</dd></div>
      ))}
    </dl>
  );
}
