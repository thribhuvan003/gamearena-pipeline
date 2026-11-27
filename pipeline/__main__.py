# __main__.py: the program's start: main -> run_command -> run_one_round -> process_batch, or the status command.

import argparse
import time

import psycopg

from pipeline import config
from pipeline import db
from pipeline import read
from pipeline import status
from pipeline import store
from pipeline import tags


def main():                                                  # Reads the command (run or status). Called when you type python -m pipeline
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Profile GameArena sessions and their client connections.")
    commands = parser.add_subparsers(dest="command", required=True)

    run_parser = commands.add_parser("run", help="process sessions with new events")
    run_parser.add_argument("--once", action="store_true", help="process what is new, then exit")
    run_parser.add_argument("--limit", type=int, help="process at most N sessions, then exit")
    run_parser.add_argument("--all", action="store_true", help="process every session again (a full rebuild), then exit")

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
    once = args.once or args.all or args.limit is not None

    try:
        while True:
            try:
                with db.connect() as conn:
                    run_one_round(conn, args.limit, args.all)

            except psycopg.OperationalError as error:
                if once:
                    raise

                print(f"Database not reachable, will try again: {error}")

            if once:
                break

            time.sleep(config.WAIT_SECONDS)

    except KeyboardInterrupt:
        print("Stopped with Ctrl+C. Finished batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")


def run_one_round(conn, limit, everything=False):            # Processes the sessions with new events (all if everything) batch by batch, and records the run; no new events = no writes
    session_ids = store.changed_sessions(conn, everything)[:limit]
    if not session_ids:
        print("No new events")
        return 0

    run_id = store.start_run(conn)
    conn.commit()
    tagged = 0

    try:
        for start in range(0, len(session_ids), config.BATCH_SIZE):
            tagged += process_batch(conn, session_ids[start:start + config.BATCH_SIZE], run_id)
            conn.commit()
        if everything:
            store.delete_gone(conn)
            conn.commit()
    except BaseException as error:
        conn.rollback()
        store.finish_run(conn, run_id, "failed", tagged, f"{type(error).__name__}: {error}")
        conn.commit()
        raise

    store.finish_run(conn, run_id, "ok", tagged)
    conn.commit()
    print(f"Done: {len(session_ids)} sessions with new events, {tagged} ended sessions tagged")
    return tagged


def process_batch(conn, session_ids, run_id):                # Refreshes these sessions' facts and error copies, then tags the ended ones and their clients; returns how many were tagged
    store.refresh_facts(conn, session_ids)

    sessions = read.read_sessions(conn, session_ids)
    for session in sessions.values():
        session["tag"] = tags.tag_session(session)
        session["reason"] = tags.failure_reason(session, session["tag"])

    connections = read.read_connections(conn, list(sessions))
    for connection in connections.values():
        connection["tag"] = tags.tag_connection(connection)
        connection["reason"] = tags.failure_reason(connection, connection["tag"])
        labels = tags.client_labels(connection["in_app"], connection["user_agent"], connection["access"])
        connection["device"], connection["os"], connection["browser"], connection["access"] = labels

    store.save_tags(conn, sessions, run_id)
    store.save_connection_tags(conn, connections, run_id)
    return len(sessions)


def status_command():                                        # Prints the processing status
    with db.connect() as conn:
        status.show_status(conn)


if __name__ == "__main__":
    main()
