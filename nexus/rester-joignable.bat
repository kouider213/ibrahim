@echo off
chcp 65001 >nul
REM ── NEXUS : garder le PC joignable quand Kouider est loin (Algérie) ─────────────────────────────
REM Sur SECTEUR uniquement (sur batterie, rien ne change) :
REM   - jamais de veille ni d'hibernation
REM   - rabattre l'écran ne met PAS le PC en veille
REM   - l'écran s'éteint après 10 min (économie, le PC reste allumé)
REM   - minuteurs de réveil autorisés (réveil programmé par Nexus)
REM   - réveil par le réseau (Wake-on-LAN) activé sur les cartes réseau qui le permettent
REM Pour annuler : panneau de configuration → Options d'alimentation → « Rétablir les paramètres par défaut ».
REM À faire en plus, une fois, dans le BIOS : « Restore on AC power loss » = ON (le PC se rallume après une coupure de courant).

net session >nul 2>&1
if errorlevel 1 (
    echo Autorisation administrateur demandee...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo [1/4] Veille et hibernation coupees sur secteur...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 10

echo [2/4] Ecran rabattu = rien (sur secteur)...
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1
powercfg /setactive SCHEME_CURRENT

echo [3/4] Reveil par le reseau (Wake-on-LAN)...
powershell -NoProfile -Command "Get-NetAdapter -Physical | ForEach-Object { try { Set-NetAdapterPowerManagement -Name $_.Name -WakeOnMagicPacket Enabled -ErrorAction Stop; Write-Host ('   OK  ' + $_.Name) } catch { Write-Host ('   --  ' + $_.Name + ' (pas pris en charge)') } }"

echo [4/4] Verification...
powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION | findstr /i "AC Power Setting"
echo.
echo Termine. Laisse le PC branche sur secteur, ecran rabattu si tu veux : Nexus reste joignable.
echo ATTENTION : si Windows redemarre (mise a jour), Nexus ne revient qu'apres ta connexion a la session.
echo Pour qu'il revienne seul : connexion automatique (Sysinternals Autologon), a decider avec Claude Code.
timeout /t 15
