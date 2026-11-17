# __main__.py: the start of the program. Runs when you type: python -m pipeline

import argparse                                              # reads options you type, like --once
import time                                                  # lets us wait (sleep) between rounds

import psycopg                                               # the database library (here only to recognise its errors)

from pipeline import config                                  # settings: batch size, wait time, database
from pipeline import db                                      # opens the database connection
from pipeline import read                                    # reads the next batch of sessions
from pipeline import store                                   # saves the tags
from pipeline import tags                                    # decides each session's tag


def tag_new_sessions(conn):                                  # ONE ROUND: tag batches until nothing is left
    total = 0                                                # how many sessions this round tagged so far

    while True:                                              # repeat until there is nothing left (the return below)
        sessions = read.read_sessions(conn, config.BATCH_SIZE)   # next 200 untagged ended sessions: {session_id: [steps]}

        if not sessions:                                     # nothing left to tag?
            return total                                     # then this round is done; hand back the count

        session_tags = {}                                    # empty box for this batch's results: {session_id: tag}

        for session_id, steps in sessions.items():           # go through the sessions one by one
            session_tags[session_id] = tags.tag_session(steps)   # work out its tag and write it next to its ID

        store.save_tags(conn, session_tags)                  # save the whole batch in one call

        conn.commit()                                        # make it permanent (safe even if the program crashes after this)

        total += len(session_tags)                           # add this batch's size to the round's total

        print(f"Saved {len(session_tags)} tags (total {total})")   # e.g. "Saved 200 tags (total 400)"


def main():                                                  # where the program starts
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="Tag ended sessions as connected, failed or no_attempt.")   # a reader for the command you typed
    parser.add_argument("--once", action="store_true", help="tag what is there, then exit")   # one option: --once (typed = True)
    args = parser.parse_args()                               # read what was typed; args.once is True or False

    print("Pipeline started")                                # show that it started

    print(f"Database: {config.DB_NAME}")                     # show which database it uses
    print(f"Host: {config.DB_HOST}")                         # where that database is
    print(f"Port: {config.DB_PORT}")                         # which door
    print(f"Batch size: {config.BATCH_SIZE}")                # how many sessions per batch

    try:                                                     # watch for Ctrl+C anywhere in the loop below
        while True:                                          # keep running round after round
            try:                                             # watch for database problems in this round
                with db.connect() as conn:                   # open the connection; it closes itself after
                    total = tag_new_sessions(conn)           # do one round

                print(f"Done. {total} sessions tagged this round")   # e.g. "Done. 6501 sessions tagged this round"

            except psycopg.OperationalError as error:        # the database could not be reached
                if args.once:                                # with --once...
                    raise                                    # ...stop and show the error

                print(f"Database not reachable, will try again: {error}")   # otherwise report it and try next round

            if args.once:                                    # with --once...
                break                                        # ...stop after one round

            print(f"Waiting {config.WAIT_SECONDS} s for new sessions (Ctrl+C to stop)")   # say we're waiting

            time.sleep(config.WAIT_SECONDS)                  # wait 30 seconds, then the loop starts again

    except KeyboardInterrupt:                                # you pressed Ctrl+C
        print("Stopped with Ctrl+C. Saved batches are kept; an unfinished batch was not saved.")

    print("Pipeline stopped")                                # always the last line


if __name__ == "__main__":                                   # only when you start this file directly...
    main()                                                   # ...run main()
