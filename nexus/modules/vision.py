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

SCREEN_SYSTEM = (
    "Tu es NEXUS, l'assistant IA de Kouider (Fik Conciergerie Oran). "
    "Tu vois une capture de son écran Windows. Décris ou analyse ce que tu vois selon la question posée. "
    "Sois précis, concis. Parle en français. Si c'est du code, identifie le fichier et le problème."
)


class VisionModule:
    def __init__(self, app) -> None:
        self.app = app
        self._live        = False   # stream → GUI WebSocket (app mobile)
        self._live_window = False   # stream → fenêtre Windows cv2
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
        loop = asyncio.get_running_loop()
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

    # ── Desktop screen capture + describe ───────────────────────────────────

    async def describe_screen(self, prompt: str = '') -> str:
        """Capture l'écran Windows (pas la webcam) et envoie à Claude Vision."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_screen_describe, prompt)

    def _sync_screen_describe(self, prompt: str = '') -> str:
        if not self._client:
            return "Claude Vision non disponible (ANTHROPIC_API_KEY manquant)"
        try:
            import mss
            import mss.tools
        except ImportError:
            return "mss non installé — pip install mss"

        try:
            with mss.mss() as sct:
                monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                shot    = sct.grab(monitor)
                # Encode PNG in memory via raw bytes then re-encode as JPEG for Claude
                import io
                png_bytes = mss.tools.to_png(shot.rgb, shot.size)
                img_b64 = base64.b64encode(png_bytes).decode()
                mime_type = 'image/png'
        except Exception as e:
            log.error('Screen capture error: %s', e)
            return f'Erreur capture écran: {e}'

        user_text = prompt if prompt else "Décris ce que tu vois sur cet écran."
        try:
            import anthropic
            resp = self._client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=600,
                system=SCREEN_SYSTEM,
                messages=[{
                    'role': 'user',
                    'content': [
                        {
                            'type':   'image',
                            'source': {
                                'type':       'base64',
                                'media_type': mime_type,
                                'data':       img_b64,
                            },
                        },
                        {'type': 'text', 'text': user_text},
                    ],
                }],
            )
            return resp.content[0].text.strip()
        except Exception as e:
            log.error('Screen Vision API error: %s', e)
            return f'Erreur vision écran: {e}'

    # ── Flux live — thread unique, deux sorties possibles ───────────────────
    #   _live        = True → envoie frames à l'app mobile via GUI WebSocket
    #   _live_window = True → affiche fenêtre Windows cv2 sur le bureau PC
    #   Les deux peuvent être True simultanément (une seule capture caméra)

    def start_live(self) -> str:
        """Active le stream vers l'app mobile (GUI WebSocket)."""
        self._live = True
        self._ensure_capture_thread()
        return "✅ Caméra activée (stream app)"

    def start_live_window(self) -> str:
        """Ouvre une fenêtre Windows avec le flux caméra en direct sur le PC."""
        self._live_window = True
        self._ensure_capture_thread()
        return "✅ Fenêtre live ouverte sur le PC"

    def stop_live(self) -> str:
        self._live = False
        if not self._live_window:
            log.info('Caméra arrêtée (plus aucun output actif)')
        return "✅ Stream app désactivé"

    def stop_live_window(self) -> str:
        self._live_window = False
        return "✅ Fenêtre caméra fermée"

    def stop_all_live(self) -> str:
        self._live = False
        self._live_window = False
        return "✅ Caméra désactivée"

    def is_live(self) -> bool:
        return self._live or self._live_window

    def _ensure_capture_thread(self) -> None:
        """Démarre le thread de capture s'il n'est pas déjà actif."""
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def _capture_loop(self) -> None:
        """Thread unique : capture la caméra et alimente toutes les sorties actives."""
        try:
            import cv2
        except ImportError:
            log.error('opencv-python non installé')
            self._live = self._live_window = False
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            log.error('Caméra inaccessible')
            self._live = self._live_window = False
            return

        log.info('Capture caméra démarrée (live=%s, window=%s)', self._live, self._live_window)
        WIN = 'NEXUS — Live Caméra'
        window_open = False

        while self._live or self._live_window:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue

            # ── Sortie 1 : GUI WebSocket (app mobile, ~5 fps) ────────────────
            if self._live:
                h, w = frame.shape[:2]
                small = frame
                if w > 640:
                    small = cv2.resize(frame, (640, int(h * 640 / w)))
                _, buf = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 70])
                b64 = base64.b64encode(buf).decode()
                if self.app.loop:
                    asyncio.run_coroutine_threadsafe(
                        self.app.gui_send({'type': 'camera_frame', 'data': b64}),
                        self.app.loop,
                    )

            # ── Sortie 2 : fenêtre Windows cv2 (~30 fps) ─────────────────────
            if self._live_window:
                if not window_open:
                    cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
                    cv2.resizeWindow(WIN, 800, 600)
                    window_open = True
                cv2.imshow(WIN, frame)
                key = cv2.waitKey(1) & 0xFF
                # Fermeture si q pressé ou fenêtre fermée manuellement
                try:
                    if key == ord('q') or cv2.getWindowProperty(WIN, cv2.WND_PROP_VISIBLE) < 1:
                        self._live_window = False
                except Exception:
                    self._live_window = False
            elif window_open:
                # _live_window vient d'être mis à False → ferme la fenêtre
                try:
                    cv2.destroyWindow(WIN)
                except Exception:
                    pass
                window_open = False

            time.sleep(0.033)  # ~30 fps max

        # Nettoyage
        cap.release()
        if window_open:
            try:
                cv2.destroyWindow(WIN)
            except Exception:
                pass
        if self.app.loop:
            asyncio.run_coroutine_threadsafe(
                self.app.gui_send({'type': 'camera_frame', 'data': None}),
                self.app.loop,
            )
        log.info('Capture caméra arrêtée')
