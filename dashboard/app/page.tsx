// page.tsx: the dashboard at http://localhost:3000. Numbers first, then the reasons and errors, then the sessions behind a clicked reason.

import { Suspense } from "react";
import ErrorTable from "@/components/ErrorTable";
import ReasonsTable from "@/components/ReasonsTable";
import SessionList from "@/components/SessionList";
import SummaryCards from "@/components/SummaryCards";

export default function Home({ searchParams }: PageProps<"/">) {          // Lays out the page. Next.js calls it on every visit to /
  return (
    <main>
      <h1>GameArena</h1>
      <p className="hint">Results of the GameArena pipeline, read live from the database on every page load.</p>
      <Suspense fallback={<p className="hint">Loading…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/">, "searchParams">) {   // Reads the clicked reason from the URL (?reason=...) and shows every section. Called by Home inside <Suspense>, because the URL is only known when someone visits
  const { reason } = await searchParams;
  const selected = typeof reason === "string" ? reason : undefined;

  return (
    <>
      <SummaryCards />
      <ReasonsTable selected={selected} />
      {selected && <SessionList reason={selected} />}
      <ErrorTable />
    </>
  );
}
