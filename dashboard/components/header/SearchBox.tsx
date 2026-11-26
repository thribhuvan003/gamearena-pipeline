// SearchBox.tsx: the ID search in the page header, a plain HTML form that reloads the page with ?q=... and keeps the dates.

import type { Range } from "@/lib/queries";

export default function SearchBox({ range, q }: { range: Range; q?: string }) {   // The ID search box, keeping the dates as hidden fields
  return (
    <form className="search" action="/" method="get">
      {range.view && <input type="hidden" name="view" value={range.view} />}
      {range.from && <input type="hidden" name="from" value={range.from} />}
      {range.to && <input type="hidden" name="to" value={range.to} />}
      <input name="q" type="search" placeholder="Session or connection ID" defaultValue={q} minLength={8} maxLength={36} aria-label="Session or client connection ID" />
      <button type="submit">Find</button>
    </form>
  );
}
