// page.tsx: the dashboard at http://localhost:3000. Date filter, then the numbers, the reasons and errors, the daily error chart, and the sessions behind a clicked reason.

import { Suspense } from "react";
import DateFilter from "@/components/DateFilter";
import ErrorTable from "@/components/ErrorTable";
import ErrorTrend from "@/components/ErrorTrend";
import ReasonsTable from "@/components/ReasonsTable";
import SessionList from "@/components/SessionList";
import SummaryCards from "@/components/SummaryCards";
import type { Range } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <h1>GameArena</h1>
      <p className="hint">Live numbers from GameArena sessions, read from the database on every page load.</p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads the dates (?from=&to=) and the clicked reason (?reason=) from the URL and shows every section. Called by Home inside <Suspense> (shows "Loading…" until ready), because the URL is only known when someone visits
  const params = await searchParams;
  const range: Range = { from: readDate(params.from), to: readDate(params.to) };
  const reason = typeof params.reason === "string" ? params.reason : undefined;

  return (
    <>
      <DateFilter range={range} />
      <SummaryCards range={range} />
      <ReasonsTable selected={reason} range={range} />
      {reason && <SessionList reason={reason} range={range} />}
      <ErrorTable range={range} />
      <ErrorTrend range={range} />
    </>
  );
}

function readDate(value: string | string[] | undefined): string | null {   // Keeps a URL value only if it is a real calendar day like 2026-10-01 (2026-02-31 is rejected), else null = no limit. Called by Dashboard for ?from= and ?to=
  if (typeof value !== "string") return null;
  const parsed = new Date(value);   // an impossible day rolls over to another day or is invalid, so it won't read back the same
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
