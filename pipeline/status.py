# status.py: prints what the pipeline has done. Only reads, never changes anything.

# Sessions per tag.
TAG_TOTALS_SQL = """
SELECT tag, count(*) AS sessions
FROM session_tags
GROUP BY tag
ORDER BY sessions DESC
"""

# Client connections per tag.
CONNECTION_TOTALS_SQL = """
SELECT tag, count(*) AS connections
FROM connection_tags
GROUP BY tag
ORDER BY connections DESC
"""

# Ended sessions with no tag yet.
WAITING_SQL = """
SELECT count(DISTINCT e.session_id)
FROM session_telemetry_events e
WHERE e.event_type = 'session_ended'
  AND NOT EXISTS (SELECT 1 FROM session_tags t WHERE t.session_id = e.session_id)
"""

# The last 5 runs that tagged something or failed, with how long each took.
LAST_RUNS_SQL = """
SELECT started_at, status, sessions_tagged, finished_at - started_at AS took, error
FROM pipeline_runs
WHERE sessions_tagged > 0 OR status <> 'ok'
ORDER BY started_at DESC
LIMIT 5
"""


def show_status(conn):                                       # Prints tag totals, sessions waiting and the last 5 runs
    for name, sql in (("sessions", TAG_TOTALS_SQL), ("client connections", CONNECTION_TOTALS_SQL)):
        totals = conn.execute(sql).fetchall()
        breakdown = ", ".join(f"{tag} {count:,}" for tag, count in totals)
        print(f"Tagged {name}: {sum(count for tag, count in totals):,}   ({breakdown})")

    waiting = conn.execute(WAITING_SQL).fetchone()[0]
    print(f"Sessions waiting to be tagged: {waiting:,}")

    print("Last runs:")
    for started_at, status, sessions_tagged, took, error in conn.execute(LAST_RUNS_SQL).fetchall():
        seconds = f"{took.total_seconds():.1f} s" if took is not None else "? s (no finish time recorded)"
        line = f"  {started_at:%Y-%m-%d %H:%M}  {status:<7} {sessions_tagged:,} sessions in {seconds}"
        print(line + (f"  ({error})" if error else ""))
