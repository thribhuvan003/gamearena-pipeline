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
  not_connected: "Didn't connect",
  failed: "Didn't connect",
  no_attempt: "No attempt",
  unknown: "Unknown",
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

// One line per pipeline category: what put the session or client in it, from the rules in backend/pipeline/tags.py (checked in this order; first match wins).
const REASON_EXPLAINED: Record<string, string> = {
  setup_error: "Its last pipeline.connect.failure was in phase pre-connect.",
  error_while_connecting: "Its last pipeline.connect.failure was in phase connecting.",
  error_other: "Its last pipeline.connect.failure was in another phase.",
  video_connection_failed: "No connect failure logged, but webrtc.connection.state went to failed.",
  someone_never_joined: "No failure logged, and host_connected or client_connected never arrived.",
};

export function reasonExplanation(reason: string, unit: "sessions" | "clients"): string | null {   // The one-line meaning of a category, for the line under its name. Called by ReasonsTable (clients) and Attention (sessions)
  if (reason === "no_video") {
    return unit === "sessions"
      ? "Host and client joined and it tried, but no failure or failed video state was logged."
      : "It tried, but no failure or failed video state was logged.";
  }
  return REASON_EXPLAINED[reason] ?? null;
}

// One line per list (cohort): what puts a session or client in it, in the words of its SQL condition or pipeline rule.
const COHORT_EXPLAINED: Record<string, string> = {
  app_sessions: "Every session in the app's own records, by its start time.",
  with_telemetry: "App sessions that logged at least one event.",
  no_telemetry: "App sessions that never logged an event.",
  no_end_event: "It has events, but session_ended was never logged.",
  several_attempts: "pipeline.connect.attempt was logged more than once in the session.",
  failure: "At least one pipeline.connect.failure was logged.",
  failure_then_success: "A pipeline.connect.failure came before its last pipeline.connect.success.",
  success_then_failure: "A pipeline.connect.failure came after its first pipeline.connect.success.",
  reconnected: "At least one client_reconnected was logged.",
  reconnected_10: "client_reconnected was logged 10 or more times.",
  tag_connected: "Ended sessions that logged pipeline.connect.success.",
  tag_failed: "Ended sessions that logged pipeline.connect.attempt but never pipeline.connect.success.",
  tag_no_attempt: "Ended sessions that never logged pipeline.connect.attempt.",
  clients: "Client connections that logged events, one row per connection ID.",
  clients_connected: "The app logged pipeline.connect.success for this client.",
  clients_not_connected: "The app logged events for this client, but never pipeline.connect.success.",
  clients_alone: "Clients that didn't connect, in sessions where no client connected.",
  clients_unknown: "Only server events exist for this client; the app logged nothing, so the outcome is unknown.",
  untied_error: "Sessions that logged this error without a client ID, so it belongs to the session, not to one client.",
  client_error: "Clients that logged this error at least once. Some of them may still have connected.",
};

export function cohortExplanation(key: string, arg: string | null): string | null {   // The one-line logic of a list, shown under its row and at the top of its sheet. Called by Attention and the sheet's list step
  if (key === "session_reason" && arg) return reasonExplanation(arg, "sessions");
  if (key === "client_reason" && arg) return reasonExplanation(arg, "clients");
  return COHORT_EXPLAINED[key] ?? null;
}

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

