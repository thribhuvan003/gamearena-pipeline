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

export function shortId(id: string): string {             // A UUID's first 8 characters, for lists; the full ID stays in a title or the facts. Called by the sheet
  return id.slice(0, 8);
}

export function percent(part: string, whole: string): string {   // part as a share of whole, to one decimal ("0" when whole is 0). Called by the cards and the attention list, for the muted share next to a count
  return Number(whole) === 0 ? "0" : (Math.round((1000 * Number(part)) / Number(whole)) / 10).toString();
}

const TAG_LABELS: Record<string, string> = {
  connected: "Connected",
  not_connected: "Didn’t connect",
  failed: "Failed",
  no_attempt: "No attempt recorded",
  unknown: "Outcome unknown",
};

export function tagText(tag: string, reason: string | null): string {
  const label = TAG_LABELS[tag] ?? reasonLabel(tag);
  return reason ? `${label} · ${reasonLabel(reason)}` : label;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const FULL_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function dayLabel(day: string, year = true): string {
  return (year ? FULL_DAY_FORMAT : DAY_FORMAT).format(new Date(day + "T00:00:00Z"));
}

export function formatSeconds(value: string | null): string {   // "33" -> "33 s", "172" -> "2 min 52 s", null -> "-". Called by the client list
  if (value === null) return "-";
  const seconds = Number(value);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

// Events shown muted in a timeline: ice.candidate.error (most clients that hit it still connect) and ws_error (in 6,136 of 6,546 sessions, connected ones too).
const MUTED_EVENTS = new Set(["ice.candidate.error", "ws_error"]);

export function isMuted(event: string): boolean {          // True for an event shown muted. Called by the session timeline
  return MUTED_EVENTS.has(event);
}

const REASON_LABELS: Record<string, string> = {
  no_video: "Reason unknown",
  setup_error: "Setup failed",
  video_connection_failed: "Video connection failed",
  someone_never_joined: "Host or client join missing",
  error_while_connecting: "Error while connecting",
  error_other: "Other connection error",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
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

const EVENT_LABELS: Record<string, string> = {
  "pipeline.connect.attempt": "Connection attempt",
  "pipeline.connect.success": "Connection succeeded",
  "pipeline.connect.failure": "Connection failed",
  "pipeline.connection.dropped": "Connection dropped",
  "ice.candidate.error": "Network candidate warning",
  "ice.connection.state": "Network connection state",
  "webrtc.connection.state": "WebRTC connection state",
  "media.decode.error": "Video decoding error",
  "media.first_decode": "First video frame decoded",
  "ws.reconnect.exhausted": "WebSocket retries exhausted",
  ws_error: "WebSocket warning",
};

export function eventLabel(signature: string): string {
  const [name, code] = signature.split(" ", 2);
  const label = EVENT_LABELS[name] ?? name.replaceAll(/[._]/g, " ").replace(/^./, (first) => first.toUpperCase());
  return code ? `${label} · Code ${code}` : label;
}
