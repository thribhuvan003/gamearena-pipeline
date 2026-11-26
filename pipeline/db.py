# db.py: the only place that knows how to open a database connection.

import psycopg

from pipeline import config


def connect():                                               # Opens a database connection
    return psycopg.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        dbname=config.DB_NAME,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        sslmode=config.DB_SSLMODE,
        connect_timeout=5,
    )
