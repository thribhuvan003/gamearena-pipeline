// DateFilter.tsx: the "from / to" date boxes at the top of the dashboard. A plain HTML form: pressing Show reloads the page with ?from=...&to=...

import Link from "next/link";
import type { Range } from "@/lib/queries";

export default function DateFilter({ range }: { range: Range }) {   // Shows the two date boxes, filled with the current range. Called by the dashboard page above the cards
  return (
    <form className="filter" method="get" action="/">
      <label>From <input type="date" name="from" defaultValue={range.from ?? ""} /></label>
      <label>To <input type="date" name="to" defaultValue={range.to ?? ""} /></label>
      <button type="submit">Show</button>
      {(range.from || range.to) && <Link href="/">All dates</Link>}
      <span className="hint">Days are UTC. Sessions and connections by start time, errors by the time they were recorded.</span>
    </form>
  );
}
