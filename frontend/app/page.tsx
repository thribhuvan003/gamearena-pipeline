// page.tsx: the dashboard at http://localhost:3000: header with the date filter, the numbers, the reasons, the errors, the daily error chart, and the reason sheet when one is open.

import { Suspense } from "react";
import DateFilter from "@/components/DateFilter";
import ErrorTable from "@/components/ErrorTable";
import ErrorTrend from "@/components/ErrorTrend";
import ReasonSheet from "@/components/ReasonSheet";
import ReasonsTable from "@/components/ReasonsTable";
import SummaryCards from "@/components/SummaryCards";
import type { Range } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <Suspense fallback={<div className="page-head"><h1>GameArena</h1><p className="hint">Loading…</p></div>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads the dates (?from=&to=), the opened reason (?reason=) and the opened client (?client=) from the URL and shows every section, with the sheet last. Called by Home inside <Suspense> (shows "Loading…" until ready), because the URL is only known when someone visits
  const params = await searchParams;
  const range: Range = { from: readDate(params.from), to: readDate(params.to) };
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const client = typeof params.client === "string" ? params.client : undefined;

  return (
    <>
      <div className="page-head">
        <h1>GameArena</h1>
        <DateFilter range={range} />
      </div>
      <SummaryCards range={range} />
      <ReasonsTable reason={reason} range={range} />
      <ErrorTable range={range} />
      <ErrorTrend range={range} />
      {reason && <Suspense fallback={<div className="sheet"><p className="hint">Loading…</p></div>}><ReasonSheet reason={reason} client={client} range={range} /></Suspense>}
    </>
  );
}

function readDate(value: string | string[] | undefined): string | null {   // Keeps a URL value only if it is a real calendar day like 2026-10-01 (2026-02-31 rolls over, so it won't read back the same), else null = no limit. Called by Dashboard for ?from= and ?to=
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
