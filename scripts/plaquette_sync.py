#!/usr/bin/env python3
"""Plaquettes « Entreprises » du site toujours à jour avec l'admin (Kouider 2026-10-19).

Toutes les 10 min (cron VPS) : lit Admin › Paramètres (site_settings : WhatsApp, numéro algérien, e-mail,
adresse, RC, NIF). Si une valeur a changé (ou le modèle build.py), refait les 2 PDF avec Chrome dans un
clone dédié du site, les publie (push → Vercel) et prévient Kouider sur Telegram.
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ENV = HERE.parent / '.env'
CLONE = pathlib.Path('/root/fik-site-plaquette')
STATE = pathlib.Path('/root/.fik-plaquette-state')
OUTBOX = HERE.parent / 'tgcall' / 'outbox'
REMOTE = 'github-site:kouider213/autolux-location'
PDFS = ['public/plaquette-fik-entreprises-fr.pdf', 'public/plaquette-fik-entreprises-en.pdf']


def env() -> dict:
    out = {}
    for line in ENV.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"\'')
    return out


def settings(e: dict) -> dict:
    url = f"{e['SUPABASE_URL']}/rest/v1/site_settings?id=eq.1&select=whatsapp,phone,email,address,content"
    req = urllib.request.Request(url, headers={'apikey': e['SUPABASE_SERVICE_KEY'], 'Authorization': f"Bearer {e['SUPABASE_SERVICE_KEY']}"})
    row = json.loads(urllib.request.urlopen(req, timeout=20).read())[0]
    content = row.get('content') or {}
    return {'whatsapp': row.get('whatsapp') or '', 'phone': (row.get('phone') or '').strip(), 'email': row.get('email') or '',
            'address': row.get('address') or '', 'rc': (content.get('rc') or '').strip(), 'nif': (content.get('nif') or '').strip()}


def git(*args: str) -> str:
    return subprocess.run(['git', '-C', str(CLONE), *args], check=True, capture_output=True, text=True).stdout


def main() -> None:
    s = settings(env())
    if not CLONE.exists():
        subprocess.run(['git', 'clone', '-q', REMOTE, str(CLONE)], check=True)
    git('fetch', '-q', 'origin')
    git('reset', '-q', '--hard', 'origin/main')
    model = (CLONE / 'docs/plaquette-entreprises/build.py').read_bytes()
    key = hashlib.sha256(json.dumps(s, sort_keys=True).encode() + model).hexdigest()
    if STATE.exists() and STATE.read_text().strip() == key and '--force' not in sys.argv:
        return
    subprocess.run([sys.executable, 'docs/plaquette-entreprises/build.py'], cwd=CLONE, check=True,
                   env={**os.environ, 'FIK_SETTINGS': json.dumps(s)}, capture_output=True)
    if git('status', '--porcelain', *PDFS).strip():
        git('add', *PDFS)
        git('-c', 'user.name=Dzaryx', '-c', 'user.email=contact@fikconciergerie.com', 'commit', '-q', '-m',
            'plaquettes entreprises: coordonnées mises à jour depuis Admin › Paramètres (automatique)')
        git('push', '-q', 'origin', 'HEAD:main')
        changed = [x for x in (s['phone'] and f"📞 {s['phone']}", s['rc'] and f"RC {s['rc']}", s['nif'] and f"NIF {s['nif']}") if x]
        if '--silent' in sys.argv:
            print('publié (sans message)')
        else:
            OUTBOX.mkdir(exist_ok=True)
            (OUTBOX / f'{int(time.time() * 1000)}-plaquette.txt').write_text(
                '📄 Plaquettes « Entreprises » du site refaites automatiquement avec tes coordonnées de l\'admin'
                + (f' ({", ".join(changed)})' if changed else '') + '. En ligne dans ~2 min sur fikconciergerie.com/entreprises.',
                encoding='utf-8')
    STATE.write_text(key)
    print('plaquettes à jour', time.strftime('%F %T'))


if __name__ == '__main__':
    main()
