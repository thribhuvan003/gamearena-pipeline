# __main__.py: the start of the program. The functions below are in the order they run:
# main -> run_command -> run_one_round -> tag_new_sessions, or main -> show_command.

import argparse                                              # reads the command you type, like: run --limit 20
import time                                                  # lets us wait (sleep) between rounds

import psycopg                                               # the database library (here only to recognise its errors)

from pipeline import config                                  # settings: batch size, wait time, database
from pipeline import db                                      # opens the database connection
from pipeline import read                                    # reads the next batch of sessions
from pipeline import show                                    # answers questions (show status, ...)
from pipeline import store                                   # saves tags and writes the run history
from pipeline import tags                                    # decides each session's tag and reason


def main():                                                  # 1. read the command, then do it
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag GameArena sessions and answer questions about them.")   # a reader for the command you typed
    commands = parser.add_subparsers(dest="command", required=True)   # the first word must be a command: run or show

    run_parser = commands.add_parser("run", help="tag sessions")   # command 1: run
    run_parser.add_argument("--once", action="store_true", help="tag what is waiting, then exit")   # option: --once
    run_parser.add_argument("--limit", type=int, help="tag at most N sessions, then exit")         # option: --limit 20

    show_parser = commands.add_parser("show", help="answer a question; changes nothing")          # command 2: show
    show_parser.add_argument("question", choices=sorted(show.QUESTIONS), help="what to show")    # e.g. status

    args = parser.parse_args()                               # read what was typed, e.g. args.command = "run", args.limit = 20

    if args.command == "run":                                # "python -m pipeline run ..."
        run_command(args)                                    # -> do the work
    else:                                                    # "python -m pipeline show ..."
        show_command(args)                                   # -> answer the question


def run_command(args):                                       # 2. keep doing rounds until told to stop
    print(f"Pipeline started: database {config.DB_NAME} on {config.DB_HOST}:{config.DB_PORT}, batch size {config.BATCH_SIZE}")   # what it's connected to

    try:                                                     # watch for Ctrl+C anywhere in the loop below
        while True:                                          # keep running round after round
            try:                                             # watch for database problems in this round
                with db.connect() as conn:                   # open the connection; it closes itself after
                    total = run_one_round(conn, args.limit)  # do one round, recorded in the run history

                print(f"Done. {total} sessions tagged this round")   # e.g. "Done. 20 sessions tagged this round"

            except psycopg.OperationalError as error:        # the database could not be reached
                if args.once or args.limit is not None:      # a one-off run...
                    raise                                    # ...stops and shows the error

                print(f"Database not reachable, will try again: {error}")   # otherwise report it and try next round

            if args.once or args.limit is not None:          # --once or --limit means: just one round
                break                                        # stop

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")   # say we're waiting
            time.sleep(config.WAIT_SECONDS)                  # wait, then the loop starts again

    except KeyboardInterrupt:                                # you pressed Ctrl+C
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")                                # always the last line


def run_one_round(conn, limit):                              # 3. one round, written in the run history from start to finish
    run_id = store.start_run(conn)                           # run history: write "running", get this run's ID
    conn.commit()                                            # save that row now, so it's visible while the run works

    try:                                                     # if anything breaks during the round...
        total = tag_new_sessions(conn, run_id, limit)        # tag batches until done (or the limit)
    except BaseException as error:                           # ...we land here (BaseException also catches Ctrl+C)
        conn.rollback()                                      # throw away the unfinished batch (finished batches stay saved)
        store.finish_run(conn, run_id, "failed", f"{type(error).__name__}: {error}")   # run history: "failed" + what went wrong
        conn.commit()                                        # save that run history line
        raise                                                # then let the error carry on, so it is shown

    store.finish_run(conn, run_id, "ok")                     # run history: "ok" + how many this run saved
    conn.commit()                                            # save that
    return total                                             # hand back how many were tagged


def tag_new_sessions(conn, run_id, limit):            # 4. tag batches until nothing is left (or the limit is reached)
    total = 0                                                # how many sessions this round tagged so far

    while True:                                              # repeat until there is nothing left (the returns below)
        batch_size = config.BATCH_SIZE                       # normally 200 per batch

        if limit is not None:                                # a limit was given, e.g. --limit 20
            remaining = limit - total                        # how many more we're allowed to tag
            if remaining <= 0:                               # reached the limit?
                return total                                 # then stop this round
            batch_size = min(batch_size, remaining)          # never take more than what's left (e.g. 20, not 200)

        sessions = read.read_sessions(conn, batch_size)      # next untagged ended sessions: {session_id: bundle of its events}

        if not sessions:                                     # nothing left to tag?
            return total                                     # then this round is done; hand back the count

        results = {}                                         # empty box for this batch: {session_id: {"tag": ..., "reason": ...}}

        for session_id, session in sessions.items():         # go through the sessions one by one
            tag = tags.tag_session(session)                  # connected / failed / no_attempt
            reason = tags.failure_reason(session, tag)       # why it failed (None if it didn't fail)
            results[session_id] = {"tag": tag, "reason": reason}   # write both next to its ID

        store.save_tags(conn, results, run_id)               # save the whole batch in one call, marked with this run's ID
        conn.commit()                                        # make it permanent (safe even if the program crashes after this)

        total += len(results)                                # add this batch's size to the round's total
        print(f"Saved {len(results)} tags (total {total})")  # e.g. "Saved 200 tags (total 400)"


def show_command(args):                                      # 5. answer a question, e.g. "show status"
    with db.connect() as conn:                               # open the connection; it closes itself after
        show.QUESTIONS[args.question](conn)                  # find the function for that question and run it


if __name__ == "__main__":                                   # only when you start this file directly...
    main()                                                   # ...run main()
