# __main__.py: the start of the program; functions in the order they run: main -> run_command -> run_one_round -> tag_new_sessions, or main -> status_command.

import argparse
import time

import psycopg

from pipeline import config
from pipeline import db
from pipeline import read
from pipeline import show
from pipeline import store
from pipeline import tags


def main():                                                  # Reads the command (run or status). Called when you type python -m pipeline
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag GameArena sessions and their client connections.")
    commands = parser.add_subparsers(dest="command", required=True)

    run_parser = commands.add_parser("run", help="tag sessions")
    run_parser.add_argument("--once", action="store_true", help="tag what is waiting, then exit")
    run_parser.add_argument("--limit", type=int, help="tag at most N sessions, then exit")

    commands.add_parser("status", help="show totals and the last runs; changes nothing")

    args = parser.parse_args()

    if args.command == "run" and args.limit is not None and args.limit < 1:
        parser.error("--limit must be 1 or more")

    if args.command == "run":
        run_command(args)
    else:
        status_command()


def run_command(args):                                       # Runs one round, or a round every WAIT_SECONDS until Ctrl+C
    print(f"Pipeline started: database {config.DB_NAME} on {config.DB_HOST}:{config.DB_PORT}, batch size {config.BATCH_SIZE}")
    once = args.once or args.limit is not None

    try:
        while True:
            try:
                with db.connect() as conn:
                    total = run_one_round(conn, args.limit)

                print(f"Done. {total} sessions tagged this round")

            except psycopg.OperationalError as error:
                if once:
                    raise

                print(f"Database not reachable, will try again: {error}")

            if once:
                break

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")
            time.sleep(config.WAIT_SECONDS)

    except KeyboardInterrupt:
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")


def run_one_round(conn, limit):                              # Runs one round and records it in pipeline_runs
    run_id = store.start_run(conn)
    conn.commit()

    try:
        total = tag_new_sessions(conn, run_id, limit)
    except BaseException as error:
        conn.rollback()
        store.finish_run(conn, run_id, "failed", f"{type(error).__name__}: {error}")
        conn.commit()
        raise

    store.finish_run(conn, run_id, "ok")
    conn.commit()
    return total


def tag_new_sessions(conn, run_id, limit):                   # Per batch: read, tag and save sessions and their client connections
    total = 0

    while True:
        batch_size = config.BATCH_SIZE

        if limit is not None:
            remaining = limit - total
            if remaining <= 0:
                return total
            batch_size = min(batch_size, remaining)

        sessions = read.read_sessions(conn, batch_size)

        if not sessions:
            return total

        for session in sessions.values():
            session["tag"] = tags.tag_session(session)
            session["reason"] = tags.failure_reason(session, session["tag"])

        connections = read.read_connections(conn, list(sessions))

        for connection in connections.values():
            connection["tag"] = tags.tag_connection(connection)
            connection["reason"] = tags.failure_reason(connection, connection["tag"])

        store.save_tags(conn, sessions, run_id)
        store.save_connection_tags(conn, connections, run_id)
        conn.commit()

        total += len(sessions)
        print(f"Saved {len(sessions)} sessions and {len(connections)} client connections (total {total} sessions)")


def status_command():                                        # Prints the processing status
    with db.connect() as conn:
        show.show_status(conn)


if __name__ == "__main__":
    main()
