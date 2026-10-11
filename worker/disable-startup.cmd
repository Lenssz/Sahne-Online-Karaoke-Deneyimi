@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Once install.cmd dosyasini calistir.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" sahne_worker.py disable-startup
pause
