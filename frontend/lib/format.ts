// format.ts: turns database values into text for the screen.

export function formatNumber(value: string): string {      // "6501" -> "6,501". Called by the cards and tables
  return Number(value).toLocaleString("en-US");
}

export function formatTime(value: Date): string {          // A timestamp -> "2026-10-17 08:27 UTC". Called by the session tables
  return value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
