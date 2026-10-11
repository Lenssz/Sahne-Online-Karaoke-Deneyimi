@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Once install.cmd dosyasini calistir.
  pause
  exit /b 1
)
start "" ".venv\Scripts\pythonw.exe" "%~dp0sahne_worker.py"
