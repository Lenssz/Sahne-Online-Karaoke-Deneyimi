@echo off
setlocal
cd /d "%~dp0"
echo Sahne yardimci programi kuruluyor...
py -3.11 -c "import sys; assert sys.maxsize > 2**32" >nul 2>nul
if errorlevel 1 (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Python 3.11 64-bit ve winget bulunamadi. README'deki elle Python kurulum adimini uygula.
    pause
    exit /b 1
  )
  echo Python 3.11 64-bit winget ile kuruluyor...
  winget install --id Python.Python.3.11 --exact --source winget --scope user --architecture x64 --accept-source-agreements --accept-package-agreements
  if errorlevel 1 goto python_failed
  py -3.11 -c "import sys; assert sys.maxsize > 2**32" >nul 2>nul
  if errorlevel 1 goto python_failed
)
if not exist ".venv\Scripts\python.exe" (
  py -3.11 -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -c "import imageio_ffmpeg,pathlib,shutil,sys; shutil.copyfile(imageio_ffmpeg.get_ffmpeg_exe(), pathlib.Path(sys.executable).with_name('ffmpeg.exe'))"
if errorlevel 1 goto failed
".venv\Scripts\ffmpeg.exe" -version >nul 2>nul
if errorlevel 1 goto failed
".venv\Scripts\python.exe" -m demucs --help >nul
if errorlevel 1 goto failed
".venv\Scripts\python.exe" sahne_worker.py configure
if errorlevel 1 (
  echo Ayarlar kaydedilmedi. configure.cmd dosyasini tekrar acabilirsin.
  pause
  exit /b 1
)
start "" ".venv\Scripts\pythonw.exe" "%~dp0sahne_worker.py"
echo Kurulum tamamlandi. Sahne simgesi bildirim alaninda gorunecek.
pause
exit /b 0
:failed
echo Kurulum tamamlanamadi. Hata satirlarini kontrol et.
pause
exit /b 1
:python_failed
echo Python kurulumu dogrulanamadi. README'deki elle kurulum adimini uygula ve install.cmd dosyasini yeniden ac.
pause
exit /b 1
