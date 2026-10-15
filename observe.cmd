@echo off
cd /d "%~dp0"
node scripts/observe.mjs --watch
pause
