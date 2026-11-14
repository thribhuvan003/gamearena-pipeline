@echo off
rem Runs the pipeline with the project's own Python (.venv), so psycopg is found.
"%~dp0.venv\Scripts\python.exe" -m pipeline %*
