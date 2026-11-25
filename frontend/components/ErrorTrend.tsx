// ErrorTrend.tsx: per day, the client connections that didn't connect with each of the top 5 errors and Other, as a chart with a key of what the app recorded for each error.

import { Fragment } from "react";
import ErrorChart from "./ErrorChart";
import { eventLabel, formatNumber, redact } from "@/lib/format";
import { getErrorKey, getErrorSeries, type ErrorKeyRow, type ErrorSeriesRow, type Range } from "@/lib/queries";

const COLOURS = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f"];
const OTHER = "Other";
const OTHER_COLOUR = "#aeaeb2";
const WARNING_COLOUR = "#8e8e93";
const FIELDS: { field: ErrorKeyRow["field"]; label: string }[] = [
  { field: "message", label: "App message" }, { field: "phase", label: "Phase" }, { field: "stage", label: "Stage" }, { field: "text", label: "App's error text" },
];

function rank(row: ErrorSeriesRow): number {   // 0 for a named error, 1 for Other, 2 for a warning, so the key and the stack keep that order. Called by ErrorTrend when it sorts the series
  return row.warning ? 2 : row.series === OTHER ? 1 : 0;
}

export default async function ErrorTrend({ range }: { range: Range }) {   // Splits getErrorSeries into range totals (day null) and one row per day, orders the series (top 5 by total, then Other, then warnings) with their colours, and shows the chart and its key. Called by the dashboard page, after the errors table
  const [rows, key] = await Promise.all([getErrorSeries(range), getErrorKey(range)]);

  const days = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    if (row.day === null) continue;
    const day = days.get(row.day) ?? { day: row.day };
    day[row.series] = Number(row.clients);
    days.set(row.day, day);
  }
  const totals = rows.filter((row) => row.day === null).sort((a, b) => rank(a) - rank(b) || Number(b.clients) - Number(a.clients));
  const series = totals.map((row, i) => ({ name: row.series, colour: row.warning ? WARNING_COLOUR : row.series === OTHER ? OTHER_COLOUR : COLOURS[i] }));
  const named = new Set(totals.filter((row) => row.series !== OTHER).map((row) => row.series));
  const folded = key.filter((row) => row.field === "clients" && !named.has(row.error));

  return (
    <details className="disclosure diagnostics-panel trend-disclosure">
      <summary>Daily error breakdown</summary>
      <div className="disclosure-body">
        <p className="hint">The five most common errors among connections that didn’t connect, by event day (UTC). A connection can appear in several series.</p>
        {rows.length === 0 ? (
          <p className="hint">No errors in client connections that didn&apos;t connect in this period.</p>
        ) : (
          <>
            <ErrorChart days={[...days.values()]} series={series} />
            <div className="list">
              {totals.map((row, i) => (
                <div key={row.series} className={row.warning ? "list-row muted" : "list-row"}>
                  <span className="swatch" style={{ background: series[i].colour }} />
                  <div className="row-main">
                    {row.series === OTHER ? OTHER : eventLabel(row.series)}
                    {row.warning && <> <span className="badge badge-warning">warning</span></>}
                    <details className="more">
                      <summary>Details</summary>
                      <dl className="kv">
                        {row.series === OTHER ? (
                          <>
                            <dt>Errors</dt>
                            <dd>
                              {folded.map((error, j) => (
                                <Fragment key={error.error}>
                                  {j > 0 && ", "}
                                  <span className="mono">{error.error}</span> ({formatNumber(error.events)})
                                </Fragment>
                              ))}
                            </dd>
                          </>
                        ) : (
                          FIELDS.map(({ field, label }) => {
                            const values = key.filter((value) => value.error === row.series && value.field === field);
                            if (values.length === 0) return null;
                            return (
                              <Fragment key={field}>
                                <dt>{label}</dt>
                                <dd>{values.map((value) => `${redact(value.value) ?? "none"} (${formatNumber(value.events)})`).join(", ")}</dd>
                              </Fragment>
                            );
                          })
                        )}
                      </dl>
                    </details>
                  </div>
                  <span className="row-end">{formatNumber(row.clients)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
