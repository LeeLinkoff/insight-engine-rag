@echo off
REM ============================================================
REM  test_ci_yml.bat
REM  Runs the eval-harness job locally via act, reading the
REM  OpenAI key straight from backend\.env, the same file the
REM  local server actually uses. No separate copy of the key is
REM  kept anywhere, one less place for it to silently drift out
REM  of sync when you rotate it.
REM
REM  IMPORTANT: act treats whatever directory it's run FROM as
REM  the repo root, there is no separate flag to decouple that.
REM  This script cd's to the actual repo root internally before
REM  calling act, so it works correctly no matter which folder
REM  you were standing in when you ran it.
REM ============================================================

set "ENVFILE=%~dp0..\backend\.env"

if not exist "%ENVFILE%" (
    echo.
    echo ============================================================
    echo  ERROR: %ENVFILE% not found.
    echo  Run this after backend\.env is set up, same file
    echo  run_back.bat already requires.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

set "OPENAI_KEY="
for /f "usebackq tokens=1,* delims==" %%a in ("%ENVFILE%") do (
    if /i "%%a"=="OPENAI_API_KEY" set "OPENAI_KEY=%%b"
)

if "%OPENAI_KEY%"=="" (
    echo.
    echo ERROR: No OPENAI_API_KEY= line found in %ENVFILE%.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0.."

call "%~dp0act.bat" push -j eval-harness -W .github/workflows/ci.yml --secret OPENAI_API_KEY=%OPENAI_KEY%

echo.
pause
