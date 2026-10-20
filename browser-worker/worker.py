"""
Navigateur du SERVEUR pour Dzaryx (idée reprise de Hermes Agent « bot screen ») — tourne sur le VPS (pm2
« dzaryx-browser »), donc marche même quand le PC de Kouider est éteint.

- Prend les tâches sur le backend (POST /api/browser/next, token de l'agent PC), les fait avec le même agent
  navigateur que Nexus (nexus/modules/browser_agent.py : Chromium sans écran, profil gardé dans
  browser-worker/profile, pause avant toute action irréversible, jamais de mot de passe ni de carte).
- Quand l'agent a besoin de Kouider (connexion, code, captcha, accord) : question → backend (notif app) +
  capture d'écran déposée dans tgcall/outbox/ → le service Telegram de Dzaryx la lui envoie.
- Kouider répond à Dzaryx (« continue », « le code est … ») → browser_reply → reprise ici.

Lancement : pm2 start browser-worker/worker.py --name dzaryx-browser --interpreter browser-worker/.venv/bin/python
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

import aiohttp

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'nexus'))


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(ROOT / '.env')
os.environ.setdefault('NEXUS_BROWSER_HEADLESS', '1')

import modules.browser_agent as ba  # noqa: E402  (après le chargement du .env)

ba.PROFILE_DIR = Path(__file__).resolve().parent / 'profile'
ba.DOWNLOADS = Path(__file__).resolve().parent / 'downloads'
ba.MAX_STEPS = max(ba.MAX_STEPS, 45)   # recherche Air Algérie sur tout un mois = ~5 grilles à lire
ba.DOWNLOADS.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [browser-worker] %(message)s')
log = logging.getLogger('browser-worker')

# Le .env racine pointe sur le backend local du VPS : on vise le backend de production (comme tgcall)
BACKEND = os.environ.get('BROWSER_BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
TOKEN = os.environ.get('PC_AGENT_TOKEN', '')
OUTBOX = ROOT / 'tgcall' / 'outbox'
POLL_S = 4


async def post(http: aiohttp.ClientSession, path: str, body: dict) -> dict:
    async with http.post(f'{BACKEND}{path}', json=body, headers={'Authorization': f'Bearer {TOKEN}'},
                         timeout=aiohttp.ClientTimeout(total=30)) as r:
        r.raise_for_status()
        return await r.json()


def screenshot_to_outbox(agent: 'ba.BrowserAgent', job_id: str, caption: str) -> None:
    """Capture de la page (dans le thread Playwright de l'agent) → tgcall/outbox → Telegram de Kouider."""
    OUTBOX.mkdir(exist_ok=True)
    try:
        png = agent._pool.submit(lambda: agent._page.screenshot(type='jpeg', quality=70)).result(timeout=20)
        (OUTBOX / f'browser-{job_id}.jpg').write_bytes(png)
    except Exception as e:
        log.warning('capture impossible : %s', e)
    (OUTBOX / f'browser-{job_id}.txt').write_text(caption[:1000], encoding='utf-8')


FLIGHT_TASK = 'RECHERCHE DE VOL AIR ALGÉRIE'
_CLIP_JS = """() => { const f = document.querySelector('footer.footerIbe, footer.layout-footer');
  const h = f ? f.getBoundingClientRect().top + scrollY : innerHeight;
  return {x: 0, y: 0, width: innerWidth, height: Math.max(300, Math.min(h, innerHeight, 4000))}; }"""


def flight_result_to_outbox(agent: 'ba.BrowserAgent', job_id: str, result: str) -> None:
    """Recherche de vol finie → Telegram aussi : photo de la page Air Algérie (sans le pied de page) + le texte complet."""
    OUTBOX.mkdir(exist_ok=True)
    if result.startswith(("J'arrête", "J'ai atteint")):
        # Recherche ratée : pas de capture « je te propose », juste le message
        (OUTBOX / f'browser-{job_id}-b.txt').write_text('✈️ Recherche Air Algérie pas aboutie : ' + result[:3900], encoding='utf-8')
        return
    def shot() -> bytes:
        page = agent._page
        page.bring_to_front()
        return page.screenshot(type='jpeg', quality=75, clip=page.evaluate(_CLIP_JS), timeout=20000)
    try:
        (OUTBOX / f'browser-{job_id}-a.jpg').write_bytes(agent._pool.submit(shot).result(timeout=30))
        (OUTBOX / f'browser-{job_id}-a.txt').write_text("✈️ Ce que je te propose — capture du site Air Algérie (le détail suit).", encoding='utf-8')
    except Exception as e:
        log.warning('capture vol impossible : %s', e)
    (OUTBOX / f'browser-{job_id}-b.txt').write_text(result[:4000], encoding='utf-8')


async def handle(http: aiohttp.ClientSession, agent: 'ba.BrowserAgent', job: dict) -> None:
    jid, task = job['id'], job['task']
    try:
        if job['status'] == 'answered':
            if agent.has_pending():
                log.info('reprise %s avec « %s »', jid, job.get('answer'))
                result = await agent.resume(job.get('answer') or 'continue')
            else:   # service redémarré entre-temps : on relance avec la réponse
                result = await agent.run(f"{task}\n\nRéponse de Kouider à ta question précédente : {job.get('answer')}")
        else:
            log.info('tâche %s : %s', jid, task[:100])
            result = await agent.run(task)
        if agent.has_pending():
            await post(http, '/api/browser/update', {'id': jid, 'status': 'waiting', 'text': result})
            screenshot_to_outbox(agent, jid, f'🌐 Navigateur — {task[:120]}\n\n{result}\n\nRéponds-moi : « continue », « le code est … », « clique sur … » ou « annule ».')
        else:
            await post(http, '/api/browser/update', {'id': jid, 'status': 'done', 'text': result})
            if task.startswith(FLIGHT_TASK):
                flight_result_to_outbox(agent, jid, result)
    except Exception as e:
        log.exception('tâche %s', jid)
        await post(http, '/api/browser/update', {'id': jid, 'status': 'error', 'text': f'Erreur : {e}'})


async def main() -> None:
    if not TOKEN:
        log.error('PC_AGENT_TOKEN manquant dans .env')
        return
    agent = ba.BrowserAgent()
    log.info('prêt — %s', BACKEND)
    async with aiohttp.ClientSession() as http:
        while True:
            try:
                job = (await post(http, '/api/browser/next', {})).get('job')
                if job:
                    await handle(http, agent, job)
                    continue
            except Exception as e:
                log.warning('backend : %s', e)
            await asyncio.sleep(POLL_S)


if __name__ == '__main__':
    asyncio.run(main())
