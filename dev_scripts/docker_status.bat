@echo off
REM ============================================================
REM  docker_status_report.bat
REM  Gathers detailed Docker status (engine, images, containers,
REM  networks, volumes, disk usage) into a text file, then opens
REM  it in Notepad.
REM ============================================================

cd /d %~dp0

set "REPORT=%~dp0docker_status_report-SAFE_TO_DELETE.txt"

echo Checking Docker is running...
docker info >nul 2>&1
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: Docker does not appear to be running.
    echo  Start Docker Desktop, wait for it to fully start, then
    echo  run this script again.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo Writing report to %REPORT% ...

(
    echo ============================================================
    echo  DOCKER STATUS REPORT
    echo  Generated: %date% %time%
    echo ============================================================
    echo.

    echo ---- Docker version, client and server ----
    docker version
    echo.

    echo ---- Engine info ----
    docker info
    echo.

    echo ---- Running containers ----
    docker ps
    echo.

    echo ---- All containers, including stopped ----
    docker ps -a
    echo.

    echo ---- Images ----
    docker images
    echo.

    echo ---- Dangling images, images not tagged or referenced ----
    docker images -f dangling=true
    echo.

    echo ---- Networks ----
    docker network ls
    echo.

    echo ---- Volumes ----
    docker volume ls
    echo.

    echo ---- Disk usage summary ----
    docker system df
    echo.

    echo ---- Disk usage, verbose per-item breakdown ----
    docker system df -v
    echo.

    echo ---- Current build cache usage ----
    docker builder du 2>nul
    echo.

    echo ---- Currently logged-in registries ----
    type "%USERPROFILE%\.docker\config.json" 2>nul
    echo.

    echo ============================================================
    echo  END OF REPORT
    echo ============================================================
) > "%REPORT%" 2>&1

echo Done. Opening report in Notepad...
notepad "%REPORT%"
