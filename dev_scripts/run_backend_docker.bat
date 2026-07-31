@echo off
REM ============================================================
REM  run_backend_docker.bat
REM  Builds and runs the backend the same way it runs in
REM  production, inside Docker, rather than directly with
REM  `node server.js`. Checks Docker Desktop is running first
REM  and starts it automatically if not.
REM  Place this file in the project root, next to backend\.
REM ============================================================

cd /d %~dp0

call start_docker.bat
if errorlevel 1 (
    echo.
    echo Docker did not start successfully, aborting.
    pause
    exit /b 1
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
