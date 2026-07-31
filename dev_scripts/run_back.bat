@echo off
cd /d %~dp0backend

echo Checking for .env file...

if not exist ".env" (
    echo.
    echo ============================================================
    echo  ERROR: .env file not found in this folder:
    echo  %cd%
    echo.
    echo  Create it with:
    echo    notepad .env
    echo  Then paste in:
    echo    OPENAI_API_KEY=sk-your-key-here
    echo    PORT=3001
    echo  IMPORTANT: In Notepad's Save dialog, set "Save as type"
    echo  to "All Files", not "Text Documents", or it saves as
    echo  .env.txt instead of .env.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

findstr /b /c:"OPENAI_API_KEY=" .env >nul
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: .env exists but has no OPENAI_API_KEY= line.
    echo  Open it and check the contents:
    echo    notepad .env
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo .env found, OPENAI_API_KEY line present.
echo.

echo Checking if port 3001 is already in use...
set "FOUND_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    set "FOUND_PID=%%p"
)

if defined FOUND_PID (
    echo Port 3001 is already in use by PID %FOUND_PID%.
    echo This is almost always a leftover server from a previous run.
    echo Killing it so this run can bind the port cleanly...
    taskkill /PID %FOUND_PID% /F >nul 2>&1
    timeout /t 1 /nobreak >nul
    echo Done.
) else (
    echo Port 3001 is free.
)
echo.

call npm install
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: npm install failed. See output above.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

node server.js

echo.
echo ============================================================
echo  server.js exited. If this was unexpected, scroll up to see
echo  the error printed above.
echo ============================================================
pause
