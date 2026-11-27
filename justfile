# justfile: every command for the pipeline (Python), the database (SQL) and the dashboard (Next.js), run from the repo root, on Linux and Windows.

set windows-shell := ["cmd.exe", "/C"]

python := if os_family() == "windows" { "python" } else { "python3" }

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# List the commands
default:
    @just --list

# Create the five generated tables if missing
setup:
    {{db}} < database/setup.sql

# Process sessions with new events once (just run 20 = at most 20)
run n="":
    {{python}} -m pipeline run --once {{ if n == "" { "" } else { "--limit " + n } }}

# Run continuously until Ctrl+C
live:
    {{python}} -m pipeline run

# Process every session again: facts, error copies and tags. Run it nightly: it also catches events stored over LATE_EVENTS_MINUTES late
rebuild:
    {{python}} -m pipeline run --all

# Show processing status
status:
    {{python}} -m pipeline status

# Create the pipeline's own database user: reads the app's tables, writes only its own (run once, as admin)
grants:
    {{db}} < database/grants.sql

# Validate the results
check:
    {{db}} < database/check.sql

# Four main analytics summaries
report:
    {{db}} < database/reports/report.sql

# Daily session and connection outcomes
trends:
    {{db}} < database/reports/trends.sql

# Detailed errors recorded for failed sessions
errors:
    {{db}} < database/reports/errors.sql

# How complete the data is and what each result rests on (counts only; needs gamearena_source)
profile:
    {{db}} < database/reports/profile.sql

# Check the tagging rules on small made-up sessions (no database needed)
test:
    {{python}} -m unittest discover -s pipeline/tests

# Test the pipeline's production behaviour (late events, restarts, rebuilds, permissions) in a throwaway database
integration:
    {{python}} pipeline/tests/integration.py

# Preview ten rows from each generated table
tables:
    {{db}} < database/reports/tables.sql

# Inspect the raw data (tables, columns, event names)
explore:
    {{db}} < database/reports/explore.sql

# Open the SQL shell (\q to leave)
sql:
    docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics

# Start the dashboard at http://localhost:3000 (Ctrl+C stops it)
dashboard:
    cd dashboard && npm install && npm run dev

# Clear the generated tables (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags, pipeline_runs, session_facts and error_events?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true; DELETE FROM session_facts WHERE true; DELETE FROM error_events WHERE true;"
