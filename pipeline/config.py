# config.py: every setting in one place, read from the computer's environment, with this laptop's values as defaults.

import os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "26257"))
DB_NAME = os.environ.get("DB_NAME", "gamearena_analytics")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_SSLMODE = os.environ.get("DB_SSLMODE", "disable")

BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "200"))
WAIT_SECONDS = int(os.environ.get("WAIT_SECONDS", "30"))
