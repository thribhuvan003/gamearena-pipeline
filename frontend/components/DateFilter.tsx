// DateFilter.tsx: the "from / to" date boxes at the top of the dashboard. A plain HTML form: pressing Show reloads the page with ?from=...&to=...

import Link from "next/link";
import { getDataDays, type Range } from "@/lib/queries";

export default async function DateFilter({ range }: { range: Range }) {   // Shows the two date boxes, filled with the current range and limited to the days that have data. Called by the dashboard page above the cards
  const { first, last } = await getDataDays();
  const limits = { min: first ?? undefined, max: last ?? undefined };

  return (
    <form className="filter" method="get" action="/">
      <label>From <input type="date" name="from" defaultValue={range.from ?? ""} {...limits} /></label>
      <label>To <input type="date" name="to" defaultValue={range.to ?? ""} {...limits} /></label>
      <button type="submit">Show</button>
      {(range.from || range.to) && <Link href="/">All dates</Link>}
      <span className="hint">
        {first ? `Data available: ${first} to ${last}. ` : "No data yet. "}
        Days are UTC. Sessions and connections by start time, errors by the time they were recorded.
      </span>
    </form>
  );
}
