import argparse
import time

import psycopg

from pipeline import config
from pipeline import db
from pipeline import read
from pipeline import store
from pipeline import tags


def tag_new_sessions(conn):
    total = 0

    while True:
        sessions = read.read_sessions(conn, config.BATCH_SIZE)

        if not sessions:
            return total

        session_tags = {}

        for session_id, steps in sessions.items():
            session_tags[session_id] = tags.tag_session(steps)

        store.save_tags(conn, session_tags)

        conn.commit()

        total += len(session_tags)

        print(f"Saved {len(session_tags)} tags (total {total})")


def main():
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag ended sessions as connected, failed or no_attempt.")
    parser.add_argument("--once", action="store_true", help="tag what is there, then exit")
    args = parser.parse_args()

    print("Pipeline started")

    print(f"Database: {config.DB_NAME}")
    print(f"Host: {config.DB_HOST}")
    print(f"Port: {config.DB_PORT}")
    print(f"Batch size: {config.BATCH_SIZE}")

    try:
        while True:
            try:
                with db.connect() as conn:
                    total = tag_new_sessions(conn)

                print(f"Done. {total} sessions tagged this round")

            except psycopg.OperationalError as error:
                if args.once:
                    raise

                print(f"Database not reachable, will try again: {error}")

            if args.once:
                break

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")

            time.sleep(config.WAIT_SECONDS)

    except KeyboardInterrupt:
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")


if __name__ == "__main__":
    main()
