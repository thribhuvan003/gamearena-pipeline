# __main__.py: the start of the program. The functions below are in the order they run:
# main -> run_command -> run_one_round -> tag_new_sessions, or main -> show_command.

import argparse
import time

import psycopg

from pipeline import config
from pipeline import db
from pipeline import read
from pipeline import show
from pipeline import store
from pipeline import tags


def main():                                                  # reads the typed command (run or show) and hands it on; stores nothing. Called at the bottom of this file when you type python -m pipeline
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag GameArena sessions and answer questions about them.")
    commands = parser.add_subparsers(dest="command", required=True)

    run_parser = commands.add_parser("run", help="tag sessions")
    run_parser.add_argument("--once", action="store_true", help="tag what is waiting, then exit")
    run_parser.add_argument("--limit", type=int, help="tag at most N sessions, then exit")

    show_parser = commands.add_parser("show", help="answer a question; changes nothing")
    show_parser.add_argument("question", choices=sorted(show.QUESTIONS), help="what to show")

    args = parser.parse_args()

    if args.command == "run":
        run_command(args)
    else:
        show_command(args)


def run_command(args):                                       # does one round (--once / --limit) or a round every WAIT_SECONDS until Ctrl+C; stores nothing itself. Called by main for 'run'
    print(f"Pipeline started: database {config.DB_NAME} on {config.DB_HOST}:{config.DB_PORT}, batch size {config.BATCH_SIZE}")

    try:
        while True:
            try:
                with db.connect() as conn:
                    total = run_one_round(conn, args.limit)

                print(f"Done. {total} sessions tagged this round")

            except psycopg.OperationalError as error:
                if args.once or args.limit is not None:
                    raise

                print(f"Database not reachable, will try again: {error}")

            if args.once or args.limit is not None:
                break

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")
            time.sleep(config.WAIT_SECONDS)

    except KeyboardInterrupt:
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")


def run_one_round(conn, limit):                              # does one round and records it in pipeline_runs (running, then ok or failed); returns how many it tagged. Called by run_command, once per round
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


def tag_new_sessions(conn, run_id, limit):                   # reads, tags and saves sessions (and their client connections) 200 sessions at a time until none are left or the limit is hit; returns the session count. Called by run_one_round to do the work
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

        results = {}

        for session_id, session in sessions.items():
            tag = tags.tag_session(session)
            reason = tags.failure_reason(session, tag)
            results[session_id] = {"tag": tag, "reason": reason, "started_at": session["started_at"]}

        connections = read.read_connections(conn, list(sessions))
        connection_results = {}

        for connection_id, connection in connections.items():
            tag = tags.tag_connection(connection)
            reason = tags.connection_reason(connection, tag)
            connection_results[connection_id] = {"session_id": connection["session_id"], "tag": tag, "reason": reason, "started_at": connection["started_at"]}

        store.save_tags(conn, results, run_id)
        store.save_connection_tags(conn, connection_results, run_id)
        conn.commit()

        total += len(results)
        print(f"Saved {len(results)} sessions and {len(connection_results)} client connections (total {total} sessions)")


def show_command(args):                                      # answers a question (e.g. status) by running its function from show.QUESTIONS; stores nothing, only prints. Called by main for 'show'
    with db.connect() as conn:
        show.QUESTIONS[args.question](conn)


if __name__ == "__main__":
    main()
