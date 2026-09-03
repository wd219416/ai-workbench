@echo off
REM ============================================================
REM  Build + Deploy standalone output to server\
REM  Usage: build.bat   (run from project root)
REM  1) next build (output: standalone)
REM  2) copy .next\standalone -> server\
REM  3) copy .next\static -> server\.next\static
REM  4) remove traced data snapshot (real data\ lives at project root)
REM ============================================================
cd /d "%~dp0"

set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
set NODE_OPTIONS=

echo [1/4] Building (standalone output)...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

if not exist ".next\standalone\server.js" (
  echo [ERROR] .next\standalone\server.js not generated. Check next.config.mjs output:"standalone".
  pause
  exit /b 1
)

echo [2/4] Deploying to server\ ...
if exist "server" rmdir /s /q "server"
xcopy ".next\standalone" "server\" /e /i /q >nul
if errorlevel 1 (
  echo [ERROR] Copy standalone failed.
  pause
  exit /b 1
)

echo [3/4] Copying static assets...
if not exist "server\.next" mkdir "server\.next"
xcopy ".next\static" "server\.next\static\" /e /i /q >nul
if errorlevel 1 (
  echo [ERROR] Copy static failed.
  pause
  exit /b 1
)

echo [4/5] Removing traced data snapshot (use real data\ at root)...
if exist "server\data" rmdir /s /q "server\data"

echo [5/5] Patching server.js (WORKBENCH_DATA_DIR fallback)...
node patch-server.cjs
if errorlevel 1 (
  echo [ERROR] patch-server.cjs failed.
  pause
  exit /b 1
)

echo.
echo [OK] Deployed to server\ . Start with start.bat
echo     NOTE: if service is running on 3100, stop it first, then start.bat
pause
