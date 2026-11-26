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
