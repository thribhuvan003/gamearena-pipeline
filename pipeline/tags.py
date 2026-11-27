# tags.py: decides each session's and each client connection's tag and, if it didn't connect, its reason. No database here, only the rules.


def tag_session(session):                                    # connected, failed or no_attempt
    event_names = session["event_names"]

    if "pipeline.connect.success" in event_names:
        return "connected"

    if "pipeline.connect.attempt" in event_names:
        return "failed"

    return "no_attempt"


def tag_connection(connection):                              # connected, not_connected or unknown
    if "pipeline.connect.success" in connection["event_names"]:
        return "connected"

    if connection["app_events"] == 0:
        return "unknown"

    return "not_connected"


def failure_reason(item, tag):                               # Why a failed session or a not_connected connection didn't connect (first match wins), else None. someone_never_joined is checked for sessions only
    if tag not in ("failed", "not_connected"):
        return None

    phase = last_failure_phase(item)
    if phase == "pre-connect":
        return "setup_error"
    if phase == "connecting":
        return "error_while_connecting"
    if phase is not None:
        return "error_other"

    if state_failed(item, "webrtc.connection.state"):
        return "video_connection_failed"
    if state_failed(item, "ice.connection.state"):
        return "network_connection_failed"

    event_names = item["event_names"]
    if "media.decode.error" in event_names:
        return "video_decode_error"
    if "pipeline.connection.dropped" in event_names:
        return "connection_dropped"
    if tag == "failed" and ("host_connected" not in event_names or "client_connected" not in event_names):
        return "someone_never_joined"

    return "no_video"


def last_failure_phase(session):                             # Phase of the last pipeline.connect.failure, else None
    phase = None
    for name, event_phase in zip(session["event_names"], session["phases"]):
        if name == "pipeline.connect.failure":
            phase = event_phase
    return phase


def state_failed(item, event):                               # True if this state event (webrtc or ice connection state) ever went to failed
    for name, state in zip(item["event_names"], item["states"]):
        if name == event and state == "failed":
            return True
    return False


# A client's device, OS and browser, from well-known tokens in its user agent (checked in this order; first match wins).
TV_TOKENS = ("smart-tv", "smarttv", "tizen", "web0s", "webos", "crkey", "googletv", "android tv", "bravia", " aft")
NO_APP_RECORD = "No app record"


def client_labels(in_app, user_agent, access):                # (device, os, browser, access) for one client; only these labels are stored, never the user agent
    if not in_app:
        return NO_APP_RECORD, NO_APP_RECORD, NO_APP_RECORD, NO_APP_RECORD
    ua = (user_agent or "").lower()
    has = lambda *tokens: any(token in ua for token in tokens)
    return device_label(has), os_label(has), browser_label(has), access or "Unknown"


def device_label(has):                                       # TV, Phone, Tablet, Samsung desktop mode, Desktop or Unknown
    if has(*TV_TOKENS):
        return "TV"
    if has("iphone", "ipod") or (has("android") and has("mobile")):
        return "Phone"
    if has("ipad", "android"):
        return "Tablet"
    if has("samsungbrowser") and has("x11"):
        return "Samsung desktop mode (phone, tablet or DeX: unconfirmed)"
    if has("windows", "macintosh", "cros", "x11"):
        return "Desktop"
    return "Unknown"


def os_label(has):                                           # The operating system named in the user agent, or Unknown
    for name, tokens in (("Tizen (Samsung TV)", ("tizen",)), ("Android", ("android",)), ("iOS", ("iphone", "ipad", "ipod")),
                         ("Windows", ("windows",)), ("ChromeOS", ("cros",)), ("macOS", ("macintosh",)), ("Linux", ("linux",))):
        if has(*tokens):
            return name
    return "Unknown"


def browser_label(has):                                      # The browser named in the user agent, or Unknown
    for name, tokens in (("Edge", ("edg/", "edga/", "edgios/")), ("Android WebView (in-app)", ("; wv)",)), ("Opera", ("opr/",)),
                         ("Samsung Internet", ("samsungbrowser",)), ("Firefox", ("firefox", "fxios")), ("Chrome", ("crios", "chrome")),
                         ("Safari", ("safari",))):
        if has(*tokens):
            return name
    return "Unknown"
