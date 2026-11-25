// ErrorChart.tsx: the stacked bar chart drawn in the browser with Recharts (charts need the browser, so this file is a client component).

"use client";

import { eventLabel } from "@/lib/format";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function ErrorChart({ days, series }: { days: Record<string, number | string>[]; series: { name: string; colour: string }[] }) {   // Draws one bar per day, split by error, in the colours ErrorTrend picked. Called by ErrorTrend with the counts it read on the server
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={days}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "currentColor", fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "none", borderRadius: 8, boxShadow: "var(--shadow)" }}
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
          />
          {series.map(({ name, colour }) => (
            <Bar key={name} name={eventLabel(name)} dataKey={(day) => day[name] ?? 0} stackId="errors" fill={colour} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
