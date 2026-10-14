#!/usr/bin/env bash
# PC cloud de Kouider : bureau virtuel toujours allumé sur le VPS (écran :50) avec un Chrome qui garde ses connexions.
# Vu et piloté depuis l'app (MON PC → « PC cloud ») via cloudpc/agent.py ; Dzaryx s'en sert aussi (browser-worker en CDP).
# pm2 : dzaryx-cloudpc-desktop. Chrome refermé ou planté → relancé tout seul.
set -u
export DISPLAY=:50
DATA=${CLOUDPC_DATA:-/root/cloudpc-data}
SIZE=${CLOUDPC_SIZE:-1366x768}
CHROME=${CLOUDPC_CHROME:-$(command -v google-chrome-stable || ls -d /root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)}
mkdir -p "$DATA/profile" "$DATA/downloads"

pkill -f "Xvfb :50" 2>/dev/null; sleep 0.5
Xvfb :50 -screen 0 "${SIZE}x24" -nolisten tcp -ac &
XPID=$!
for i in $(seq 1 50); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.2; done
xsetroot -solid '#0b1020' 2>/dev/null
openbox --sm-disable &
trap 'kill $XPID 2>/dev/null; pkill -P $$ 2>/dev/null' EXIT

while kill -0 $XPID 2>/dev/null; do
  "$CHROME" --user-data-dir="$DATA/profile" --remote-debugging-port=9223 --remote-debugging-address=127.0.0.1 \
    --no-first-run --no-default-browser-check --start-maximized --lang=fr-FR --accept-lang=fr-FR,fr,en --disable-dev-shm-usage \
    --password-store=basic --no-sandbox --disable-features=Translate --disable-session-crashed-bubble \
    "--window-size=${SIZE/x/,}" --window-position=0,0 https://www.google.com/ >>"$DATA/chrome.log" 2>&1
  echo "$(date -Is) Chrome fermé → relance dans 2 s" >>"$DATA/chrome.log"
  sleep 2
done
