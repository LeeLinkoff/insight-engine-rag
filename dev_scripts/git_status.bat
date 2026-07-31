@echo off
REM ============================================================
REM  git_status_report.bat
REM  Gathers detailed local AND remote git status into a text
REM  file, then opens it in Notepad.
REM  Place this file anywhere inside the git repo (project root
REM  is fine).
REM ============================================================

cd /d %~dp0..

set "REPORT=%~dp0..\dev_reports\git_status_report-SAFE_TO_DELETE.txt"

echo Checking this is actually a git repo...
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: %cd% does not look like a git repository.
    echo  Move this .bat file inside the repo and try again.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo Fetching from remote to get accurate ahead/behind info...
git fetch --all --prune >nul 2>&1

echo Writing report to %REPORT% ...

(
    echo ============================================================
    echo  GIT STATUS REPORT
    echo  Generated: %date% %time%
    echo  Repo path: %cd%
    echo ============================================================
    echo.

    echo ---- Current branch ----
    git branch --show-current
    echo.

    echo ---- Remotes ----
    git remote -v
    echo.

    echo ---- Local branches, tracking, and ahead/behind counts ----
    git branch -vv
    echo.

    echo ---- All branches, including remote-tracking ----
    git branch -a
    echo.

    echo ---- Short status, branch summary ----
    git status -sb
    echo.

    echo ---- Full status, detailed ----
    git status
    echo.

    echo ---- Uncommitted changes, file-by-file stat ----
    git diff --stat
    echo.

    echo ---- Staged changes, file-by-file stat ----
    git diff --cached --stat
    echo.

    echo ---- Last 10 commits on this branch ----
    git log -10 --oneline --decorate
    echo.

    echo ---- Commits on remote not yet pulled locally ----
    for /f "tokens=*" %%b in ('git branch --show-current') do (
        git log HEAD..origin/%%b --oneline 2>nul
    )
    echo.

    echo ---- Commits made locally not yet pushed ----
    for /f "tokens=*" %%b in ('git branch --show-current') do (
        git log origin/%%b..HEAD --oneline 2>nul
    )
    echo.

    echo ---- Stashed changes, if any ----
    git stash list
    echo.

    echo ============================================================
    echo  END OF REPORT
    echo ============================================================
) > "%REPORT%" 2>&1

echo Done. Opening report in Notepad...
notepad "%REPORT%"
