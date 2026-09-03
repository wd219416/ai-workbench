@echo off
REM ============================================================
REM  Dianzhi AI Content Workbench - Portable Launcher
REM  %~dp0 = script directory (project root)
REM  %USERPROFILE% = user home (adapts to different usernames)
REM
REM  2026-09-03: standalone mode - runs server\server.js
REM  (self-contained build output, immune to .next deletion)
REM  WORKBENCH_DATA_DIR points at the real data\ directory (db/keys/uploads),
REM  because server.js chdir()s into server\ and process.cwd() would be wrong.
REM ============================================================
cd /d "%~dp0"

REM Locate WorkBuddy managed Node (adapts to different machines)
set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%NODE_DIR%\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
  echo [OK] WorkBuddy Node: %NODE_DIR%
) else (
  echo [WARN] WorkBuddy managed Node not found at %NODE_DIR%
  echo [WARN] Falling back to system Node. Need Node 22+.
  where node >nul 2>&1 || (
    echo [ERROR] Node.js not found. Install Node 22+ or WorkBuddy.
    pause
    exit /b 1
  )
)
set NODE_OPTIONS=

REM Note: these env proxies help npm/git/curl, but Next.js server-side fetch
REM does NOT honor them. For overseas engines (LOVART/Kling/Vidu) you MUST
REM enable Clash Verge "TUN mode" (Service Mode) so node traffic is proxied too.
set "HTTP_PROXY=http://127.0.0.1:7897"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "http_proxy=http://127.0.0.1:7897"
set "https_proxy=http://127.0.0.1:7897"

REM Check if port 3100 is already in use
netstat -ano | findstr ":3100 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Workbench is already running. Opening browser...
  start http://localhost:3100
  timeout /t 2 >nul
  exit /b 0
)

REM Check standalone build exists
if not exist "server\server.js" (
  echo [ERROR] server\server.js not found. Standalone build missing.
  echo [ERROR] Run: build.bat  ^(or: NODE_OPTIONS="" npm run build, then deploy^)
  pause
  exit /b 1
)

echo ================================================
echo   Dianzhi AI Content Workbench  [standalone]
echo   Server: http://localhost:3100
echo   Login:  admin / admin123
echo ================================================
echo.
start http://localhost:3100
set "PORT=3100"
set "HOSTNAME=0.0.0.0"
set "WORKBENCH_DATA_DIR=%~dp0data"
node server\server.js
