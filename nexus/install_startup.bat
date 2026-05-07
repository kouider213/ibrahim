@echo off
title NEXUS — Installation démarrage automatique
cd /d "%~dp0"

echo.
echo  Installation de NEXUS au demarrage Windows...
echo.

REM Chemin complet vers start.bat
set NEXUS_DIR=%~dp0
set NEXUS_BAT=%NEXUS_DIR%start.bat

REM Nom de la tache planifiee
set TASK_NAME=NEXUS_FikConciergerie

REM Supprime l'ancienne tache si elle existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM Cree la tache : lance start.bat a la connexion, fenetre reduite
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "cmd.exe /c start /min \"\" \"%NEXUS_BAT%\"" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f ^
  /delay 0000:30

if errorlevel 1 (
    echo ERREUR: Impossible de creer la tache planifiee.
    echo Lance ce script en tant qu'administrateur.
    pause & exit /b 1
)

echo.
echo  OK — NEXUS demarrera automatiquement a chaque connexion Windows.
echo  Tache creee: %TASK_NAME%
echo.
echo  Pour desinstaller: schtasks /delete /tn "%TASK_NAME%" /f
echo.
pause
