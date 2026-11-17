# db.py: the only place that knows how to open a database connection.

import psycopg                                               # the library that lets Python talk to CockroachDB

from pipeline import config                                  # our settings (address, user, ...)


def connect():                                               # open a connection and hand it back
    return psycopg.connect(                                  # psycopg dials the database with these details:
        host=config.DB_HOST,                                 # where it is
        port=config.DB_PORT,                                 # which door
        dbname=config.DB_NAME,                               # which database
        user=config.DB_USER,                                 # who logs in
        password=config.DB_PASSWORD,                         # password (None = don't send one)
        sslmode=config.DB_SSLMODE,                           # encrypt or not
        connect_timeout=5,                                   # give up after 5 seconds instead of hanging forever
    )
