CREATE TABLE IF NOT EXISTS session_tags (
    session_id UUID PRIMARY KEY,
    tag STRING NOT NULL CHECK (tag IN ('connected', 'failed', 'no_attempt')),
    tagged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
