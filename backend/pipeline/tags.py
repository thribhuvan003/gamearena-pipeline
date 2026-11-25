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

    if video_failed(item):
        return "video_connection_failed"

    event_names = item["event_names"]
    if tag == "failed" and ("host_connected" not in event_names or "client_connected" not in event_names):
        return "someone_never_joined"

    return "no_video"


def last_failure_phase(session):                             # Phase of the last pipeline.connect.failure, else None
    phase = None
    for name, event_phase in zip(session["event_names"], session["phases"]):
        if name == "pipeline.connect.failure":
            phase = event_phase
    return phase


def video_failed(session):                                   # True if webrtc.connection.state ever went to failed
    for name, state in zip(session["event_names"], session["states"]):
        if name == "webrtc.connection.state" and state == "failed":
            return True
    return False
