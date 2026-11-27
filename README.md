# GameArena Pipeline

Profiles GameArena telemetry, stores session and client outcomes in five derived CockroachDB tables, and displays the results in a Next.js dashboard.

## Quick start (local)

Run all `just` commands from the repository root. You need Python (3.13 recommended), Node.js (22.18+ recommended), Docker, `just`, and an existing local CockroachDB container named `cockroachdb` with the GameArena data restored. The repository does not include the raw telemetry dump.

### 1. First-time setup

```bash
git clone https://github.com/thribhuvan003/gamearena-pipeline.git
cd gamearena-pipeline
python -m pip install -r pipeline/requirements.txt
just setup
just test
just rebuild
just check
```

Use `python3` instead of `python` on Linux if needed. `just setup` creates the five derived tables; `just rebuild` populates them. Check that missing, wrong and stale counts are zero.

### 2. Start the pipeline (terminal 1)

```bash
just live
```

Leave it running. It checks for new telemetry every 30 seconds and schedules a full rebuild every 24 hours by default. Press Ctrl+C to stop.

### 3. Open the dashboard (terminal 2)

```bash
just dashboard-install
just dashboard
```

Open **[http://localhost:3000](http://localhost:3000)**. The first command installs locked dependencies; the second starts the local development server. With the default local preview configuration, Google sign-in is not required.

### 4. Check the pipeline

```bash
just status
just check
```

## Main commands

| Command | What it does |
| --- | --- |
| `just` | List all commands |
| `just setup` | Create or update the five derived tables (admin, local) |
| `just run` | Process new data once |
| `just run 20` | Process at most 20 sessions once |
| `just live` | Run the pipeline continuously |
| `just rebuild` | Reprocess all telemetry |
| `just status` | Show tag counts and recent runs |
| `just check` | Compare derived data against raw telemetry |
| `just dashboard-install` | Install locked dashboard dependencies |
| `just dashboard` | Start the dashboard at localhost:3000 |
| `just test` | Run the tagging and browser classification unit tests |

Do not run `just run` or `just rebuild` alongside another running pipeline. Stop `just live` first.

## Other commands

| Command | What it does |
| --- | --- |
| `just report` | Print summary counts |
| `just trends` | Print daily trends |
| `just errors` | Print failure details |
| `just profile` | Inspect data coverage |
| `just tables` | Preview generated rows |
| `just explore` | Inspect raw telemetry |
| `just sql` | Open the local CockroachDB SQL shell |
| `just grants` | Create the pipeline user and grant database permissions (admin) |
| `just integration` | Run integration tests on a disposable local cluster only |
| `just reset` | Delete all rows in the five derived tables (local only) |

**Safety:** `just integration` requires `TEST_DB_PORT` (a non-default port on a disposable local cluster) and `ALLOW_DISPOSABLE_TEST_DB=1`. It creates a uniquely named test database and user, then removes only those. Never use a shared cluster or a port forward. `just reset` deletes derived data. The SQL shortcuts in `justfile` target the local insecure Docker container, not production.

## Database settings

Local defaults:

| Setting | Default |
| --- | --- |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `26257` |
| `DB_NAME` | `gamearena_analytics` |
| `DB_USER` | `root` (local only) |
| `DB_PASSWORD` | Unset |
| `DB_SSLMODE` | `disable` (local only) |
| `EVENTS_TABLE` | `session_telemetry_events` |
| `CLIENTS_TABLE` | `gamearena_source.session_client_connections` |
| `BATCH_SIZE` | `200` |
| `WAIT_SECONDS` | `30` |
| `LATE_EVENTS_MINUTES` | `60` |
| `REBUILD_HOURS` | `24` |
| `PRUNE_EXPIRED_TELEMETRY` | `0` (enable only after owner confirms retention) |

The Python pipeline reads environment variables from the shell. Dashboard database settings (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) can be set in `dashboard/.env.local`. The dashboard SQL currently assumes the local source table names. Use separate restricted credentials for production; see the deployment guide.

## Authentication

Local development defaults to a localhost-only preview. To test Google sign-in, set `AUTH_MODE=better-auth` in `dashboard/.env.local` along with `APP_BASE_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), `AUTH_DATABASE_URL` (separate PostgreSQL database), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `AUTH_ALLOWED_EMAILS` (comma-separated verified team emails). Configure the Google OAuth callback URL as `<APP_BASE_URL>/api/auth/callback/google`.

```bash
cd dashboard
npm ci
npm run auth:migrate
npm run dev
```

Run migrations only against the intended authentication database. Do not commit credentials.

## Project structure

```text
pipeline/       Python pipeline, tagging rules, tests
database/       SQL setup, grants, checks and reports
dashboard/      Next.js dashboard and authentication
deploy/         Kubernetes manifest and deployment instructions
Dockerfile      Pipeline container
justfile        Local commands
```

## Production deployment

See [deploy/README.md](deploy/README.md). Deploy a single pipeline pod inside the existing cluster using restricted database credentials and TLS. Do not expose CockroachDB publicly. The dashboard deployment is separate. Confirm production permissions, source table names and retention policy with the cluster owner before deployment.
