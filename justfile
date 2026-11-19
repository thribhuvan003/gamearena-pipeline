# justfile: the pipeline's commands. Written for the local setup: Windows PowerShell + CockroachDB in the Docker container "cockroachdb". Type `just` to list them.

set shell := ["powershell.exe", "-NoProfile", "-Command"]

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# List the commands
default:
    @just --list

# Create the tables
setup:
    Get-Content sql/setup.sql | {{db}}

# Process pending sessions (just run 20 = at most 20)
run n="":
    if ("{{n}}") { python -m pipeline run --limit {{n}} } else { python -m pipeline run --once }

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
    Get-Content sql/report.sql | {{db}} | Out-File -Encoding utf8 "$HOME\Documents\gamearena-report.txt"; Write-Output "Saved to $HOME\Documents\gamearena-report.txt"

# Inspect the raw data
explore:
    Get-Content sql/explore.sql | {{db}}

# Clear the generated tables (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags and pipeline_runs?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true;"
