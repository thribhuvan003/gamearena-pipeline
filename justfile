# justfile: every command for the backend (pipeline + SQL) and the frontend (dashboard), on Linux and Windows. See RUNBOOK.md.

set windows-shell := ["cmd.exe", "/C"]

python := if os_family() == "windows" { "python" } else { "python3" }

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# List the commands
default:
    @just --list

# Create the five generated tables if missing
setup:
    {{db}} < backend/sql/setup.sql

# Process pending sessions (just run 20 = at most 20)
run n="":
    cd backend && {{python}} -m pipeline run --once {{ if n == "" { "" } else { "--limit " + n } }}

# Run continuously until Ctrl+C
live:
    cd backend && {{python}} -m pipeline run

# Refresh session_facts and error_events (just facts all = recount every session)
facts mode="":
    cd backend && {{python}} -m pipeline facts {{ if mode == "all" { "--all" } else { "" } }}

# Show processing status
status:
    cd backend && {{python}} -m pipeline status

# Validate the results
check:
    {{db}} < backend/sql/check.sql

# Four main analytics summaries
report:
    {{db}} < backend/sql/report.sql

# Daily session and connection outcomes
trends:
    {{db}} < backend/sql/trends.sql

# Detailed errors recorded for failed sessions
errors:
    {{db}} < backend/sql/errors.sql

# How complete the data is and what each result rests on (counts only; needs gamearena_source)
profile:
    {{db}} < backend/sql/profile.sql

# Check the tagging rules on small made-up sessions (no database needed)
test:
    cd backend && {{python}} -m unittest discover -s tests

# Preview ten rows from each generated table
tables:
    {{db}} < backend/sql/tables.sql

# Inspect the raw data (tables, columns, event names)
explore:
    {{db}} < backend/sql/explore.sql

# Open the SQL shell (\q to leave)
sql:
    docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics

# Start the dashboard at http://localhost:3000 (Ctrl+C stops it)
dashboard:
    cd frontend && npm install && npm run dev

# Clear the generated tables (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags and pipeline_runs?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true;"
