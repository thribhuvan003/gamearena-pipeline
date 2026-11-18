# tags.py: decides each session's tag and, if it failed, its reason. No database here, only the rules.
# The functions below are in the order they run: tag_session -> failure_reason -> its 2 helpers.


def tag_session(session):                                    # session = its bundle: {"event_names": [...], "phases": [...], "states": [...]}
    event_names = session["event_names"]                     # its event names in time order, e.g. ["session_started", "pipeline.connect.attempt", ...]

    if "pipeline.connect.success" in event_names:            # did it ever connect?
        return "connected"                                   # yes -> connected (stop here)

    if "pipeline.connect.attempt" in event_names:            # no success, but did it at least try?
        return "failed"                                      # tried but never connected -> failed

    return "no_attempt"                                      # never even tried -> no_attempt


def failure_reason(session, tag):                            # WHY did a failed session fail? Checked top to bottom, first match wins
    if tag != "failed":                                      # only failed sessions get a reason
        return None                                          # connected / no_attempt -> no reason

    phase = last_failure_phase(session)                      # did the app log a connection error, and when?
    if phase == "pre-connect":                               # an error before connecting started
        return "setup_error"                                 # -> the session could not even be set up
    if phase == "connecting":                                # an error while connecting
        return "error_while_connecting"                      # -> it broke during connecting
    if phase is not None:                                    # an error with some other phase (none today, but just in case)
        return "error_other"                                 # -> an error, phase not one we know

    if video_failed(session):                                # no error logged, but the video connection went to "failed"
        return "video_connection_failed"                     # -> the video link itself broke

    event_names = session["event_names"]                     # its event names
    if "host_connected" not in event_names or "client_connected" not in event_names:   # the game machine or the player never joined
        return "someone_never_joined"                        # -> nobody to connect to

    return "no_video"                                        # both joined, no error, but video never started


def last_failure_phase(session):                             # when did the app log its LAST connection error? pre-connect / connecting / None
    phase = None                                             # no error seen yet
    for name, event_phase in zip(session["event_names"], session["phases"]):   # walk the events in time order, name + phase together
        if name == "pipeline.connect.failure":               # a connection error...
            phase = event_phase                              # ...remember its phase (a later one overwrites an earlier one)
    return phase                                             # the phase of the last error, or None if there was none


def video_failed(session):                                   # did the video connection (WebRTC) ever go to "failed"?
    for name, state in zip(session["event_names"], session["states"]):   # walk the events, name + state together
        if name == "webrtc.connection.state" and state == "failed":   # a video-connection event that says "failed"
            return True                                      # yes -> stop looking
    return False                                             # never failed
