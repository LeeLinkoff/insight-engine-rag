
@echo off
REM ============================================================
REM  act.bat
REM  Wrapper for act.exe that checks/starts Docker first, since
REM  act requires Docker and gives a confusing error if it's not
REM  running rather than a clear one.
REM  Forwards all arguments straight through to the real act.exe.
REM ============================================================
 
call "%~dp0start_docker.bat"
if errorlevel 1 (
    echo.
    echo Docker did not start successfully, aborting.
    pause
    exit /b 1
)
 
"C:\Program Files\act_Windows_x86_64\act.exe" %*
 