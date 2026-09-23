@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:3005 in your browser. Close this window to stop.
node node_modules\next\dist\bin\next dev --hostname 127.0.0.1 --port 3005
pause
