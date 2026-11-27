# db.py: the only place that knows how to open a database connection.

import psycopg

from pipeline import config


def connect():                                               # Opens a database connection (TLS and query timeout from config)
    extra = {"sslrootcert": config.DB_SSLROOTCERT} if config.DB_SSLROOTCERT else {}
    if config.STATEMENT_TIMEOUT_SECONDS:
        extra["options"] = f"-c statement_timeout={config.STATEMENT_TIMEOUT_SECONDS}s"
    return psycopg.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        sslmode=config.DB_SSLMODE,
        connect_timeout=5,
        **extra,
    )
