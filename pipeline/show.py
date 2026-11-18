# show.py: answers questions about what the pipeline has done. Only reads, never changes anything.

# SQL: how many sessions have each tag, biggest first.
TAG_TOTALS_SQL = """
SELECT tag, count(*) AS sessions
FROM session_tags
GROUP BY tag
ORDER BY sessions DESC
"""

# SQL: how many ended sessions have no tag yet.
WAITING_SQL = """
SELECT count(DISTINCT e.session_id)
FROM session_telemetry_events e
WHERE e.event_type = 'session_ended'
  AND NOT EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id)
"""

# SQL: the last 5 runs from the run history, newest first.
LAST_RUNS_SQL = """
SELECT started_at, status, sessions_tagged, error
FROM pipeline_runs
ORDER BY started_at DESC
LIMIT 5
"""


def show_status(conn):                                       # prints the tag totals, how many are waiting and the last 5 runs; stores nothing. Called by show_command for 'show status' (through QUESTIONS)
    totals = conn.execute(TAG_TOTALS_SQL).fetchall()
    tagged = sum(count for tag, count in totals)
    breakdown = ", ".join(f"{tag} {count:,}" for tag, count in totals)
    print(f"Tagged sessions: {tagged:,}   ({breakdown})")

    waiting = conn.execute(WAITING_SQL).fetchone()[0]
    print(f"Waiting to be tagged: {waiting:,}")

    print("Last runs:")
    for started_at, status, sessions_tagged, error in conn.execute(LAST_RUNS_SQL).fetchall():
        line = f"  {started_at:%Y-%m-%d %H:%M}  {status:<7} {sessions_tagged:,} sessions"
        print(line + (f"  ({error})" if error else ""))


QUESTIONS = {
    "status": show_status,
}
