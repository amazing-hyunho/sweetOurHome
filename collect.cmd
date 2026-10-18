@echo off
cd /d "%~dp0"
call npm run collect -- --watch
pause
