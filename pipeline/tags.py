# tags.py: decides one tag per session from its list of event names. No database here, only the rule.


def tag_session(event_names):                                # this session's event names in time order, e.g. ["session_started", "pipeline.connect.attempt", ...]
    if "pipeline.connect.success" in event_names:            # did it ever connect?
        return "connected"                                   # yes -> connected (stop here)

    if "pipeline.connect.attempt" in event_names:            # no success, but did it at least try?
        return "failed"                                      # tried but never connected -> failed

    return "no_attempt"                                      # never even tried -> no_attempt
