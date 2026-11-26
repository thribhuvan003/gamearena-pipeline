-- setup.sql (just setup): creates our 5 tables if they don't exist yet; safe to run again.
-- The raw telemetry (session_telemetry_events) is never changed; everything here is worked out from it by the pipeline.

-- session_tags: one row per tagged session: its tag, its reason (if it failed), when it started, and which run tagged it.
-- A session is tagged once, after its session_ended event, from the events up to that end.
CREATE TABLE IF NOT EXISTS session_tags (
    -- The app session (host_sessions.id); one row each, so tagging it again overwrites it.
    session_id UUID PRIMARY KEY,
    -- connected = logged pipeline.connect.success; failed = tried (pipeline.connect.attempt) but never succeeded; no_attempt = never tried.
    tag STRING NOT NULL CHECK (tag IN ('connected', 'failed', 'no_attempt')),
    -- Only for failed, first match wins: the phase of the last pipeline.connect.failure (pre-connect -> setup_error,
    -- connecting -> error_while_connecting, any other -> error_other), else webrtc.connection.state went to failed
    -- (video_connection_failed), else host_connected or client_connected never arrived (someone_never_joined), else no_video.
    reason STRING NULL CHECK (reason IN ('setup_error', 'error_while_connecting', 'error_other',
                                         'video_connection_failed', 'someone_never_joined', 'no_video')),
    -- The session's first event; NULL is allowed but the pipeline always fills it.
    started_at TIMESTAMPTZ NULL,
    -- The pipeline_runs row that wrote this tag; no foreign key, so the run history can be cleared on its own.
    run_id UUID NULL
);

-- connection_tags: one row per client connection (a session can have several): connected, not_connected or unknown (the app sent nothing on it), why it didn't connect, when it started, and which run tagged it.
CREATE TABLE IF NOT EXISTS connection_tags (
    -- The client connection, as the events name it.
    connection_id UUID PRIMARY KEY,
    -- The session it belongs to; kept here so the dashboard can count clients per session without joining the raw events.
    session_id UUID NOT NULL,
    -- connected = logged pipeline.connect.success; unknown = only system events, the app itself sent nothing; otherwise not_connected.
    tag STRING NOT NULL CHECK (tag IN ('connected', 'not_connected', 'unknown')),
    -- Only for not_connected, with the session rules minus someone_never_joined (that one needs the whole session, not one client).
    reason STRING NULL CHECK (reason IN ('setup_error', 'error_while_connecting', 'error_other',
                                         'video_connection_failed', 'no_video')),
    -- The connection's first event; the dashboard's daily client charts use this day (UTC).
    started_at TIMESTAMPTZ NOT NULL,
    -- The run that wrote this tag, as in session_tags.
    run_id UUID NULL
);

-- pipeline_runs: the run history: one row per run: when it started and finished, running/ok/failed, how many it tagged, and the error if any.
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL while the run is still going.
    finished_at TIMESTAMPTZ NULL,
    -- running until it ends; a run left on running means the program stopped mid-run.
    status STRING NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
    sessions_tagged INT8 NOT NULL DEFAULT 0,
    -- The error text when status is failed, else NULL.
    error STRING NULL
);

-- session_facts: one row per session with events: how many events, attempts and reconnects, its first and last failure and success, whether it sent session_ended, and its newest event. Counted from all its events and refreshed whenever new events arrive, so the dashboard never has to read every raw event.
CREATE TABLE IF NOT EXISTS session_facts (
    session_id UUID PRIMARY KEY,
    -- Every raw event of the session, of any level.
    events INT8 NOT NULL,
    -- true once a session_ended event exists; sessions without it are still open or never closed properly.
    has_end BOOL NOT NULL,
    -- How many pipeline.connect.attempt events.
    attempts INT8 NOT NULL,
    -- How many client_reconnected events.
    reconnects INT8 NOT NULL,
    -- First and last pipeline.connect.failure and pipeline.connect.success; NULL means it never happened.
    -- Comparing them gives "failed, then connected" and "connected, then failed".
    first_failure TIMESTAMPTZ NULL,
    last_failure TIMESTAMPTZ NULL,
    first_success TIMESTAMPTZ NULL,
    last_success TIMESTAMPTZ NULL,
    -- The newest event; each round recounts sessions with events newer than the latest of these minus one day.
    last_event_at TIMESTAMPTZ NOT NULL,
    INDEX (last_event_at)
);

-- error_events: a copy of every error-level event (about 6% of all events) with only the fields the dashboard shows, keyed by the event's own id, so copying it again changes nothing.
CREATE TABLE IF NOT EXISTS error_events (
    -- The raw event's own id.
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    -- NULL when the error names no client: it belongs to the session (the overview's "Errors with no client ID").
    connection_id UUID NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    -- payload.event, else the event type, e.g. pipeline.connect.failure.
    event STRING NOT NULL,
    -- payload.code (e.g. 500 or 400 on pipeline.connect.failure).
    code STRING NULL,
    -- payload.errorCode; only ice.candidate.error carries it.
    error_code STRING NULL,
    -- payload.phase and payload.stage: where in connecting the app says it was.
    phase STRING NULL,
    stage STRING NULL,
    -- The event's free-text message; the dashboard hides addresses, links, IDs and tokens in it before showing it.
    message STRING NULL,
    -- payload.reason, else payload.errorText.
    detail STRING NULL,
    -- recorded_at for date ranges; session_id and connection_id for a session's or a client's errors.
    INDEX (recorded_at),
    INDEX (session_id),
    INDEX (connection_id)
);
