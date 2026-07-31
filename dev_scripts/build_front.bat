@echo off
REM ============================================================
REM  build_front.bat
REM  Production build of the frontend (npm run build).
REM  Lives in dev_scripts\, frontend\ is one level up.
REM ============================================================

cd /d %~dp0..\frontend

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
echo Building production bundle...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: Build failed. See output above.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

if not exist "dist" (
    echo.
    echo ============================================================
    echo  ERROR: npm run build reported success but no dist\ folder
    echo  was created. Check vite.config.js for a custom build.outDir
    echo  setting that might be pointing somewhere else.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Build complete. Output written to:
echo  %cd%\dist
echo ============================================================
pause
