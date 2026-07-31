@echo off
REM ============================================================
REM  test_ci_yml.bat
REM  Runs the eval-harness job locally via act, without ever
REM  hardcoding the OpenAI key in this tracked file. Reads it
REM  from secrets\openai_key.txt instead (already gitignored).
REM
REM  One-time setup:
REM    notepad ..\secrets\openai_key.txt
REM  Paste ONLY the raw key on the first line, nothing else,
REM  no quotes, no "OPENAI_API_KEY=" prefix. Save.
REM
REM  IMPORTANT: act treats whatever directory it's run FROM as
REM  the repo root, there is no separate flag to decouple that.
REM  This script cd's to the actual repo root internally before
REM  calling act, so it works correctly no matter which folder
REM  you were standing in when you ran it.
REM ============================================================

set "KEYFILE=%~dp0..\secrets\openai_key.txt"

if not exist "%KEYFILE%" (
    echo.
    echo ============================================================
    echo  ERROR: Key file not found at:
    echo  %KEYFILE%
    echo.
    echo  Create it with:
    echo    notepad "%KEYFILE%"
    echo  Paste ONLY the raw OpenAI key on the first line, nothing
    echo  else, no quotes, no "OPENAI_API_KEY=" prefix.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

set /p OPENAI_KEY=<"%KEYFILE%"

if "%OPENAI_KEY%"=="" (
    echo.
    echo ERROR: %KEYFILE% exists but is empty.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0.."

call "%~dp0act.bat" push -j eval-harness -W .github/workflows/ci.yml --secret OPENAI_API_KEY=%OPENAI_KEY%

echo.
pause
