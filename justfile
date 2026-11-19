# justfile: the fixed commands for running the pipeline. Type `just` to list them.

set shell := ["powershell.exe", "-NoProfile", "-Command"]

db := "docker exec -i cockroachdb ./cockroach sql --insecure -d gamearena_analytics --format=table"

# list the commands
default:
    @just --list

# create our 3 tables if they don't exist yet (safe to run again)
setup:
    Get-Content sql/setup.sql | {{db}}

# tag everything waiting, or only n sessions (just run 20), then stop
run n="":
    if ("{{n}}") { python -m pipeline run --limit {{n}} } else { python -m pipeline run --once }

# keep tagging new sessions every WAIT_SECONDS (default 30 s) until Ctrl+C
live:
    python -m pipeline run

# totals for sessions and client connections, sessions waiting, and the last 5 runs with how long they took
status:
    python -m pipeline status

# prove the saved tags, reasons and dates (every *_wrong must be 0)
check:
    Get-Content sql/check.sql | {{db}}

# the founder reports
report:
    Get-Content sql/report.sql | {{db}}

# save the reports to your private notes folder to read in full (they contain error texts, so not in this repo)
report-file:
    New-Item -ItemType Directory -Force "$HOME\Documents\gamearena-notes" | Out-Null; Get-Content sql/report.sql | {{db}} | Out-File -Encoding utf8 "$HOME\Documents\gamearena-notes\report.txt"; Write-Output "Saved to $HOME\Documents\gamearena-notes\report.txt"

# look at the raw data: tables, columns, event names, payload fields
explore:
    Get-Content sql/explore.sql | {{db}}

# empty our 3 tables so the next run starts from zero (raw telemetry is not touched)
[confirm("Delete every row in session_tags, connection_tags and pipeline_runs?")]
reset:
    {{db}} -e "DELETE FROM session_tags WHERE true; DELETE FROM connection_tags WHERE true; DELETE FROM pipeline_runs WHERE true;"
