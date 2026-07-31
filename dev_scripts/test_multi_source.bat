@echo off
REM ============================================================
REM  test_multi_source.bat
REM  Pure batch, no PowerShell. Clears the store, ingests two
REM  known overlapping docs, asks a question, reports PASS/FAIL.
REM  Requires the backend already running (run_back.bat) and
REM  curl.exe (built into Windows 10/11 natively).
REM ============================================================

set "BASE=http://localhost:3001"
set "TMPDIR=%TEMP%\ts_multi_test"
if not exist "%TMPDIR%" mkdir "%TMPDIR%"
set "INGEST_JSON=%TMPDIR%\ingest_body.json"
set "QUERY_JSON=%TMPDIR%\query_body.json"
set "QUERY_RESULT=%TMPDIR%\query_result.json"

echo ==== Checking backend is running ====
curl -s -o nul -w "%%{http_code}" "%BASE%/api/health" > "%TMPDIR%\health_code.txt"
set /p HEALTH_CODE=<"%TMPDIR%\health_code.txt"
if not "%HEALTH_CODE%"=="200" (
    echo.
    echo FAIL: Could not reach %BASE%/api/health. Is run_back.bat running?
    pause
    exit /b 1
)
echo Backend is up.

echo.
echo ==== Clearing the store ====
curl -s -X DELETE "%BASE%/api/clear"
echo.

echo.
echo ==== Confirming store is empty ====
curl -s "%BASE%/api/health" > "%TMPDIR%\health_after_clear.json"
findstr /c:"\"chunks\":0" "%TMPDIR%\health_after_clear.json" >nul
if errorlevel 1 (
    echo.
    echo FAIL: Store is not empty after clearing.
    type "%TMPDIR%\health_after_clear.json"
    pause
    exit /b 1
)
echo Confirmed: store is empty.

echo.
echo ==== Ingesting two test documents ====
(
echo {"docs":[
echo   {"id":"coffee_a","text":"Caffeine blocks adenosine receptors in the brain, which is why coffee makes people feel more alert.","meta":{"title":"Doc Coffee A","company":"TestCo"}},
echo   {"id":"coffee_b","text":"Coffee increases alertness because caffeine prevents adenosine from binding to its receptors in the brain.","meta":{"title":"Doc Coffee B","company":"TestCo"}}
echo ]}
) > "%INGEST_JSON%"

curl -s -X POST "%BASE%/api/ingest" -H "Content-Type: application/json" --data-binary "@%INGEST_JSON%"
echo.

echo.
echo ==== Asking the test question ====
(
echo {"question":"Why does coffee make people feel more alert?","topK":4}
) > "%QUERY_JSON%"

curl -s -X POST "%BASE%/api/query" -H "Content-Type: application/json" --data-binary "@%QUERY_JSON%" > "%QUERY_RESULT%"

echo.
echo ==== Raw response ====
type "%QUERY_RESULT%"
echo.

echo.
echo ==== VERDICT ====

findstr /c:"\"flagged\":true" "%QUERY_RESULT%" >nul
if not errorlevel 1 (
    echo FAIL: Answer was flagged by the safety check. This should not happen for this benign question.
    pause
    exit /b 1
)

findstr /c:"\"single_source_warning\":false" "%QUERY_RESULT%" >nul
if errorlevel 1 (
    echo FAIL: single_source_warning was NOT false. Retrieval did not pull from both test docs.
    echo This points to the retrieval/scoring logic itself, since this test's store contains
    echo ONLY the two overlapping test docs, nothing else to compete with.
    pause
    exit /b 1
)

echo PASS: Multi-source retrieval and the green-checkmark path are both working correctly.
echo.
pause
