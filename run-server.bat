@echo off
REM ============================================================
REM  Standalone server launcher (no browser, log to file)
REM  Used for headless/hidden start: server runs detached.
REM  Logs: server-out.log / server-err.log (project root)
REM  ★ 2026-09-03: 部署目录从 server\ 改为 runtime\
REM    （并行会话残留的 rmSync('server') 重放任务会删 server\）
REM ============================================================
cd /d "%~dp0"
REM ★ standalone 的 server.js 会 process.chdir(__dirname)，必须显式指定真实数据目录
set "WORKBENCH_DATA_DIR=%~dp0data"
set "NODE_DIR=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
set NODE_OPTIONS=
set "PORT=3100"
set "HOSTNAME=0.0.0.0"
node runtime\server.js >> server-out.log 2>> server-err.log
