"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dayLabel } from "@/lib/format";

const DAY = 86_400_000;
const date = (value: number) => new Date(value).toISOString().slice(0, 10);

export default function ConnectionChart({ days }: { days: { day: number; count: number }[] }) {
  const first = days[0].day;
  const last = days[days.length - 1].day;
  const dayCount = (last - first) / DAY;
  const step = Math.max(1, Math.ceil(dayCount / 4));
  const ticks = Array.from({ length: Math.floor(dayCount / step) + 1 }, (_, i) => first + i * step * DAY);
  const max = Math.max(1, ...days.map(({ count }) => count));

  return (
    <div className="connection-chart">
      <ResponsiveContainer width="100%" height={184}>
        <BarChart data={days} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--separator)" vertical={false} />
          <XAxis
            dataKey="day" type="number" domain={[first - DAY / 2, last + DAY / 2]}
            ticks={ticks} interval={0} tickFormatter={(value) => dayLabel(date(value), false)}
            tick={{ fill: "var(--text-2)", fontSize: 11 }} tickLine={false} axisLine={false}
          />
          <YAxis width={34} domain={[0, max]} allowDecimals={false} tickCount={4}
            tick={{ fill: "var(--text-2)", fontSize: 11 }} tickLine={false} axisLine={false}
          />
          <Tooltip
            labelFormatter={(value) => typeof value === "number" ? dayLabel(date(value)) : value}
            contentStyle={{ background: "var(--surface)", borderColor: "var(--separator)", borderRadius: 8 }}
            cursor={{ fill: "var(--accent-bg)" }}
          />
          <Bar dataKey="count" name="Didn’t connect" fill="var(--accent)" maxBarSize={Math.max(1, Math.min(22, Math.floor(255 / (dayCount + 1))))} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
