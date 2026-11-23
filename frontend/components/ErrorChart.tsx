// ErrorChart.tsx: the stacked bar chart drawn in the browser with Recharts (charts need the browser, so this file is a client component).

"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLOURS = ["#1d5fd1", "#d1491d", "#2a9d5c", "#9b59b6", "#e0a100", "#16a3b8", "#6b7280"];

export default function ErrorChart({ days, events }: { days: Record<string, number | string>[]; events: string[] }) {   // Draws one bar per day, split by error. Called by ErrorTrend with the counts it read on the server
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={days}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {events.map((event, i) => (
            <Bar key={event} name={event} dataKey={(day) => day[event] ?? 0} stackId="errors" fill={COLOURS[i % COLOURS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
