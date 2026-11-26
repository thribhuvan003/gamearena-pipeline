-- tables.sql (just tables): the newest 10 rows of session_tags, connection_tags and pipeline_runs, to see what the pipeline wrote. Only reads.
SELECT session_id, tag, reason, started_at, run_id
FROM session_tags
ORDER BY started_at DESC, session_id
LIMIT 10;

SELECT connection_id, session_id, tag, reason, started_at, run_id
FROM connection_tags
ORDER BY started_at DESC, connection_id
LIMIT 10;

SELECT run_id, started_at, finished_at, status, sessions_tagged, error
FROM pipeline_runs
ORDER BY started_at DESC, run_id
LIMIT 10;
