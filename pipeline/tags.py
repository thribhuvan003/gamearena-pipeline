# tags.py: decides one tag per session from its bundle of facts. No database here, only the rule.


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


def tag_session(session):                                    # session = its bundle: {"event_names": [...], "phases": [...], "states": [...]}
    event_names = session["event_names"]                     # its event names in time order, e.g. ["session_started", "pipeline.connect.attempt", ...]

    if "pipeline.connect.success" in event_names:            # did it ever connect?
        return "connected"                                   # yes -> connected (stop here)

    if "pipeline.connect.attempt" in event_names:            # no success, but did it at least try?
        return "failed"                                      # tried but never connected -> failed

    return "no_attempt"                                      # never even tried -> no_attempt
