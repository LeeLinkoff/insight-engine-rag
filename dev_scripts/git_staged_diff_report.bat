@echo off
REM ============================================================
REM  git_staged_diff_report.bat
REM  Dumps STAGED changes (git add'd but not yet committed) into
REM  a single file and opens it in Notepad. Use this to see
REM  exactly what's about to be committed, before committing.
REM
REM  For UNSTAGED changes instead, use git_diff_report.bat.
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

set "REPORT=%~dp0staged-diffs-SAFE_TO_DELETE.txt"

echo Writing staged diffs to %REPORT% ...
git diff --cached -- . ":(exclude)Secrets" > "%REPORT%" 2>&1

echo.
echo Done. Report saved to %REPORT%
echo Opening in Notepad...
notepad "%REPORT%"
