@echo off
REM ============================================================
REM  git_unstaged_diff_report.bat
REM  Dumps UNSTAGED changes (working tree, not yet git add'd)
REM  into a single file and opens it in Notepad. This is what
REM  shows red in `git status`.
REM
REM  For STAGED changes instead, use git_staged_diff_report.bat.
REM  Lives in dev_scripts\. Reports are written to dev_reports\
REM  at the project root.
REM ============================================================

cd /d %~dp0..

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: %cd% does not look like a git repository.
    pause
    exit /b 1
)

set "REPORT=%~dp0..\dev_reports\all-diffs-SAFE_TO_DELETE.txt"

if not exist "%~dp0..\dev_reports" mkdir "%~dp0..\dev_reports"

echo Writing unstaged diffs to %REPORT% ...
git diff -- . ":(exclude)Secrets" > "%REPORT%" 2>&1

echo.
echo Done. Report saved to %REPORT%
echo Opening in Notepad...
notepad "%REPORT%"