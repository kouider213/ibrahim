@echo off
:: ═══════════════════════════════════════════════════════════════
:: NEXUS Launcher — Désinstallateur Windows
:: ═══════════════════════════════════════════════════════════════
setlocal

set "TASK_NAME=NexusLauncher"

echo.
echo  NEXUS Launcher — Desinstallation
echo.

:: ── Vérifier droits administrateur ──────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERREUR] Droits administrateur requis.
    echo Clic droit → "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

:: ── Arrêter la tâche si en cours ────────────────────────────────
echo [INFO] Arret du Launcher en cours d'execution...
schtasks /End /TN "%TASK_NAME%" >nul 2>&1

:: ── Tuer les processus pythonw launcher.py ───────────────────────
echo [INFO] Arret des processus launcher.py...
taskkill /F /FI "WINDOWTITLE eq launcher*" >nul 2>&1
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq pythonw.exe" /NH 2^>nul') do (
    taskkill /F /PID %%i >nul 2>&1
)

:: ── Supprimer la tâche planifiée ─────────────────────────────────
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if %errorLevel% EQU 0 (
    schtasks /Delete /TN "%TASK_NAME%" /F
    echo [SUCCESS] Tache "%TASK_NAME%" supprimee.
) else (
    echo [INFO] Tache "%TASK_NAME%" n'existait pas.
)

echo.
echo  Desinstallation terminee. Le Launcher ne demarrera plus automatiquement.
echo.
pause
