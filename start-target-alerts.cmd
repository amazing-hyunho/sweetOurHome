@echo off
cd /d "%~dp0"
node scripts/notify-targets.mjs --watch
pause
