# justfile: the pipeline's commands, for Linux and Windows. See RUNBOOK.md.

set windows-shell := ["cmd.exe", "/C"]

python := if os_family() == "windows" { "python" } else { "python3" }

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# List the commands
default:
    @just --list

# Create the three generated tables if missing
setup:
    {{db}} < sql/setup.sql

# Process pending sessions (just run 20 = at most 20)
run n="":
    {{python}} -m pipeline run --once {{ if n == "" { "" } else { "--limit " + n } }}

# Run continuously until Ctrl+C
live:
    {{python}} -m pipeline run

# Show processing status
status:
    {{python}} -m pipeline status

# Validate the results
check:
    {{db}} < sql/check.sql

# Generate analytics reports
report:
    {{db}} < sql/report.sql

# Preview the generated tables (10 rows each, latest start time first)
tables:
    {{db}} -e "SELECT session_id, tag, reason, started_at, run_id FROM session_tags ORDER BY started_at DESC LIMIT 10; SELECT connection_id, session_id, tag, reason, started_at, run_id FROM connection_tags ORDER BY started_at DESC LIMIT 10; SELECT run_id, started_at, finished_at, status, sessions_tagged, error FROM pipeline_runs ORDER BY started_at DESC LIMIT 10;"

# Inspect the raw data (tables, columns, event names)
explore:
    {{db}} < sql/explore.sql

# Open the SQL shell (\q to leave)
sql:
    docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics

# Clear the generated tables (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags and pipeline_runs?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true;"
