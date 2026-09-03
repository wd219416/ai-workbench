@echo off
REM ============================================================
REM  Dianzhi AI Content Workbench - Portable Launcher
REM  %~dp0 = script directory (project root)
REM  %USERPROFILE% = user home (adapts to different usernames)
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

REM Check if port 3100 is already in use
netstat -ano | findstr ":3100 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Workbench is already running. Opening browser...
  start http://localhost:3100
  timeout /t 2 >nul
  exit /b 0
)

echo ================================================
echo   Dianzhi AI Content Workbench
echo   Server: http://localhost:3100
echo   Login:  admin / admin123
echo ================================================
echo.
start http://localhost:3100
npm start
