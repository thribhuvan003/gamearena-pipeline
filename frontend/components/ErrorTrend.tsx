// ErrorTrend.tsx: per day, the client connections that didn't connect with each error, as a chart with a key of what the app recorded for each error.

import { Fragment } from "react";
import ErrorChart from "./ErrorChart";
import { formatNumber, redact } from "@/lib/format";
import { getErrorKey, getErrorsPerDay, type ErrorKeyRow, type Range } from "@/lib/queries";

const COLOURS = ["#0a84ff", "#ff9f0a", "#30d158", "#bf5af2", "#ff375f", "#64d2ff", "#ffd60a"];
const WARNING_COLOUR = "#8e8e93";
const FIELDS: { field: ErrorKeyRow["field"]; label: string }[] = [
  { field: "message", label: "App message" }, { field: "phase", label: "Phase" }, { field: "stage", label: "Stage" }, { field: "text", label: "App's error text" },
];

export default async function ErrorTrend({ range }: { range: Range }) {   // Turns the per-day rows into one row per day with a count per error, picks a colour per error (warnings last, grey), and shows the chart and its key. Called by the dashboard page, after the errors table
  const [rows, key] = await Promise.all([getErrorsPerDay(range), getErrorKey(range)]);

  const days = new Map<string, Record<string, number | string>>();
  const warnings = new Set<string>();
  for (const row of rows) {
    const day = days.get(row.day) ?? { day: row.day };
    day[row.error] = Number(row.clients);
    days.set(row.day, day);
    if (row.warning) warnings.add(row.error);
  }
  const totals = new Map(key.filter((row) => row.field === "clients").map((row) => [row.error, Number(row.events)]));
  const errors = [...totals.keys()].sort((a, b) => Number(warnings.has(a)) - Number(warnings.has(b)) || totals.get(b)! - totals.get(a)!);
  const series = errors.map((name, i) => ({ name, colour: warnings.has(name) ? WARNING_COLOUR : COLOURS[i % COLOURS.length] }));

  return (
    <section>
      <h2>Errors in client connections that didn&apos;t connect, per day</h2>
      <p className="hint">Clients that didn&apos;t connect, per error recorded each day (UTC). What the codes mean is not in the data.</p>
      {rows.length === 0 ? (
        <p className="hint">No errors in client connections that didn&apos;t connect in this period.</p>
      ) : (
        <>
          <ErrorChart days={[...days.values()]} series={series} />
          <div className="list">
            {series.map(({ name, colour }) => (
              <div key={name} className={warnings.has(name) ? "list-row muted" : "list-row"}>
                <span className="swatch" style={{ background: colour }} />
                <div className="row-main">
                  <span className="mono">{name}</span>
                  {warnings.has(name) && <> <span className="badge badge-warning">warning</span></>}
                  <details className="more">
                    <summary>Details</summary>
                    <dl className="kv">
                      {FIELDS.map(({ field, label }) => {
                        const values = key.filter((row) => row.error === name && row.field === field);
                        if (values.length === 0) return null;
                        return (
                          <Fragment key={field}>
                            <dt>{label}</dt>
                            <dd>{values.map((row) => `${redact(row.value) ?? "none"} (${formatNumber(row.events)})`).join(", ")}</dd>
                          </Fragment>
                        );
                      })}
                    </dl>
                  </details>
                </div>
                <span className="row-end">{formatNumber(String(totals.get(name)))}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
