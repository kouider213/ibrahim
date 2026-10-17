"""
Caméra du téléphone → Nexus.

- Les images arrivent du backend (nexus:phonecam_frame, 2-3/s) : widget « CAMÉRA TÉLÉPHONE » en direct sur l'écran Nexus.
- Nexus peut regarder ce que Kouider montre (dernière image + Claude vision) : lire un document, une plaque, un compteur,
  l'état d'une voiture, une pièce à identifier, un ticket à noter…
- « Prends une photo / filme 10 s » : Nexus envoie l'ordre à l'app (backend /api/nexus/data/phonecam-cmd), l'app capture en
  pleine qualité et renvoie le fichier (nexus:phonecam_media) qui est rangé dans Images/Dzaryx Caméra/<date>/.
- Retrouver plus tard : list_media → widget image/vidéo sur l'écran, ou renvoi sur Telegram.
"""
import base64
import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path

import aiohttp

log = logging.getLogger('nexus.phonecam')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
PC_TOKEN = os.environ.get('PC_AGENT_TOKEN', '')
MEDIA_ROOT = Path.home() / 'Pictures' / 'Dzaryx Caméra'
_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'video/webm': '.webm', 'video/mp4': '.mp4', 'video/quicktime': '.mov'}

LOOK_SYSTEM = (
    "Tu es NEXUS, l'assistant de Kouider (location de voitures à Oran). Tu vois à travers la caméra de son téléphone ce qu'il "
    "te montre. Réponds précisément à sa question en français, court et naturel (réponse lue à voix haute, pas de markdown). "
    "S'il y a du texte (document, plaque, ticket, facture, permis, compteur kilométrique), recopie les informations utiles "
    "exactement. Pour une voiture : signale rayures, chocs, pneus, voyants. Si l'image est floue ou ne montre pas ce qu'il faut, dis-le."
)


class PhoneCam:
    def __init__(self, app) -> None:
        self.app = app
        self.last_frame: str = ''
        self.last_at = 0.0
        self._last_gui = 0.0

    @property
    def live(self) -> bool:
        return time.time() - self.last_at < 8

    # ── Flux en direct ───────────────────────────────────────────────────────
    async def on_frame(self, data: dict) -> None:
        b64 = str(data.get('data') or '')
        if not b64:
            return
        first = not self.live
        self.last_frame, self.last_at = b64, time.time()
        if first:
            asyncio_create(self.app.speak('Je vois ta caméra.'))
        if time.time() - self._last_gui >= 0.25:          # l'écran n'a pas besoin de plus de 4 images/s
            self._last_gui = time.time()
            await self.app.gui_send({'type': 'phonecam_frame', 'data': b64})

    async def on_stop(self) -> None:
        self.last_at = 0
        await self.app.gui_send({'type': 'phonecam_stop'})

    # ── Photo / vidéo reçue de l'app → rangée sur le PC ─────────────────────
    async def on_media(self, data: dict) -> dict:
        kind = 'video' if data.get('kind') == 'video' else 'photo'
        raw = str(data.get('data') or '')
        if not raw:
            return {'ok': False, 'error': 'fichier vide'}
        try:
            blob = base64.b64decode(raw.split(',', 1)[-1])
        except Exception:
            return {'ok': False, 'error': 'fichier illisible'}
        mime = str(data.get('mime') or '').split(';')[0].strip().lower()
        ext = _EXT.get(mime, '.jpg' if kind == 'photo' else '.webm')
        label = re.sub(r'[^\w\- ]+', '', str(data.get('label') or ''), flags=re.UNICODE).strip()[:50].replace(' ', '_')
        folder = MEDIA_ROOT / datetime.now().strftime('%Y-%m-%d')
        folder.mkdir(parents=True, exist_ok=True)
        f = folder / f"{datetime.now().strftime('%H%M%S')}_{kind}{('_' + label) if label else ''}{ext}"
        f.write_bytes(blob)
        log.info('Caméra téléphone : %s enregistrée (%d Ko)', f, len(blob) // 1024)
        await self.app.show_widget({'title': f"{'Photo' if kind == 'photo' else 'Vidéo'} enregistrée", 'kind': 'image' if kind == 'photo' else 'video',
                                    'path': str(f), 'id': 'phonecam_last'})
        asyncio_create(self.app.speak(f"{'Photo' if kind == 'photo' else 'Vidéo'} rangée dans Dzaryx Caméra."))
        return {'ok': True, 'path': str(f)}

    # ── Ordres vers l'app (photo, vidéo, changer de caméra, arrêter) ────────
    async def command(self, cmd: str, secs: int = 10, label: str = '') -> str:
        if not PC_TOKEN:
            return 'PC_AGENT_TOKEN manquant dans nexus/.env'
        try:
            async with aiohttp.ClientSession() as s:
                async with s.post(f'{BACKEND_URL}/api/nexus/data/phonecam-cmd', json={'cmd': cmd, 'secs': secs, 'label': label},
                                  headers={'Authorization': f'Bearer {PC_TOKEN}'}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    d = await r.json(content_type=None)
                    if r.status >= 400:
                        return f"Erreur serveur : {(d or {}).get('error') or r.status}"
        except Exception as e:
            return f'Serveur injoignable : {e}'
        if not (self.live or d.get('live')):
            return ("La caméra du téléphone n'est pas ouverte : demande à Kouider d'ouvrir l'app Dzaryx → CAMÉRA → "
                    "« Montrer à Nexus ». L'ordre attend 30 secondes.")
        return {'photo': "Ordre envoyé : le téléphone prend la photo, elle arrive sur le PC dans quelques secondes.",
                'video': f'Ordre envoyé : le téléphone filme {secs} secondes, la vidéo arrive ensuite sur le PC.',
                'switch': 'Caméra du téléphone retournée.', 'stop': 'Caméra du téléphone arrêtée.'}.get(cmd, 'Ordre envoyé.')

    # ── Regarder ce que Kouider montre ──────────────────────────────────────
    def look(self, question: str) -> str:
        """Appelé depuis le fil de l'agent (synchrone)."""
        if not self.live or not self.last_frame:
            return "Je ne reçois pas la caméra du téléphone : ouvre l'app Dzaryx → CAMÉRA → « Montrer à Nexus »."
        client = getattr(self.app.vision, '_client', None)
        if not client:
            return 'ANTHROPIC_API_KEY manquant : vision indisponible.'
        try:
            r = client.messages.create(
                model=os.environ.get('NEXUS_AGENT_MODEL', 'claude-sonnet-5-5'), max_tokens=700, system=LOOK_SYSTEM,
                messages=[{'role': 'user', 'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': self.last_frame.split(',', 1)[-1]}},
                    {'type': 'text', 'text': question or 'Que vois-tu ?'}]}])
            return ''.join(b.text for b in r.content if getattr(b, 'type', '') == 'text').strip() or 'Rien de lisible.'
        except Exception as e:
            log.error('look error: %s', e)
            return f'Vision impossible : {e}'

    # ── Retrouver les photos / vidéos ───────────────────────────────────────
    @staticmethod
    def list_media(query: str = '', limit: int = 12) -> list[Path]:
        if not MEDIA_ROOT.exists():
            return []
        q = query.lower().strip()
        files = [f for f in MEDIA_ROOT.rglob('*') if f.is_file() and f.suffix.lower() in ('.jpg', '.png', '.webm', '.mp4', '.mov')]
        if q in ('photo', 'photos'):
            files = [f for f in files if '_photo' in f.name]
        elif q in ('video', 'vidéo', 'videos', 'vidéos'):
            files = [f for f in files if '_video' in f.name]
        elif q:
            files = [f for f in files if q.replace(' ', '_') in str(f).lower() or q in str(f).lower()]
        return sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)[:limit]


def asyncio_create(coro) -> None:
    import asyncio
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        coro.close()
