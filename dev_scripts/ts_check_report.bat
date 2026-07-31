@echo off
setlocal

REM ============================================================================
REM TypeScript Project Verification Script
REM ============================================================================
REM
REM PURPOSE
REM -------
REM Generate a comprehensive verification report for the backend project,
REM including:
REM
REM   * Environment information
REM   * package.json
REM   * tsconfig.json
REM   * npm install verification
REM   * TypeScript compilation
REM   * Security audit
REM   * Final PASS/FAIL summary
REM
REM The report is automatically opened in Notepad when complete.
REM
REM ============================================================================
REM IMPORTANT HISTORY
REM ============================================================================
REM
REM This script originally used ONE large redirected parenthesized block:
REM     (
REM         commands...
REM     ) > report.txt 2>&1
REM
REM That design caused several hours of debugging because CMD parses the
REM ENTIRE parenthesized block before executing it.
REM
REM Consequences included:
REM
REM   * Variables such as %%ERRORLEVEL%% expanding before assignment.
REM   * Delayed expansion complications.
REM   * Extremely confusing parser errors such as:
REM         "0 was unexpected at this time."
REM         "---- was unexpected at this time."
REM   * Difficult-to-debug IF statements.
REM
REM The current implementation intentionally writes each section directly
REM to the report using:
REM     >> "%REPORT%"
REM
REM Although more verbose, it is MUCH easier to debug and avoids CMD parser
REM quirks.
REM
REM ============================================================================
REM IMPORTANT HISTORY #2
REM ============================================================================
REM
REM Another major issue was that Notepad NEVER opened after the report was
REM generated.
REM
REM Root cause:
REM     npm
REM is NOT an executable.
REM
REM It is actually:
REM     npm.cmd
REM
REM Likewise:
REM     npx
REM is:
REM     npx.cmd
REM
REM Both are batch files.
REM
REM Calling one batch file from another WITHOUT CALL transfers execution into
REM the child batch file and NEVER returns to the caller.
REM
REM WRONG:
REM     npm install
REM     npm -v
REM     npx tsc --noEmit
REM
REM CORRECT:
REM     call npm install
REM     call npm -v
REM     call npx tsc --noEmit
REM
REM Because CALL was missing, execution never reached:
REM     start "" notepad "%REPORT%"
REM
REM making it appear that the script terminated immediately after generating
REM the report.
REM
REM ============================================================================
REM DESIGN DECISIONS
REM ============================================================================
REM
REM 1. Every npm/npx invocation MUST use CALL.
REM 2. Avoid giant redirected parenthesized blocks.
REM 3. Append output directly to the report with >>.
REM 4. Always produce an explicit PASS/FAIL summary.
REM 5. Automatically open the report in Notepad.
REM
REM ============================================================================

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "REPORT=%ROOT%ts_check_report-SAFE_TO_DELETE.txt"
set "STARTTIME=%TIME%"

if not exist "%BACKEND%" (
  echo ERROR: Backend directory not found: %BACKEND%
  pause
  exit /b 1
)
if not exist "%BACKEND%\package.json" (
  echo ERROR: package.json not found.
  pause
  exit /b 1
)
if not exist "%BACKEND%\tsconfig.json" (
  echo ERROR: tsconfig.json not found.
  pause
  exit /b 1
)

if exist "%REPORT%" del "%REPORT%"

echo ============================================================>>"%REPORT%"
echo TYPESCRIPT CHECK REPORT>>"%REPORT%"
echo Generated: %DATE% %TIME%>>"%REPORT%"
echo ============================================================>>"%REPORT%"
echo.>>"%REPORT%"

echo ---- Environment ---->>"%REPORT%"
echo Current Directory:>>"%REPORT%"
echo %BACKEND%>>"%REPORT%"
echo Windows:>>"%REPORT%"
ver>>"%REPORT%"
echo Architecture: %PROCESSOR_ARCHITECTURE%>>"%REPORT%"
echo.>>"%REPORT%"

echo ---- Directory listing ---->>"%REPORT%"
dir /b "%BACKEND%" >>"%REPORT%" 2>&1
echo.>>"%REPORT%"

echo ---- package.json ---->>"%REPORT%"
type "%BACKEND%\package.json" >>"%REPORT%" 2>&1
echo.>>"%REPORT%"

echo ---- tsconfig.json ---->>"%REPORT%"
type "%BACKEND%\tsconfig.json" >>"%REPORT%" 2>&1
echo.>>"%REPORT%"

pushd "%BACKEND%"

echo ---- Tool Versions ---->>"%REPORT%"
echo Node:>>"%REPORT%"
node -v>>"%REPORT%" 2>&1
echo npm:>>"%REPORT%"
call npm -v>>"%REPORT%" 2>&1
echo TypeScript:>>"%REPORT%"
call npx tsc --version>>"%REPORT%" 2>&1
echo.>>"%REPORT%"

echo ---- Git ---->>"%REPORT%"
git branch --show-current>>"%REPORT%" 2>&1
git status --short>>"%REPORT%" 2>&1
echo.>>"%REPORT%"

echo ---- npm install ---->>"%REPORT%"
call npm install>>"%REPORT%" 2>&1
echo.>>"%REPORT%"

echo ---- npx tsc --noEmit ---->>"%REPORT%"
call npx tsc --noEmit>>"%REPORT%" 2>&1
set "TSRESULT=%ERRORLEVEL%"
echo.>>"%REPORT%"
echo ---- TypeScript Files ---->>"%REPORT%"
call npx tsc --listFiles>>"%REPORT%" 2>&1
echo.>>"%REPORT%"
echo ---- TypeScript Summary ---->>"%REPORT%"
if %TSRESULT% EQU 0 (
 echo SUCCESS: No TypeScript errors were found.>>"%REPORT%"
) else (
 echo FAILED: One or more TypeScript errors were found.>>"%REPORT%"
)
echo Exit Code: %TSRESULT%>>"%REPORT%"
echo.>>"%REPORT%"

echo ---- npm audit ---->>"%REPORT%"
call npm audit --audit-level=high>>"%REPORT%" 2>&1

popd

echo.>>"%REPORT%"
echo ============================================================>>"%REPORT%"
echo FINAL SUMMARY>>"%REPORT%"
echo ============================================================>>"%REPORT%"
echo Backend Directory : PASS>>"%REPORT%"
echo package.json      : PASS>>"%REPORT%"
echo tsconfig.json     : PASS>>"%REPORT%"
if exist "%BACKEND%\node_modules" (
 echo node_modules     : PASS>>"%REPORT%"
) else (
 echo node_modules     : MISSING>>"%REPORT%"
)
if %TSRESULT% EQU 0 (
 echo Compile          : PASS>>"%REPORT%"
 echo Overall Status   : PASS>>"%REPORT%"
) else (
 echo Compile          : FAIL>>"%REPORT%"
 echo Overall Status   : FAIL>>"%REPORT%"
)
echo Started           : %STARTTIME%>>"%REPORT%"
echo Finished          : %TIME%>>"%REPORT%"
echo ============================================================>>"%REPORT%"

start "" notepad.exe "%REPORT%"
endlocal
exit /b 0
