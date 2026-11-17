def tag_session(steps):
    if "pipeline.connect.success" in steps:
        return "connected"

    if "pipeline.connect.attempt" in steps:
        return "failed"

    return "no_attempt"
