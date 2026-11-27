# config.py: every setting in one place, read from the computer's environment, with this laptop's values as defaults.

import os
import re

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "26257"))
DB_NAME = os.environ.get("DB_NAME", "gamearena_analytics")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_SSLMODE = os.environ.get("DB_SSLMODE", "disable")
# The CA certificate for DB_SSLMODE=verify-full (a secure cluster); empty = none.
DB_SSLROOTCERT = os.environ.get("DB_SSLROOTCERT", "")
# Any query running longer than this is cancelled, so a stuck query fails the round instead of hanging it; 0 = no limit.
STATEMENT_TIMEOUT_SECONDS = int(os.environ.get("STATEMENT_TIMEOUT_SECONDS", "600"))

# The app's tables the pipeline reads (only reads), as [database.][schema.]table. Unqualified = in DB_NAME.
EVENTS_TABLE = os.environ.get("EVENTS_TABLE", "session_telemetry_events")
CLIENTS_TABLE = os.environ.get("CLIENTS_TABLE", "gamearena_source.session_client_connections")

BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "200"))
WAIT_SECONDS = int(os.environ.get("WAIT_SECONDS", "30"))
# How far back each round looks again for events stored later than their recorded time (a full rebuild catches anything older).
LATE_EVENTS_MINUTES = int(os.environ.get("LATE_EVENTS_MINUTES", "60"))
# While running, process every session again this often, in the same process (catches events stored very late); 0 = never.
REBUILD_HOURS = float(os.environ.get("REBUILD_HOURS", "24"))
# Enable only after the database owner confirms that derived data should follow source retention.
PRUNE_EXPIRED_TELEMETRY = os.environ.get("PRUNE_EXPIRED_TELEMETRY", "0") == "1"

if BATCH_SIZE < 1 or WAIT_SECONDS < 1 or LATE_EVENTS_MINUTES < 0 or REBUILD_HOURS < 0 or STATEMENT_TIMEOUT_SECONDS < 0:
    raise SystemExit("BATCH_SIZE and WAIT_SECONDS must be 1 or more; LATE_EVENTS_MINUTES, REBUILD_HOURS and STATEMENT_TIMEOUT_SECONDS 0 or more")
for name, value in (("EVENTS_TABLE", EVENTS_TABLE), ("CLIENTS_TABLE", CLIENTS_TABLE)):   # names go into SQL, so only plain identifiers
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,2}", value):
        raise SystemExit(f"{name} must be [database.][schema.]table with letters, digits and _ only, got {value!r}")
