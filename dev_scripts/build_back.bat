@echo off
REM ============================================================
REM  build_back.bat
REM  Builds and runs the backend in Docker.
REM  Place this file in the project root, next to backend\ and
REM  start_docker.bat.
REM ============================================================

cd /d %~dp0

if exist "start_docker.bat" (
    call start_docker.bat
    if errorlevel 1 (
        echo.
        echo Docker did not start successfully, aborting.
        pause
        exit /b 1
    )
) else (
    echo Checking if Docker is running...
    docker info >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ============================================================
        echo  ERROR: Docker does not appear to be running, and
        echo  start_docker.bat was not found next to this script to
        echo  start it automatically. Open Docker Desktop manually,
        echo  wait for it to fully start, then run this script again.
        echo ============================================================
        echo.
        pause
        exit /b 1
    )
)

cd /d %~dp0backend

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

echo.
echo Building backend image...
docker build -t rag-backend .
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: docker build failed. See output above.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo Removing any existing rag-backend container...
docker rm -f rag-backend >nul 2>&1

echo.
echo Starting backend container...
docker run -d --name rag-backend --restart unless-stopped -p 3001:3001 --env-file .env rag-backend
if errorlevel 1 (
    echo.
    echo ============================================================
    echo  ERROR: docker run failed. See output above.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Backend container is up. Health check:
echo    curl http://127.0.0.1:3001/api/health
echo  Logs:
echo    docker logs -f rag-backend
echo ============================================================
pause
