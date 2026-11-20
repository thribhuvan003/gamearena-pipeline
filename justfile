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

# Four main analytics summaries
report:
    {{db}} < sql/report.sql

# Daily session and connection outcomes
trends:
    {{db}} < sql/trends.sql

# Detailed errors recorded for failed sessions
errors:
    {{db}} < sql/errors.sql

# Preview ten rows from each generated table
tables:
    {{db}} < sql/tables.sql

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
