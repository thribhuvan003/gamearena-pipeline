# tags.py: decides each session's and each client connection's tag and, if it didn't connect, its reason. No database here, only the rules.


def tag_session(session):                                    # returns connected (it connected), failed (it only tried) or no_attempt (it never tried). Called by tag_new_sessions for each session
    event_names = session["event_names"]

    if "pipeline.connect.success" in event_names:
        return "connected"

    if "pipeline.connect.attempt" in event_names:
        return "failed"

    return "no_attempt"


def failure_reason(session, tag):                            # returns why a failed session failed (first match wins), or None if it didn't fail. Called by tag_new_sessions right after tag_session
    if tag != "failed":
        return None

    phase = last_failure_phase(session)
    if phase == "pre-connect":
        return "setup_error"
    if phase == "connecting":
        return "error_while_connecting"
    if phase is not None:
        return "error_other"

    if video_failed(session):
        return "video_connection_failed"

    event_names = session["event_names"]
    if "host_connected" not in event_names or "client_connected" not in event_names:
        return "someone_never_joined"

    return "no_video"


def tag_connection(connection):                              # returns connected (this connection got video), unknown (the app sent nothing on it) or not_connected. Called by tag_new_sessions for each client connection
    if "pipeline.connect.success" in connection["event_names"]:
        return "connected"

    if connection["app_events"] == 0:
        return "unknown"

    return "not_connected"


def connection_reason(connection, tag):                      # returns why a client connection didn't connect (same order as failure_reason; "never joined" doesn't apply to one connection), or None. Called by tag_new_sessions right after tag_connection
    if tag != "not_connected":
        return None

    phase = last_failure_phase(connection)
    if phase == "pre-connect":
        return "setup_error"
    if phase == "connecting":
        return "error_while_connecting"
    if phase is not None:
        return "error_other"

    if video_failed(connection):
        return "video_connection_failed"

    return "no_video"


def last_failure_phase(session):                             # returns the phase of the session's last connection error (pre-connect / connecting), or None. Called by failure_reason and connection_reason to see if and when an error was logged
    phase = None
    for name, event_phase in zip(session["event_names"], session["phases"]):
        if name == "pipeline.connect.failure":
            phase = event_phase
    return phase


def video_failed(session):                                   # returns True if the video connection (WebRTC) ever went to failed. Called by failure_reason and connection_reason when no error was logged
    for name, state in zip(session["event_names"], session["states"]):
        if name == "webrtc.connection.state" and state == "failed":
            return True
    return False
