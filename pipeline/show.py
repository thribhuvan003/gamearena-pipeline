# show.py: answers questions about what the pipeline has done. Only reads, never changes anything.

TAG_TOTALS_SQL = """
SELECT tag, count(*) AS sessions                             -- each tag and how many sessions have it
FROM session_tags                                            -- from our results table
GROUP BY tag                                                 -- one row per tag
ORDER BY sessions DESC                                       -- biggest first
"""

WAITING_SQL = """
SELECT count(DISTINCT e.session_id)                          -- how many different sessions...
FROM session_telemetry_events e                              -- ...in the raw events...
WHERE e.event_type = 'session_ended'                         -- ...have ended...
  AND NOT EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id)   -- ...but have no tag yet
"""

LAST_RUNS_SQL = """
SELECT started_at, status, sessions_tagged, error            -- when, how it went, how many, what went wrong
FROM pipeline_runs                                           -- from the job diary
ORDER BY started_at DESC                                     -- newest first
LIMIT 5                                                      -- only the last 5
"""


def show_status(conn):                                       # "what do we have so far?"
    totals = conn.execute(TAG_TOTALS_SQL).fetchall()         # [(tag, count), ...]
    tagged = sum(count for tag, count in totals)             # add up all the tags
    breakdown = ", ".join(f"{tag} {count:,}" for tag, count in totals)   # e.g. "connected 5,614, failed 880"
    print(f"Tagged sessions: {tagged:,}   ({breakdown})")    # one line with the totals

    waiting = conn.execute(WAITING_SQL).fetchone()[0]        # how many ended sessions still have no tag
    print(f"Waiting to be tagged: {waiting:,}")              # e.g. "Waiting to be tagged: 0"

    print("Last runs:")                                      # heading for the job diary
    for started_at, status, sessions_tagged, error in conn.execute(LAST_RUNS_SQL).fetchall():   # each of the last 5 runs
        line = f"  {started_at:%Y-%m-%d %H:%M}  {status:<7} {sessions_tagged:,} sessions"   # e.g. "2026-11-17 14:12  ok  20 sessions"
        print(line + (f"  ({error})" if error else ""))      # add the error text only if the run failed


QUESTIONS = {                                                # every question 'show' can answer: name -> function
    "status": show_status,
}
