@echo off
title NEXUS — Agent IA PC
cd /d "%~dp0"

echo.
echo  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
echo  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
echo  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
echo  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
echo  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
echo  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
echo  AGENT PC ^| FIK CONCIERGERIE ^| ORAN
echo.

REM Trouve Python (PATH ou chemins connus)
set PYTHON=python
python --version >nul 2>&1
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Python\bin\python.exe" (
        set PYTHON=%LOCALAPPDATA%\Python\bin\python.exe
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
        set PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
    ) else if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
        set PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
    ) else if exist "C:\Python311\python.exe" (
        set PYTHON=C:\Python311\python.exe
    ) else (
        echo ERREUR: Python non trouve. Installe Python 3.11+
        pause & exit /b 1
    )
)

REM Vérifie .env
if not exist ".env" (
    echo ERREUR: Fichier .env manquant.
    echo Copie .env.example → .env et remplis les valeurs.
    pause & exit /b 1
)

REM Installe les dépendances si nécessaire
if not exist ".deps_ok" (
    echo Installation des dependances...
    %PYTHON% -m pip install -r requirements.txt
    if errorlevel 1 ( echo ERREUR installation & pause & exit /b 1 )
    echo Installation pyaudio ^(optionnel - micro^)...
    %PYTHON% -m pip install pyaudio >nul 2>&1 || echo pyaudio non installe - micro desactive, tout le reste fonctionne.
    echo. > .deps_ok
    echo Dependances installees.
)

echo Lancement de NEXUS...
echo.
%PYTHON% nexus.py
pause
