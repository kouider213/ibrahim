#!/usr/bin/env python3
"""Surveillance VPS du backend Railway (cron, chaque minute).

Railway peut appeler Kouider pour ses propres pannes, sauf s'il est complètement tombé : ce script le fait
à sa place. 3 échecs de suite (~3 min) → message Telegram + appel d'alarme (via tgcall/outbox, sans le backend).
Retour à la normale → message « rétabli ». Rappel si toujours en panne au bout de 2 h.
Test sans rien envoyer : watchdog.py --dry-run [--url URL]
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUTBOX = HERE / 'outbox'
STATE = HERE / '.watchdog.json'
FAILS_BEFORE_ALERT = 3
REMIND_S = 2 * 3600


def backend_url() -> str:
    for line in (HERE / '.env').read_text().splitlines():
        if line.startswith('BACKEND_URL='):
            return line.split('=', 1)[1].strip().strip('"\'').rstrip('/')
    raise SystemExit('BACKEND_URL absent de tgcall/.env')


def check(url: str) -> str | None:
    """None si le backend répond, sinon la raison."""
    try:
        with urllib.request.urlopen(f'{url}/health', timeout=15) as r:
            if json.load(r).get('status') == 'ok':
                return None
            return 'statut anormal'
    except Exception as e:
        return str(e)[:150]


def drop(name: str, text: str, dry: bool) -> None:
    """Écrit d'abord ailleurs puis déplace : tgcall ne lit jamais un fichier à moitié écrit."""
    if dry:
        print(f'[dry-run] {name}: {text!r}')
        return
    OUTBOX.mkdir(exist_ok=True)
    tmp = HERE / f'.{name}.tmp'
    tmp.write_text(text, encoding='utf-8')
    os.replace(tmp, OUTBOX / name)


def main() -> None:
    dry = '--dry-run' in sys.argv
    url = sys.argv[sys.argv.index('--url') + 1] if '--url' in sys.argv else backend_url()
    try:
        st = json.loads(STATE.read_text())
    except Exception:
        st = {'fails': 0, 'down_since': None, 'alerted_at': None}
    now = time.time()
    err = check(url)
    stamp = time.strftime('%Y%m%d-%H%M%S')

    if err is None:
        if st.get('alerted_at'):
            mins = int((now - st['down_since']) / 60)
            drop(f'{stamp}-watchdog-ok.txt', f'✅ Le serveur Dzaryx répond de nouveau (panne d\'environ {mins} min).', dry)
        st = {'fails': 0, 'down_since': None, 'alerted_at': None}
    else:
        st['fails'] = st.get('fails', 0) + 1
        st['down_since'] = st.get('down_since') or now
        due = st['fails'] >= FAILS_BEFORE_ALERT and (
            not st.get('alerted_at') or now - st['alerted_at'] >= REMIND_S)
        if due:
            mins = max(1, int((now - st['down_since']) / 60))
            drop(f'{stamp}-watchdog.txt',
                 f'🚨 SERVEUR DZARYX EN PANNE\nRailway ne répond plus depuis {mins} min.\nErreur : {err}\n\n'
                 'L\'app et les réponses aux clients sont coupées. Vérifie Railway (railway.app → Deployments).', dry)
            drop(f'{stamp}-watchdog.call', '', dry)
            st['alerted_at'] = now
        if dry:
            print(f'[dry-run] échec {st["fails"]}: {err}')
    if not dry:
        STATE.write_text(json.dumps(st))


if __name__ == '__main__':
    main()
