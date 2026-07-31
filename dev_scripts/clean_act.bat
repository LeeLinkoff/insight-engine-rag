@echo off
REM ============================================================
REM  clean_act.bat
REM  Clears out caches/temp data left behind by act + Docker
REM  during local workflow testing.
REM
REM  What this removes (safe, low-risk):
REM    - act's own action cache (C:\Users\<you>\.cache\act)
REM    - stopped Docker containers (docker container prune)
REM    - dangling/untagged Docker images (docker image prune)
REM
REM  What this does NOT remove by default:
REM    - The catthehacker/ubuntu:act-latest base image (~500MB).
REM      Left in place on purpose, removing it means act has to
REM      re-download it on the next run. Instructions to remove
REM      it manually are printed at the end if you actually want
REM      to reclaim that space.
REM ============================================================

echo ============================================================
echo  Current Docker disk usage, before cleanup
echo ============================================================
docker system df
echo.

echo ============================================================
echo  Removing act's action cache: %USERPROFILE%\.cache\act
echo ============================================================
if exist "%USERPROFILE%\.cache\act" (
    rmdir /s /q "%USERPROFILE%\.cache\act"
    echo Removed.
) else (
    echo Nothing found there, already clean.
)
echo.

echo ============================================================
echo  Removing act's config folder: %LOCALAPPDATA%\act
echo  ^(contains actrc, just settings, not the act.exe binary itself^)
echo ============================================================
if exist "%LOCALAPPDATA%\act" (
    rmdir /s /q "%LOCALAPPDATA%\act"
    echo Removed.
) else (
    echo Nothing found there, already clean.
)
echo.

echo ============================================================
echo  Removing stopped Docker containers
echo ============================================================
docker container prune -f
echo.

echo ============================================================
echo  Removing dangling/untagged Docker images
echo ============================================================
docker image prune -f
echo.

echo ============================================================
echo  Current Docker disk usage, after cleanup
echo ============================================================
docker system df
echo.

echo ============================================================
echo  NOTE: the catthehacker/ubuntu:act-latest base image
echo  ~500MB, was intentionally left in place, so the next
echo  act run doesn't have to re-download it.
echo.
echo  If you actually want to remove it too, run:
echo    docker rmi catthehacker/ubuntu:act-latest
echo  It will be re-downloaded automatically the next time you
echo  run act, adding a few minutes to that next run.
echo ============================================================
pause
