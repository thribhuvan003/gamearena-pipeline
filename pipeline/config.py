# config.py: every setting in one place. Each one is read from the computer's environment;
# the value after the comma is the default for this laptop.

import os                                                    # Python's tool for reading the computer's settings

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")             # where the database is (127.0.0.1 = this laptop)
DB_PORT = int(os.environ.get("DB_PORT", "26257"))            # the database's door number; int() turns the text into a number
DB_NAME = os.environ.get("DB_NAME", "gamearena_analytics")   # which database holds the telemetry
DB_USER = os.environ.get("DB_USER", "root")                  # who logs in (root on the laptop)
DB_PASSWORD = os.environ.get("DB_PASSWORD")                  # the password; None (no password) on the laptop
DB_SSLMODE = os.environ.get("DB_SSLMODE", "disable")         # encryption: off on the laptop, on for a real server

BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "200"))        # how many sessions to read and tag at a time
WAIT_SECONDS = int(os.environ.get("WAIT_SECONDS", "30"))     # how long to wait between rounds when running non-stop
