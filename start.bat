@echo off
cd /d C:\Users\11390\WorkBuddy\2026-09-02-15-20-22\ai-workbench
set PATH=C:\Users\11390\.workbuddy\binaries\node\versions\22.22.2-2;%PATH%
set NODE_OPTIONS=
start http://localhost:3100
npm start
