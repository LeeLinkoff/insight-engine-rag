@echo off
REM ============================================================
REM  git_diff_report.bat
REM  Dumps all current git diffs (working tree changes) into a
REM  single file and opens it in Notepad.
REM  Place this file anywhere inside the git repo.
REM ============================================================

cd /d %~dp0

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: %cd% does not look like a git repository.
    pause
    exit /b 1
)

set "REPORT=%~dp0all-diffs-SAFE_TO_DELETE.txt"

echo Writing all diffs to %REPORT% ...
git diff > "%REPORT%" 2>&1

echo.
echo Done. Report saved to %REPORT%
echo Opening in Notepad...
notepad "%REPORT%"
