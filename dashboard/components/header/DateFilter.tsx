// DateFilter.tsx: the compact "from / to" date filter in the page header, a plain HTML form that reloads the page with ?from=...&to=...

import Link from "next/link";
import { dayLabel } from "@/lib/format";
import { link } from "@/lib/links";
import { getDataDays, type Range } from "@/lib/queries";

export default async function DateFilter({ range }: { range: Range }) {   // The from / to boxes, limited to the days with data, and a line saying which days those are
  const { first, last } = await getDataDays();
  const limits = { min: first ?? undefined, max: last ?? undefined };

  return (
    <form className="filter" method="get" action="/">
      {range.view && <input type="hidden" name="view" value={range.view} />}
      <label>From <input type="date" name="from" defaultValue={range.from ?? ""} {...limits} /></label>
      <label>To <input type="date" name="to" defaultValue={range.to ?? ""} {...limits} /></label>
      <button type="submit">Apply dates</button>
      {(range.from || range.to) && <Link href={link({ from: null, to: null, view: range.view })}>All dates</Link>}
      <span className="hint">{first && last ? `Available: ${dayLabel(first, first.slice(0, 4) !== last.slice(0, 4))} to ${dayLabel(last)} · UTC` : "No data yet."}</span>
    </form>
  );
}
