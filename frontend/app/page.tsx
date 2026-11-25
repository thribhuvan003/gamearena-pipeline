// page.tsx: the dashboard at http://localhost:3000: header with the date filter and ID search, the numbers, what needs attention, the reasons, the errors, the daily error chart, and the side sheet when one is open.

import { redirect } from "next/navigation";
import { Suspense } from "react";
import Attention from "@/components/Attention";
import DateFilter from "@/components/DateFilter";
import ErrorTable from "@/components/ErrorTable";
import ErrorTrend from "@/components/ErrorTrend";
import ReasonsTable from "@/components/ReasonsTable";
import SearchBox from "@/components/SearchBox";
import Sheet from "@/components/Sheet";
import SummaryCards from "@/components/SummaryCards";
import { linkString, readSheet, searchPrefix } from "@/lib/links";
import { searchIds, type Range } from "@/lib/queries";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <Suspense fallback={<div className="page-head"><h1>GameArena</h1><p className="hint">Loading…</p></div>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads the dates (?from=&to=) and the sheet state (list, session, search) from the URL, opens a search's only match straight away, and shows every section, with the sheet last. Called by Home inside <Suspense> (shows "Loading…" until ready), because the URL is only known when someone visits
  const params = await searchParams;
  const range: Range = { from: readDate(params.from), to: readDate(params.to) };
  const sheet = readSheet(params);
  const prefix = sheet.session ? null : searchPrefix(sheet.q);
  const found = prefix ? await searchIds(prefix) : [];
  if (found.length === 1) redirect(linkString(range, { session: found[0].session_id, client: found[0].kind === "client" ? found[0].id : undefined }));

  return (
    <>
      <div className="page-head">
        <h1>GameArena</h1>
        <DateFilter range={range} />
        <SearchBox range={range} q={sheet.q} />
      </div>
      <SummaryCards range={range} />
      <Attention range={range} />
      <ReasonsTable range={range} sheet={sheet} />
      <ErrorTable range={range} />
      <ErrorTrend range={range} />
      {(sheet.list || sheet.session || sheet.q) && <Suspense fallback={<><div className="sheet-backdrop" /><div className="sheet"><p className="hint">Loading…</p></div></>}><Sheet range={range} sheet={sheet} /></Suspense>}
    </>
  );
}

function readDate(value: string | string[] | undefined): string | null {   // Keeps a URL value only if it is a real calendar day like 2026-10-01 (2026-02-31 rolls over, so it won't read back the same), else null = no limit. Called by Dashboard for ?from= and ?to=
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}
