// format.ts: turns database values into text for the screen.

// ---------- Numbers and times ----------

export function formatNumber(value: string): string {      // "6501" -> "6,501"
  return Number(value).toLocaleString("en-US");
}

export function percent(part: string, whole: string): string {   // part of whole to one decimal, e.g. "76.6"; "0" when whole is 0
  return Number(whole) === 0 ? "0" : (Math.round((1000 * Number(part)) / Number(whole)) / 10).toString();
}

export function formatTime(value: Date): string {          // A timestamp -> "2026-10-17 08:27 UTC"
  return value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function formatClock(value: Date): string {         // A timestamp -> "2026-10-17 08:27:31.123" (UTC, to the millisecond), for the timeline
  return value.toISOString().slice(0, 23).replace("T", " ");
}

export function formatSeconds(value: string | null): string {   // "33" -> "33 s", "172" -> "2 min 52 s", null -> "-"
  if (value === null) return "-";
  const seconds = Number(value);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const FULL_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function dayLabel(day: string, year = true): string {   // "2026-10-17" -> "17 Oct 2026" (or "17 Oct" without the year)
  return (year ? FULL_DAY_FORMAT : DAY_FORMAT).format(new Date(day + "T00:00:00Z"));
}

export function isoDay(ms: number): string {   // A chart day in milliseconds -> "2026-10-17" (UTC)
  return new Date(ms).toISOString().slice(0, 10);
}

export function shortId(id: string): string {   // A UUID's first 8 characters, for lists
  return id.slice(0, 8);
}

// ---------- Tags and reasons ----------

const TAG_LABELS: Record<string, string> = {
  connected: "Connected",
  not_connected: "Didn't connect",
  failed: "Didn't connect",
  no_attempt: "No attempt",
  unknown: "Outcome not recorded",
};

const REASON_LABELS: Record<string, string> = {
  no_video: "No failure rule matched",
  "no_video:nothing": "No failure rule matched · no warnings or errors",
  "no_video:ice_warning": "No failure rule matched · network candidate warning",
  "no_video:warning": "No failure rule matched · other warnings",
  "no_video:error": "No failure rule matched · an error no rule uses",
  setup_error: "Setup failed",
  video_connection_failed: "WebRTC reported failed",
  network_connection_failed: "ICE reported failed",
  video_decode_error: "Video decoding error",
  connection_dropped: "Drop logged, never connected",
  someone_never_joined: "Host or client join missing",
  error_while_connecting: "Error while connecting",
  error_other: "Other connection error",
};

// What put a session or client in each category, from the rules in pipeline/tags.py (checked in this order; first match wins).
const REASON_EXPLAINED: Record<string, string> = {
  setup_error: "Its last pipeline.connect.failure was in phase pre-connect.",
  error_while_connecting: "Its last pipeline.connect.failure was in phase connecting.",
  error_other: "Its last pipeline.connect.failure was in another phase.",
  video_connection_failed: "No connect failure logged, but webrtc.connection.state went to failed.",
  network_connection_failed: "No connect failure or failed video state, but ice.connection.state went to failed.",
  video_decode_error: "None of the above, but media.decode.error was logged.",
  connection_dropped: "None of the above, but pipeline.connection.dropped was logged.",
  someone_never_joined: "No failure logged, and host_connected or client_connected never arrived.",
  "no_video:nothing": "No failure rule matched, and none of its own events was a warning or an error.",
  "no_video:ice_warning": "No failure rule matched; it logged ice.candidate.error (a network candidate warning), maybe other warnings too.",
  "no_video:warning": "No failure rule matched; it logged warnings (e.g. ws_error, ws.disconnect, a state that never reached failed), no errors.",
  "no_video:error": "No failure rule matched, but it logged an error: after session_ended, or one no rule uses.",
};

export function reasonLabel(reason: string): string {   // A category's screen name, e.g. no_video -> "No failure rule matched"
  return REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
}

export function tagText(tag: string, reason: string | null): string {   // A tag in words with its category, e.g. "Didn't connect · Setup failed"
  const label = TAG_LABELS[tag] ?? reasonLabel(tag);
  return reason ? `${label} · ${reasonLabel(reason)}` : label;
}

function reasonExplanation(reason: string, unit: "sessions" | "clients"): string | null {   // A category's one-line meaning
  if (reason === "no_video") {
    return unit === "sessions"
      ? "Host and client joined and it tried, but no connect failure, failed video or network state, decode error or drop was logged."
      : "It tried, but no connect failure, failed video or network state, decode error or drop was logged.";
  }
  return REASON_EXPLAINED[reason] ?? null;
}

// ---------- List explanations ----------

// What puts a session or client in each list, in the words of its SQL condition or pipeline rule.
const COHORT_EXPLAINED: Record<string, string> = {
  app_sessions: "Every session in the app's own records, by its start time.",
  with_telemetry: "App sessions that logged at least one event.",
  no_telemetry: "App sessions that never logged an event.",
  tag_failed: "Ended sessions that logged pipeline.connect.attempt but never pipeline.connect.success.",
  failed_other: "Ended sessions with no pipeline.connect.success, and a reason other than setup failed or a missing join.",
  clients: "Client connections that logged events, one row per connection ID.",
  clients_connected: "The app logged pipeline.connect.success for this client.",
  clients_not_connected: "The app logged events for this client, but never pipeline.connect.success.",
  clients_unknown: "Only server (system) events exist for this client; the app logged none.",
  no_client_error: "Sessions that logged this error with no client ID.",
  client_error: "Clients that logged this error at least once, any outcome.",
  session_end_reason: "App sessions with this end reason in the app's own record.",
  client_label: "Clients that didn't connect, whose app record has this device, OS, browser or access type.",
};

export function cohortExplanation(key: string, arg: string | null): string | null {   // A list's one-line logic, under its row and at the top of its sheet
  if (key === "session_reason" && arg) return reasonExplanation(arg, "sessions");
  if (key === "client_reason" && arg) return reasonExplanation(arg, "clients");
  return COHORT_EXPLAINED[key] ?? null;
}

// ---------- Event names ----------

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

export function eventLabel(signature: string): string {   // "pipeline.connect.failure 500" -> "Connection failed · Code 500"
  const [name, code] = signature.split(" ", 2);
  const label = EVENT_LABELS[name] ?? name.replaceAll(/[._]/g, " ").replace(/^./, (first) => first.toUpperCase());
  return code ? `${label} · Code ${code}` : label;
}

export function labelText(arg: string): string {   // A client label list's "kind|value" -> "Browser: Chrome"
  const [kind, value] = [arg.slice(0, arg.indexOf("|")), arg.slice(arg.indexOf("|") + 1)];
  return `${{ device: "Device", os: "OS", browser: "Browser", access: "Access" }[kind] ?? kind}: ${value}`;
}

// ---------- Private text ----------

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

export function redact(text: string | null): string | null {   // Replaces addresses, links, IDs and tokens with [hidden] before any app text is shown
  return text && PRIVATE.reduce((out, pattern) => out.replace(pattern, "[hidden]"), text);
}
