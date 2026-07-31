@echo off
REM Runs as a brand new process, launched by ts_check_report.bat.
REM Its only job is opening the finished report in Notepad, with
REM no npx/tsc history in this process to interfere with it.
notepad "%~dp0ts_check_report-SAFE_TO_DELETE.txt"
