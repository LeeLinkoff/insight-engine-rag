@echo off
REM ============================================================
REM  uninstall_act.bat
REM  Fully removes act, not just its caches. Use this only if
REM  you're actually done with local workflow testing and want
REM  the tool itself gone, not just the disk space it's using.
REM
REM  Run clean_act.bat first if you just want to reclaim space
REM  while keeping act installed for future use.
REM ============================================================

echo This will permanently remove:
echo   - C:\Program Files\act_Windows_x86_64 (the act.exe binary)
echo   - %USERPROFILE%\.cache\act (cached actions)
echo   - %LOCALAPPDATA%\act (config)
echo   - dev_scripts\act.bat will stop working after this
echo.
set /p CONFIRM=Type YES to confirm removal: 

if /i not "%CONFIRM%"=="YES" (
    echo Cancelled, nothing removed.
    pause
    exit /b 0
)

if exist "C:\Program Files\act_Windows_x86_64" (
    rmdir /s /q "C:\Program Files\act_Windows_x86_64"
    echo Removed act.exe.
)

if exist "%USERPROFILE%\.cache\act" (
    rmdir /s /q "%USERPROFILE%\.cache\act"
    echo Removed action cache.
)

if exist "%LOCALAPPDATA%\act" (
    rmdir /s /q "%LOCALAPPDATA%\act"
    echo Removed config.
)

echo.
echo Done. act has been fully removed.
echo Note: the catthehacker/ubuntu:act-latest Docker image, if
echo still present, was NOT removed by this script, that's a
echo separate Docker image, not part of act itself. Remove it
echo manually with: docker rmi catthehacker/ubuntu:act-latest
pause
