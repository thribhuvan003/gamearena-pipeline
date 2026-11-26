// links.ts: the dashboard's URL state (dates plus what the sheet shows) and the one function that builds every link, so a link always keeps the dates.

import type { Range } from "./queries";

// What the sheet shows: a cohort list (list, arg, page), a session (session, client = the client to mark, epage = its event page), or a search (q). Empty = closed.
export type Sheet = { filter?: string; list?: string; arg?: string; page?: number; session?: string; client?: string; epage?: number; q?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {   // True for a full UUID. Called before an ID from the URL reaches SQL
  return value !== undefined && UUID.test(value);
}

export function searchPrefix(q: string | undefined): string | null {   // The search text trimmed and lowercased if it can start an ID (8 to 36 hex digits or dashes), else null. Called by the page (one match opens it) and the sheet's search step
  const prefix = q?.trim().toLowerCase();
  return prefix && /^[0-9a-f-]{8,36}$/.test(prefix) ? prefix : null;
}

export function readSheet(params: Record<string, string | string[] | undefined>): Sheet {   // Reads the sheet's state from the URL, keeping only single text values and whole page numbers. Called by the dashboard page
  const text = (key: string) => (typeof params[key] === "string" && params[key] !== "" ? (params[key] as string) : undefined);
  const page = (key: string) => (text(key) && /^\d{1,6}$/.test(text(key)!) ? Number(text(key)) : undefined);
  return { filter: text("filter"), list: text("list"), arg: text("arg"), page: page("page"), session: text("session"), client: text("client"), epage: page("epage"), q: text("q") };
}

export function linkString(range: Range, sheet: Sheet = {}): string {   // The same link as text ("/?from=…"), for redirect() and the sheet's Escape key. Called by the sheet
  const query = new URLSearchParams(link(range, sheet).query).toString();
  return query ? `/?${query}` : "/";
}

export function link(range: Range, sheet: Sheet = {}): { pathname: "/"; query: Record<string, string> } {   // A link to the dashboard with these dates and this sheet state (empty parts left out; page 0 is the default). Called by every Link that opens, pages or closes something
  const parts: Record<string, string | number | null | undefined> = { from: range.from, to: range.to, view: range.view, ...sheet };
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(parts)) {
    if (value !== undefined && value !== null && value !== "" && !((key === "page" || key === "epage") && value === 0)) query[key] = String(value);
  }
  return { pathname: "/", query };
}
