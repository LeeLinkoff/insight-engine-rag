@echo off
REM ============================================================
REM  start_docker.bat
REM  Checks if the Docker engine is actually responding. If not,
REM  launches Docker Desktop and waits (up to 2 minutes) for it
REM  to finish starting before returning control.
REM
REM  Call this at the top of any script that needs docker build/run,
REM  e.g. from run_backend_docker.bat: call start_docker.bat
REM ============================================================

echo Checking if Docker is running...
docker info >nul 2>&1
if not errorlevel 1 (
    echo Docker is already running.
    exit /b 0
)

echo Docker is not running. Attempting to start Docker Desktop...

REM Default install location. If Docker Desktop is installed somewhere
REM else, edit this path to match.
set "DOCKER_DESKTOP_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

if not exist "%DOCKER_DESKTOP_EXE%" (
    echo.
    echo ============================================================
    echo  ERROR: Could not find Docker Desktop at:
    echo  %DOCKER_DESKTOP_EXE%
    echo.
    echo  If it is installed somewhere else, open this file and
    echo  update the DOCKER_DESKTOP_EXE path near the top.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

start "" "%DOCKER_DESKTOP_EXE%"

echo Waiting for Docker engine to become ready, this can take a minute or two...

set /a attempts=0

:waitloop
set /a attempts+=1
docker info >nul 2>&1
if not errorlevel 1 (
    echo.
    echo Docker is now running.
    exit /b 0
)

if %attempts% GEQ 24 (
    echo.
    echo ============================================================
    echo  ERROR: Docker did not become ready after 2 minutes.
    echo  Check the whale icon in your system tray, it should be
    echo  steady, not animating, once fully started.
    echo  Once it looks ready, just re-run your original command.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo   still waiting, attempt %attempts% of 24
timeout /t 5 /nobreak >nul
goto waitloop
