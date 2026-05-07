"""
NEXUS Vision Module
- capture_once(): prend une photo + Claude Vision la décrit
- start_live() / stop_live(): stream caméra → GUI WebSocket en temps réel (~5 fps)
"""
import asyncio
import base64
import logging
import os
import threading
import time

log = logging.getLogger('nexus.vision')

VISION_SYSTEM = (
    "Tu es NEXUS, l'assistant IA de Kouider (Fik Conciergerie Oran). "
    "Tu regardes à travers la caméra du PC. Décris ce que tu vois de façon naturelle, "
    "directe et personnelle — comme si tu lui parlais en face. Sois bref (2-3 phrases max). "
    "Si tu vois Kouider, adresse-toi à lui directement. Parle en français."
)


class VisionModule:
    def __init__(self, app) -> None:
        self.app = app
        self._live = False
        self._thread: threading.Thread | None = None
        self._client = None
        self._setup_claude()

    def _setup_claude(self) -> None:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        if not api_key:
            log.warning('ANTHROPIC_API_KEY manquant — vision désactivée')
            return
        try:
            import anthropic
            self._client = anthropic.Anthropic(api_key=api_key)
            log.info('Claude Vision ready')
        except ImportError:
            log.warning('anthropic not installed')

    # ── Capture unique + analyse ─────────────────────────────────────────────

    async def capture_and_describe(self, prompt: str = '') -> str:
        """Prend une photo, l'envoie à Claude Vision, retourne la description."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._sync_capture_describe, prompt)

    def _sync_capture_describe(self, prompt: str = '') -> str:
        try:
            import cv2
        except ImportError:
            return "opencv-python non installé — pip install opencv-python"

        if not self._client:
            return "Claude Vision non disponible (ANTHROPIC_API_KEY manquant)"

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return "Impossible d'accéder à la caméra"

        # Laisse la caméra s'initialiser
        for _ in range(5):
            cap.read()
        ret, frame = cap.read()
        cap.release()

        if not ret:
            return "Erreur de capture caméra"

        _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        img_b64 = base64.b64encode(buf).decode()

        user_text = prompt if prompt else "Décris ce que tu vois."

        try:
            import anthropic
            resp = self._client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=400,
                system=VISION_SYSTEM,
                messages=[{
                    'role': 'user',
                    'content': [
                        {
                            'type':   'image',
                            'source': {
                                'type':       'base64',
                                'media_type': 'image/jpeg',
                                'data':       img_b64,
                            },
                        },
                        {'type': 'text', 'text': user_text},
                    ],
                }],
            )
            return resp.content[0].text.strip()
        except Exception as e:
            log.error('Vision API error: %s', e)
            return f'Erreur vision: {e}'

    # ── Flux live → GUI ──────────────────────────────────────────────────────

    def start_live(self) -> str:
        if self._live:
            return "Caméra déjà active"
        self._live = True
        self._thread = threading.Thread(target=self._live_loop, daemon=True)
        self._thread.start()
        return "✅ Caméra activée"

    def stop_live(self) -> str:
        self._live = False
        return "✅ Caméra désactivée"

    def is_live(self) -> bool:
        return self._live

    def _live_loop(self) -> None:
        try:
            import cv2
        except ImportError:
            log.error('opencv-python non installé')
            self._live = False
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            log.error('Caméra inaccessible')
            self._live = False
            return

        log.info('Live camera started')
        while self._live:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.1)
                continue

            # Resize for bandwidth
            h, w = frame.shape[:2]
            if w > 640:
                scale = 640 / w
                frame = cv2.resize(frame, (640, int(h * scale)))

            _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            b64 = base64.b64encode(buf).decode()

            if self.app.loop:
                asyncio.run_coroutine_threadsafe(
                    self.app.gui_send({'type': 'camera_frame', 'data': b64}),
                    self.app.loop,
                )
            time.sleep(0.2)  # ~5fps

        cap.release()
        if self.app.loop:
            asyncio.run_coroutine_threadsafe(
                self.app.gui_send({'type': 'camera_frame', 'data': None}),
                self.app.loop,
            )
        log.info('Live camera stopped')
