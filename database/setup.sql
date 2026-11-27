-- setup.sql (just setup): creates our 5 tables if they don't exist yet and sets the allowed reasons; safe to run again.
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
    -- (video_connection_failed), else ice.connection.state went to failed (network_connection_failed), else media.decode.error
    -- (video_decode_error), else pipeline.connection.dropped (connection_dropped), else host_connected or client_connected
    -- never arrived (someone_never_joined), else no_video. The allowed values are set at the end of this file.
    reason STRING NULL,
    -- The session's first event; NULL is allowed but the pipeline always fills it.
    started_at TIMESTAMPTZ NULL,
    -- The pipeline_runs row that wrote this tag; no foreign key, so the run history can be cleared on its own.
    run_id UUID NULL
);

-- connection_tags: one row per client connection: its tag, reason, first event, first success and the run that tagged it.
CREATE TABLE IF NOT EXISTS connection_tags (
    -- The client connection, as the events name it.
    connection_id UUID PRIMARY KEY,
    -- The session it belongs to; kept here so the dashboard can count clients per session without joining the raw events.
    session_id UUID NOT NULL,
    -- connected = logged pipeline.connect.success; unknown = only system events, the app itself sent nothing; otherwise not_connected.
    tag STRING NOT NULL CHECK (tag IN ('connected', 'not_connected', 'unknown')),
    -- Only for not_connected, with the session rules minus someone_never_joined (that one needs the whole session, not one client).
    reason STRING NULL,
    -- The connection's first event; the dashboard's daily client charts use this day (UTC).
    started_at TIMESTAMPTZ NOT NULL,
    -- Its first pipeline.connect.success (up to session_ended); NULL = never connected. Tells an error before connecting from one after.
    connected_at TIMESTAMPTZ NULL,
    -- Device, OS, browser and access type from the app's own client record (pipeline/tags.py client_labels); "No app record" if it has none.
    device STRING NULL,
    os STRING NULL,
    browser STRING NULL,
    access STRING NULL,
    -- Whether any of its events was ice.gathering.complete / media.first_decode (all its events, not only up to session_ended).
    gathered BOOL NULL,
    decoded BOOL NULL,
    -- The strongest thing it logged itself, over all its events: error (an error other than ice.candidate.error),
    -- ice_warning (ice.candidate.error), warning (a warn-level event), else nothing. Splits "no failure logged" by what was there.
    logged STRING NULL,
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
    error STRING NULL,
    -- true = every session was processed again (first build or daily rebuild); the next one is due REBUILD_HOURS after the last ok one.
    full_rebuild BOOL NOT NULL DEFAULT false
);

-- session_facts: one row per session with events: counts and first/last failure and success, refreshed as events arrive.
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

-- error_events: a copy of every error-level event with only the fields the dashboard shows, keyed by the event's own id.
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

-- Columns added after the first release, so tables created earlier get them too.
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS device STRING NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS os STRING NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS browser STRING NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS access STRING NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS gathered BOOL NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS decoded BOOL NULL;
ALTER TABLE connection_tags ADD COLUMN IF NOT EXISTS logged STRING NULL;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS full_rebuild BOOL NOT NULL DEFAULT false;

-- The dashboard filters clients by their first event's day: this index lets a date range read only its own clients.
CREATE INDEX IF NOT EXISTS connection_tags_started_at ON connection_tags (started_at)
    STORING (session_id, tag, reason, connected_at, device, os, browser, access, gathered, decoded);

-- The reasons each tag table allows, set here (dropped and added again) so a new reason also reaches tables created earlier.
ALTER TABLE session_tags DROP CONSTRAINT IF EXISTS check_reason;
ALTER TABLE session_tags ADD CONSTRAINT check_reason CHECK (reason IN (
    'setup_error', 'error_while_connecting', 'error_other', 'video_connection_failed', 'network_connection_failed',
    'video_decode_error', 'connection_dropped', 'someone_never_joined', 'no_video'));
ALTER TABLE connection_tags DROP CONSTRAINT IF EXISTS check_reason;
ALTER TABLE connection_tags ADD CONSTRAINT check_reason CHECK (reason IN (
    'setup_error', 'error_while_connecting', 'error_other', 'video_connection_failed', 'network_connection_failed',
    'video_decode_error', 'connection_dropped', 'no_video'));
