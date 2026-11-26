-- setup.sql (just setup): creates our 5 tables if they don't exist yet; safe to run again.

-- session_tags: one row per tagged session: its tag, its reason (if it failed), when it started, and which run tagged it.
CREATE TABLE IF NOT EXISTS session_tags (
    session_id UUID PRIMARY KEY,
    tag STRING NOT NULL CHECK (tag IN ('connected', 'failed', 'no_attempt')),
    reason STRING NULL CHECK (reason IN ('setup_error', 'error_while_connecting', 'error_other',
                                         'video_connection_failed', 'someone_never_joined', 'no_video')),
    started_at TIMESTAMPTZ NULL,
    run_id UUID NULL
);

-- connection_tags: one row per client connection (a session can have several): connected, not_connected or unknown (the app sent nothing on it), why it didn't connect, when it started, and which run tagged it.
CREATE TABLE IF NOT EXISTS connection_tags (
    connection_id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    tag STRING NOT NULL CHECK (tag IN ('connected', 'not_connected', 'unknown')),
    reason STRING NULL CHECK (reason IN ('setup_error', 'error_while_connecting', 'error_other',
                                         'video_connection_failed', 'no_video')),
    started_at TIMESTAMPTZ NOT NULL,
    run_id UUID NULL
);

-- pipeline_runs: the run history: one row per run: when it started and finished, running/ok/failed, how many it tagged, and the error if any.
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ NULL,
    status STRING NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
    sessions_tagged INT8 NOT NULL DEFAULT 0,
    error STRING NULL
);

-- session_facts: one row per session with events: how many events, attempts and reconnects, its first and last failure and success, whether it sent session_ended, and its newest event. Counted from all its events and refreshed whenever new events arrive, so the dashboard never has to read every raw event.
CREATE TABLE IF NOT EXISTS session_facts (
    session_id UUID PRIMARY KEY,
    events INT8 NOT NULL,
    has_end BOOL NOT NULL,
    attempts INT8 NOT NULL,
    reconnects INT8 NOT NULL,
    first_failure TIMESTAMPTZ NULL,
    last_failure TIMESTAMPTZ NULL,
    first_success TIMESTAMPTZ NULL,
    last_success TIMESTAMPTZ NULL,
    last_event_at TIMESTAMPTZ NOT NULL,
    INDEX (last_event_at)
);

-- error_events: a copy of every error-level event (about 6% of all events) with only the fields the dashboard shows, keyed by the event's own id, so copying it again changes nothing.
CREATE TABLE IF NOT EXISTS error_events (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    connection_id UUID NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    event STRING NOT NULL,
    code STRING NULL,
    error_code STRING NULL,
    phase STRING NULL,
    stage STRING NULL,
    message STRING NULL,
    detail STRING NULL,
    INDEX (recorded_at),
    INDEX (session_id),
    INDEX (connection_id)
);
