# __main__.py: the start of the program. Runs when you type: python -m pipeline

import argparse                                              # reads options you type, like --once
import time                                                  # lets us wait (sleep) between rounds

import psycopg                                               # the database library (here only to recognise its errors)

from pipeline import config                                  # settings: batch size, wait time, database
from pipeline import db                                      # opens the database connection
from pipeline import read                                    # reads the next batch of sessions
from pipeline import store                                   # saves the tags
from pipeline import tags                                    # decides each session's tag


def tag_new_sessions(conn, run_id, limit=None):              # ONE ROUND: tag batches until nothing is left (or the limit is reached)
    total = 0                                                # how many sessions this round tagged so far

    while True:                                              # repeat until there is nothing left (the returns below)
        batch_size = config.BATCH_SIZE                       # normally 200 per batch

        if limit is not None:                                # a limit was given, e.g. --limit 20
            remaining = limit - total                        # how many more we're allowed to tag
            if remaining <= 0:                               # reached the limit?
                return total                                 # then stop this round
            batch_size = min(batch_size, remaining)          # never take more than what's left (e.g. 20, not 200)

        sessions = read.read_sessions(conn, batch_size)      # next untagged ended sessions: {session_id: [event_names]}

        if not sessions:                                     # nothing left to tag?
            return total                                     # then this round is done; hand back the count

        session_tags = {}                                    # empty box for this batch's results: {session_id: tag}

        for session_id, event_names in sessions.items():           # go through the sessions one by one
            session_tags[session_id] = tags.tag_session(event_names)   # work out its tag and write it next to its ID

        store.save_tags(conn, session_tags, run_id)          # save the whole batch in one call, marked with this run's ID

        conn.commit()                                        # make it permanent (safe even if the program crashes after this)

        total += len(session_tags)                           # add this batch's size to the round's total

        print(f"Saved {len(session_tags)} tags (total {total})")   # e.g. "Saved 200 tags (total 400)"


def main():                                                  # where the program starts
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag ended sessions as connected, failed or no_attempt.")   # a reader for the command you typed
    parser.add_argument("--once", action="store_true", help="tag what is there, then exit")   # option: --once (typed = True)
    parser.add_argument("--limit", type=int, help="tag at most N sessions, then exit")     # option: --limit 20 (a number)
    args = parser.parse_args()                               # read what was typed: args.once (True/False), args.limit (a number or None)

    print("Pipeline started")                                # show that it started

    print(f"Database: {config.DB_NAME}")                     # show which database it uses
    print(f"Host: {config.DB_HOST}")                         # where that database is
    print(f"Port: {config.DB_PORT}")                         # which door
    print(f"Batch size: {config.BATCH_SIZE}")                # how many sessions per batch

    try:                                                     # watch for Ctrl+C anywhere in the loop below
        while True:                                          # keep running round after round
            try:                                             # watch for database problems in this round
                with db.connect() as conn:                   # open the connection; it closes itself after
                    run_id = store.start_run(conn)           # job diary: write "running", get this run's ID
                    conn.commit()                            # save that row now, so it's visible while the run works
                    total = tag_new_sessions(conn, run_id, args.limit)   # do one round (stops early if --limit was given)
                    store.finish_run(conn, run_id, "ok", total)          # job diary: write "ok" and how many were tagged
                    conn.commit()                            # save that

                print(f"Done. {total} sessions tagged this round")   # e.g. "Done. 6501 sessions tagged this round"

            except psycopg.OperationalError as error:        # the database could not be reached
                if args.once:                                # with --once...
                    raise                                    # ...stop and show the error

                print(f"Database not reachable, will try again: {error}")   # otherwise report it and try next round

            if args.once or args.limit is not None:          # with --once or --limit...
                break                                        # ...stop after one round

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")   # say we're waiting

            time.sleep(config.WAIT_SECONDS)                  # wait 30 seconds, then the loop starts again

    except KeyboardInterrupt:                                # you pressed Ctrl+C
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")                                # always the last line


if __name__ == "__main__":                                   # only when you start this file directly...
    main()                                                   # ...run main()
