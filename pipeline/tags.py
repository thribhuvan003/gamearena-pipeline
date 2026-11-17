# tags.py: decides one tag per session from its list of step names. No database here, only the rule.


def tag_session(steps):                                      # steps = this session's step names, e.g. ["pipeline.connect.attempt", ...]
    if "pipeline.connect.success" in steps:                  # did it ever connect?
        return "connected"                                   # yes -> connected (stop here)

    if "pipeline.connect.attempt" in steps:                  # no success, but did it at least try?
        return "failed"                                      # tried but never connected -> failed

    return "no_attempt"                                      # never even tried -> no_attempt
