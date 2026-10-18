@echo off
chcp 65001 >nul
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto end
.venv\Scripts\python.exe -m pip install -r requirements-collector.txt
:end
pause
