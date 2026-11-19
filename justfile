# justfile: the pipeline's commands. Run them in PowerShell from this folder (local setup: CockroachDB in the Docker container "cockroachdb"). Type `just` to list them.

set shell := ["powershell.exe", "-NoProfile", "-Command"]

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# List the commands
default:
    @just --list

# Create the three generated tables if missing
setup:
    Get-Content sql/setup.sql | {{db}}

# Process pending sessions (just run 20 = at most 20)
run n="":
    python -m pipeline run --once {{ if n == "" { "" } else { "--limit " + n } }}

# Run continuously until Ctrl+C
live:
    python -m pipeline run

# Show processing status
status:
    python -m pipeline status

# Validate the results
check:
    Get-Content sql/check.sql | {{db}}

# Generate analytics reports
report:
    Get-Content sql/report.sql | {{db}}

# Save the reports to Documents\gamearena-report.txt
report-file:
    Get-Content sql/report.sql | {{db}} | Out-File -Encoding utf8 "$HOME\Documents\gamearena-report.txt"; if ($LASTEXITCODE -eq 0) { Write-Output "Saved to $HOME\Documents\gamearena-report.txt" } else { Write-Error "Report failed; see the error above"; exit 1 }

# Preview the generated tables (newest 10 rows of each)
tables:
    {{db}} -e "SELECT session_id, tag, reason, started_at, run_id FROM session_tags ORDER BY started_at DESC LIMIT 10; SELECT connection_id, session_id, tag, reason, started_at, run_id FROM connection_tags ORDER BY started_at DESC LIMIT 10; SELECT run_id, started_at, finished_at, status, sessions_tagged, error FROM pipeline_runs ORDER BY started_at DESC LIMIT 10;"

# Show the newest 20 unsuccessful client connections
failures:
    {{db}} -e "SELECT session_id, connection_id, reason, started_at FROM connection_tags WHERE tag = 'not_connected' ORDER BY started_at DESC LIMIT 20;"

# Inspect the raw data (tables, columns, event names)
explore:
    Get-Content sql/explore.sql | {{db}}

# Open the SQL shell (\q to leave)
sql:
    docker exec -it cockroachdb ./cockroach sql --insecure -d gamearena_analytics

# Clear the generated tables (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags and pipeline_runs?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true;"
