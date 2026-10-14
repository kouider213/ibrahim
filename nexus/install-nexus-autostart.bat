@echo off
:: NEXUS — démarrage automatique avec Windows (interface plein écran)
:: Crée un raccourci dans le dossier Démarrage : pas besoin d'être administrateur.
:: Désinstaller : supprimer NexusAutoStart.lnk dans  shell:startup
setlocal
set "NEXUS_DIR=%~dp0"
set "PYW="

for %%P in (
    "%LOCALAPPDATA%\Python\pythoncore-3.14-64\pythonw.exe"
    "%LOCALAPPDATA%\Python\pythoncore-3.13-64\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe"
) do (
    if not defined PYW if exist "%%~P" set "PYW=%%~P"
)
if not defined PYW (
    for /f "delims=" %%i in ('where pythonw 2^>nul') do if not defined PYW set "PYW=%%i"
)
if not defined PYW (
    echo [ERREUR] pythonw.exe introuvable. Installe Python depuis python.org
    pause & exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\NexusAutoStart.lnk');" ^
  "$s.TargetPath='%PYW%'; $s.Arguments='\"%NEXUS_DIR%nexus_watchdog.py\"'; $s.WorkingDirectory='%NEXUS_DIR%';" ^
  "$s.WindowStyle=7; $s.Description='Nexus - demarrage auto plein ecran'; $s.Save()"

if errorlevel 1 ( echo [ERREUR] Creation du raccourci echouee. & pause & exit /b 1 )
echo [OK] Nexus s'ouvrira en plein ecran a chaque demarrage de Windows.
echo      Python : %PYW%
pause
