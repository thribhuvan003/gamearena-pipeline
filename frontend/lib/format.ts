// format.ts: turns database values into text for the screen.

export function formatNumber(value: string): string {      // "6501" -> "6,501". Called by the cards and tables
  return Number(value).toLocaleString("en-US");
}

export function formatTime(value: Date): string {          // A timestamp -> "2026-10-17 08:27 UTC". Called by the session tables
  return value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function formatClock(value: Date): string {         // A timestamp -> "2026-10-17 08:27:31.123" (UTC, to the millisecond). Called by the session timeline, where events are seconds apart
  return value.toISOString().slice(0, 23).replace("T", " ");
}

export function shortId(id: string): string {             // A UUID's first 8 characters, for lists; the full ID stays in a title or the facts. Called by the reason sheet and session view
  return id.slice(0, 8);
}

export function formatSeconds(value: string | null): string {   // "33" -> "33 s", "172" -> "2 min 52 s", null -> "-". Called by the client list
  if (value === null) return "-";
  const seconds = Number(value);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function rangeQuery(range: { from: string | null; to: string | null }): { from?: string; to?: string } {   // The date range as URL query values, leaving out empty sides. Called by every link that must keep the picked dates
  return { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) };
}

// Events shown muted in a timeline: ice.candidate.error (most clients that hit it still connect) and ws_error (in 6,136 of 6,546 sessions, connected ones too).
const MUTED_EVENTS = new Set(["ice.candidate.error", "ws_error"]);

export function isMuted(event: string): boolean {          // True for an event shown muted. Called by the session timeline
  return MUTED_EVENTS.has(event);
}

export function reasonLabel(reason: string): string {      // The pipeline's reason as shown on screen: no_video -> "no info" (tried, no success, and no failure event or failed video state recorded), others unchanged. Called wherever a reason is shown
  return reason === "no_video" ? "no info" : reason;
}

// Private bits that can appear inside the app's free-text messages: addresses, links, IDs and long tokens.
const PRIVATE = [
  /\b(?:https?|wss?|stuns?|turns?|ftp|mailto):\S+/gi,                                       // links, and video relay (STUN/TURN) server addresses
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                                                            // email addresses
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,                       // IDs (UUIDs)
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g,                                                    // IPv4, with an optional port
  /\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){4,7}\b/gi,                                               // IPv6 written out
  /\b[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|::1\b/gi,       // IPv6 shortened with "::", e.g. fe80::1
  /\b[A-Za-z0-9_-]{32,}\b/g,                                                                  // long tokens
];

export function redact(text: string | null): string | null {   // Replaces addresses, links, IDs and tokens in a message with [hidden]. Called by the session timeline before any app message is shown
  return text && PRIVATE.reduce((out, pattern) => out.replace(pattern, "[hidden]"), text);
}
