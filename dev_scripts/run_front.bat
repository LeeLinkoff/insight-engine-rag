@echo off
cd /d %~dp0frontend

if not exist "package.json" (
    echo.
    echo ============================================================
    echo  ERROR: No package.json found in this folder:
    echo  %cd%
    echo ============================================================
    echo.
    pause
    exit /b 1
)

if not exist ".env.local" (
    echo.
    echo ============================================================
    echo  ERROR: .env.local not found in this folder:
    echo  %cd%
    echo.
    echo  Without it, VITE_API_BASE is undefined, and every backend
    echo  URL built by the app - highlight proxy, etc. - will literally
    echo  contain the text "undefined" instead of a real address.
    echo.
    echo  Create it with:
    echo    notepad .env.local
    echo  Then paste in exactly:
    echo    VITE_API_BASE=http://localhost:3001
    echo  IMPORTANT: In Notepad's Save dialog, set "Save as type"
    echo  to "All Files", not "Text Documents", or it saves as
    echo  .env.local.txt instead of .env.local.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

findstr /b /c:"VITE_API_BASE=" .env.local >nul
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: .env.local exists but has no VITE_API_BASE= line.
    echo  Open it and check the contents:
    echo    notepad .env.local
    echo  It should contain exactly:
    echo    VITE_API_BASE=http://localhost:3001
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo .env.local found, VITE_API_BASE line present. Continuing...
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

echo.
echo Reminder: make sure run_backend.bat is already running in
echo another window before you open the app in a browser.
echo.
echo Starting Vite dev server...
echo.
call npm run dev

echo.
echo ============================================================
echo  Dev server exited. If this was unexpected, scroll up to see
echo  the error printed above.
echo ============================================================
pause