# tags.py: decides each session's tag and, if it failed, its reason. No database here, only the rules.


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


def last_failure_phase(session):                             # returns the phase of the session's last connection error (pre-connect / connecting), or None. Called by failure_reason to see if and when an error was logged
    phase = None
    for name, event_phase in zip(session["event_names"], session["phases"]):
        if name == "pipeline.connect.failure":
            phase = event_phase
    return phase


def video_failed(session):                                   # returns True if the video connection (WebRTC) ever went to failed. Called by failure_reason when no error was logged
    for name, state in zip(session["event_names"], session["states"]):
        if name == "webrtc.connection.state" and state == "failed":
            return True
    return False
