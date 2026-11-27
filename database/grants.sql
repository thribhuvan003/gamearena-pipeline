-- grants.sql (just grants): the pipeline's own database user. Run once by an admin, after setup.sql.
-- It can only READ the app's tables and only WRITE the pipeline's 5 tables; it can't create, change or drop any table.
-- The names below are this laptop's. In production, replace gamearena_source / gamearena_analytics with the real databases
-- (EVENTS_TABLE and CLIENTS_TABLE in the pipeline's settings must name the same tables). Set the password separately:
--   ALTER USER gamearena_pipeline WITH PASSWORD '...';   (never in this file)

CREATE USER IF NOT EXISTS gamearena_pipeline;

-- Shared permissions are left alone: CockroachDB lets every user create tables in a public schema by default, and changing
-- that affects every user, so it's the database owner's call. Best: give the pipeline's 5 tables their own database.

-- The app's tables: read only.
GRANT CONNECT ON DATABASE gamearena_source TO gamearena_pipeline;
GRANT SELECT ON TABLE gamearena_source.public.session_client_connections TO gamearena_pipeline;
GRANT CONNECT ON DATABASE gamearena_analytics TO gamearena_pipeline;
GRANT SELECT ON TABLE gamearena_analytics.public.session_telemetry_events TO gamearena_pipeline;

-- The pipeline's tables: read and write rows (UPSERT needs INSERT and UPDATE; DELETE drops rows of sessions whose events are gone).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    gamearena_analytics.public.session_tags,
    gamearena_analytics.public.connection_tags,
    gamearena_analytics.public.session_facts,
    gamearena_analytics.public.error_events,
    gamearena_analytics.public.pipeline_runs
TO gamearena_pipeline;

-- Check what it can do, including grants it inherits through roles.
SHOW GRANTS FOR gamearena_pipeline;
