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
