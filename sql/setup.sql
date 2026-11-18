CREATE TABLE IF NOT EXISTS session_tags (                                    -- one row per tagged session (the results + the pipeline's memory)
    session_id UUID PRIMARY KEY,                                             -- which session; primary key = one row per session
    tag STRING NOT NULL CHECK (tag IN ('connected', 'failed', 'no_attempt')), -- the result; only these 3 words allowed
    reason STRING NULL CHECK (reason IN ('setup_error', 'error_while_connecting', 'error_other',
                                         'video_connection_failed', 'someone_never_joined', 'no_video')),   -- why it failed (empty if it didn't)
    run_id UUID NULL                                                         -- which run tagged it (links to pipeline_runs)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (                                   -- the run history: one row per run of the pipeline
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),                       -- this run's own ID, made up automatically
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),                           -- when the run started (filled in automatically)
    finished_at TIMESTAMPTZ NULL,                                            -- when it finished (empty while it is still running)
    status STRING NOT NULL CHECK (status IN ('running', 'ok', 'failed')),    -- running = picked up, ok = finished, failed = broke
    sessions_tagged INT8 NOT NULL DEFAULT 0,                                 -- how many sessions this run processed
    error STRING NULL                                                        -- what went wrong, only when status = failed
);
