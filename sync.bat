@echo off
REM ============================================================
REM  AI Workbench - New Machine Sync Script (Plan B)
REM  Usage: Put data-backup.zip next to this file, then double-click
REM  Steps: extract data -> npm install -> build -> start
REM ============================================================
cd /d "%~dp0"

echo ================================================
echo   AI Workbench - New Machine Sync
echo ================================================

REM Locate WorkBuddy managed Node
set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%NODE_DIR%\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
  echo [1/5] WorkBuddy Node: OK
) else (
  echo [WARN] WorkBuddy Node not found, using system Node
  where node >nul 2>&1 || (
    echo [ERROR] Node.js not found. Install Node 22+ or WorkBuddy.
    pause
    exit /b 1
  )
)
set NODE_OPTIONS=

REM Step 2: Extract data-backup.zip
if exist "data-backup.zip" (
  echo [2/5] Extracting data-backup.zip...
  if not exist data mkdir data
  powershell -NoProfile -Command "Expand-Archive -Path 'data-backup.zip' -DestinationPath 'data' -Force"
  if exist "data\fieldkey.bin" (
    echo       data/ restored (fieldkey + db + uploads)
  ) else (
    echo [ERROR] Extraction failed - fieldkey.bin not found
    pause
    exit /b 1
  )
) else (
  echo [2/5] No data-backup.zip found - starting with fresh data
  echo       First run will auto-create encryption key + empty db
)

REM Step 3: npm install
echo [3/5] Installing dependencies...
call npm install --silent
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed
  pause
  exit /b 1
)

REM Step 4: Build
echo [4/5] Building project...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build failed
  pause
  exit /b 1
)

REM Step 5: Start
echo [5/5] Starting server...
echo ================================================
echo   Server: http://localhost:3100
echo   Login:  admin / admin123
echo ================================================
start http://localhost:3100
call npm start
