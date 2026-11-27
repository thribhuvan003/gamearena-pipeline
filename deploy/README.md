# Deploying the pipeline

The pipeline runs as **one pod** in the existing cluster. It reads the app's tables, writes only its own 5 tables, and checks for new events every 30 seconds. The dashboard is deployed separately, later.

## What it touches

| | Tables | Access |
|---|---|---|
| Reads | `session_telemetry_events`, `session_client_connections` (`EVENTS_TABLE`, `CLIENTS_TABLE`) | `SELECT` only |
| Writes | `session_facts`, `error_events`, `session_tags`, `connection_tags`, `pipeline_runs` | rows only, no schema changes |

Every write is an `UPSERT` by key or a `DELETE` of its own rows, so a restart or a repeated run never duplicates anything.

## Steps

1. **Tables** (admin, once): run `database/setup.sql` in the database that will hold the pipeline's tables. It only creates and alters those 5 tables, and is safe to run again.
2. **User** (admin, once): edit the database names in `database/grants.sql`, run it, then set the password with `ALTER USER gamearena_pipeline WITH PASSWORD '...'`.
3. **Image**: `docker build -t <registry>/gamearena-pipeline:<tag> .` from the repo root, then push it.
4. **Secret**: `kubectl -n <namespace> create secret generic gamearena-pipeline-db --from-literal=DB_PASSWORD='...' --from-file=ca.crt=<cluster CA>`
5. **Deploy**: edit the lines marked `CHANGE` in `deploy/pipeline.yaml`, then `kubectl apply -f deploy/pipeline.yaml`.
6. **Watch**: `kubectl -n <namespace> logs -f deploy/gamearena-pipeline`. The first round processes every session (a full build); after that each round says `No new events` or `Done: N sessions ...`.

## How it behaves

- **One copy only:** `replicas: 1` and `strategy: Recreate`, so an update stops the old pod before starting the new one.
- **Stopping:** on SIGTERM it stops like Ctrl+C. An unfinished batch is rolled back, finished batches are kept, and the run is marked failed in `pipeline_runs`.
- **Database down:** it logs `Database not reachable, will try again` and retries every 30 s. Any other error exits, and Kubernetes restarts it.
- **Late events:** each round looks back 60 minutes (`LATE_EVENTS_MINUTES`). Once a day (`REBUILD_HOURS`), the same process reprocesses every session, which catches anything older. No separate CronJob is needed.
- **Clock errors:** events dated in the future can't push the pipeline's "newest processed" mark ahead.
- **Stuck queries** are cancelled after 10 minutes (`STATEMENT_TIMEOUT_SECONDS`), and the round is retried.

## Questions for the cluster owner

- Which database holds `session_telemetry_events` and `session_client_connections`, and where should the pipeline's 5 tables live?
- The internal service name for CockroachDB (`DB_HOST`), the namespace, and the image registry.
- Is `recorded_at` set by the server or by the client's clock?
- CockroachDB lets **every** user create tables in a database's `public` schema by default. `grants.sql` removes that in the pipeline's own database. Should it also be removed in the app's database, or does the app rely on it?
