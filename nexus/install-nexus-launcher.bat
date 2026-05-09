@echo off
:: ═══════════════════════════════════════════════════════════════
:: NEXUS Launcher — Installateur Windows (Task Scheduler)
:: Lance launcher.py automatiquement à chaque session Windows
:: ═══════════════════════════════════════════════════════════════
setlocal EnableDelayedExpansion

set "TASK_NAME=NexusLauncher"
set "LAUNCHER_PY=%~dp0launcher.py"
set "LOG=%~dp0install.log"

echo.
echo  ██████████████████████████████████████████████████████████
echo  ██   NEXUS Launcher — Installation Windows               ██
echo  ██   Fik Conciergerie Oran                               ██
echo  ██████████████████████████████████████████████████████████
echo.

:: ── Vérifier droits administrateur ──────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERREUR] Ce script necessite les droits administrateur.
    echo Clic droit sur install-nexus-launcher.bat → "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

echo [INFO] Droits administrateur confirmés.
echo.

:: ── Trouver pythonw.exe ──────────────────────────────────────────
set "PYTHONW="

for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\pythonw.exe"
    "C:\Python313\pythonw.exe"
    "C:\Python312\pythonw.exe"
    "C:\Python311\pythonw.exe"
    "C:\Python310\pythonw.exe"
) do (
    if exist "%%~P" (
        set "PYTHONW=%%~P"
        goto :found_python
    )
)

:: Fallback: chercher dans PATH
where pythonw >nul 2>&1
if %errorLevel% EQU 0 (
    for /f "tokens=*" %%i in ('where pythonw') do set "PYTHONW=%%i" & goto :found_python
)

echo [ERREUR] pythonw.exe introuvable. Installe Python depuis python.org
pause
exit /b 1

:found_python
echo [INFO] Python trouve: %PYTHONW%
echo.

:: ── Vérifier que launcher.py existe ─────────────────────────────
if not exist "%LAUNCHER_PY%" (
    echo [ERREUR] launcher.py introuvable: %LAUNCHER_PY%
    pause
    exit /b 1
)
echo [INFO] launcher.py trouve: %LAUNCHER_PY%
echo.

:: ── Vérifier .env ────────────────────────────────────────────────
if not exist "%~dp0.env" (
    echo [AVERTISSEMENT] .env introuvable dans %~dp0
    echo Le Launcher ne demarrera pas sans PC_AGENT_TOKEN dans .env
    echo.
)

:: ── Supprimer ancienne tâche si elle existe ──────────────────────
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo [INFO] Suppression ancienne tache...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul
)

:: ── Créer la tâche Task Scheduler ────────────────────────────────
echo [INFO] Creation de la tache planifiee "%TASK_NAME%"...

schtasks /Create ^
    /TN "%TASK_NAME%" ^
    /TR "\"%PYTHONW%\" \"%LAUNCHER_PY%\"" ^
    /SC ONLOGON ^
    /RL HIGHEST ^
    /DELAY 0002:00 ^
    /F

if %errorLevel% NEQ 0 (
    echo [ERREUR] Impossible de creer la tache. Verifier les droits admin.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] Tache "%TASK_NAME%" creee.
echo.

:: ── Démarrer immédiatement ───────────────────────────────────────
echo [INFO] Demarrage immediat du Launcher...
schtasks /Run /TN "%TASK_NAME%"

if %errorLevel% EQU 0 (
    echo [SUCCESS] Nexus Launcher demarre en arriere-plan!
) else (
    echo [AVERTISSEMENT] Demarrage immediat echoue — le Launcher demarrera au prochain login.
)

echo.
echo ══════════════════════════════════════════════════════════════
echo  INSTALLATION TERMINEE
echo.
echo  - Le Launcher demarrera automatiquement a chaque connexion Windows
echo  - Logs: %~dp0launcher.log
echo  - Pour verifier: schtasks /Query /TN "%TASK_NAME%"
echo  - Pour desinstaller: uninstall-nexus-launcher.bat
echo ══════════════════════════════════════════════════════════════
echo.
pause
