def tag_session(events):
    steps = [step for recorded_at, event_type, step in events]

    if "pipeline.connect.success" in steps:
        return "connected"

    if "pipeline.connect.attempt" in steps:
        return "failed"

    return "no_attempt"
