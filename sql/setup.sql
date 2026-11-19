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
