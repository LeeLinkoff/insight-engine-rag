@echo off
REM ============================================================
REM  clear_actions_history.bat
REM  Deletes ALL GitHub Actions workflow runs for this repo
REM  (both CI and Deploy to VPS, and any others), via the gh CLI.
REM  Requires gh installed and authenticated (gh auth login).
REM ============================================================

set "REPO=LeeLinkoff/insight-engine-rag"

gh --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: gh - GitHub CLI - not found or not in PATH.
    echo.
    pause
    exit /b 1
)

echo This will permanently delete ALL workflow run history for:
echo   %REPO%
echo This does NOT affect the workflow files themselves, only the
echo run history/logs shown in the Actions tab.
echo.
set /p CONFIRM=Type YES to confirm: 

if /i not "%CONFIRM%"=="YES" (
    echo Cancelled, nothing deleted.
    pause
    exit /b 0
)

echo.
echo Deleting all workflow runs, this may take a minute...
for /f %%i in ('gh api repos/%REPO%/actions/runs --paginate --jq ".workflow_runs[].id"') do gh api repos/%REPO%/actions/runs/%%i -X DELETE

echo.
echo Done. Refresh the Actions tab to confirm the list is empty.
pause
