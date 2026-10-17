"""Au démarrage du PC : récupère le dernier APK Dzaryx construit sur GitHub.

Le serveur donne un lien privé signé (POST /api/nexus/apk-check) et envoie lui-même l'APK sur Telegram
(une seule fois par build). Ici on le range dans Téléchargements\\Dzaryx, une seule fois par build aussi.
"""
import json
import logging
import os
from pathlib import Path

import aiohttp

log = logging.getLogger('nexus.apk')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
STATE = Path(__file__).resolve().parent.parent / 'logs' / 'apk_state.json'
DEST = Path.home() / 'Downloads' / 'Dzaryx'


def _last_run() -> int:
    try:
        return int(json.loads(STATE.read_text(encoding='utf-8')).get('run', 0))
    except Exception:
        return 0


async def fetch_latest_apk() -> str | None:
    """Renvoie une phrase pour le journal si un nouvel APK a été rangé sur le PC, sinon None."""
    token = os.environ.get('PC_AGENT_TOKEN', '')
    if not token:
        return None
    async with aiohttp.ClientSession(headers={'Authorization': f'Bearer {token}'}) as s:
        async with s.post(f'{BACKEND_URL}/api/nexus/apk-check', timeout=aiohttp.ClientTimeout(total=240)) as r:
            info = await r.json(content_type=None)
        if not info.get('ok'):
            log.warning('APK : %s', info.get('error'))
            return None
        run, name = int(info['run']), info['name']
        if run <= _last_run():
            return None
        DEST.mkdir(parents=True, exist_ok=True)
        path = DEST / name
        tmp = path.with_suffix('.part')
        async with s.get(info['url'], timeout=aiohttp.ClientTimeout(total=600)) as r:
            r.raise_for_status()
            with open(tmp, 'wb') as f:
                async for chunk in r.content.iter_chunked(1 << 16):
                    f.write(chunk)
        tmp.replace(path)
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({'run': run, 'file': str(path)}), encoding='utf-8')
    log.info('APK rangé : %s', path)
    version = f" v{info['version']}" if info.get('version') else ''
    return f'📱 Nouvelle app Dzaryx{version} (build {run}) rangée dans Téléchargements\\Dzaryx — envoyée aussi sur Telegram'
