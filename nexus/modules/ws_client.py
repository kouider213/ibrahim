"""
NEXUS WebSocket Client
Connects to Dzaryx backend via Socket.IO /nexus namespace
Handles: AI messages, remote commands, WoL registration, Telegram journal
"""
import asyncio
import logging
import os
import uuid

log = logging.getLogger('nexus.ws')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
PC_TOKEN    = os.environ.get('PC_AGENT_TOKEN', '')
SESSION_ID  = 'nexus-kouider'


def _get_mac() -> str:
    node = uuid.getnode()
    return ':'.join(f'{(node >> i) & 0xff:02x}' for i in range(40, -1, -8))


class NexusWSClient:
    def __init__(self, app) -> None:
        self.app = app
        self._sio = None
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    async def run(self) -> None:
        """Connect forever with auto-reconnect."""
        try:
            import socketio
        except ImportError:
            log.error('python-socketio not installed → pip install "python-socketio[asyncio_client]"')
            return

        while True:
            self._sio = socketio.AsyncClient(
                reconnection=False,
                logger=False,
                engineio_logger=False,
            )
            self._setup_events()
            try:
                log.info('Connecting → %s/nexus', BACKEND_URL)
                await self._sio.connect(
                    BACKEND_URL,
                    namespaces=['/nexus'],
                    auth={'token': PC_TOKEN},
                    wait_timeout=15,
                )
                await self._sio.wait()
            except Exception as e:
                log.error('Socket error: %s', e)
            finally:
                self._connected = False
                await asyncio.sleep(5)

    def _setup_events(self) -> None:
        sio = self._sio

        @sio.event(namespace='/nexus')
        async def connect():
            self._connected = True
            log.info('✅ Connected to Dzaryx /nexus')
            await sio.emit('nexus:register', {'mac': _get_mac()}, namespace='/nexus')
            await self.app.gui_send({'type': 'status', 'backend': True})

        @sio.event(namespace='/nexus')
        async def disconnect():
            self._connected = False
            log.warning('Disconnected from backend')
            await self.app.gui_send({'type': 'status', 'backend': False})

        @sio.on('nexus:command', namespace='/nexus')
        async def on_command(data: dict):
            """Remote command from Telegram or App."""
            text   = data.get('text', '')
            source = data.get('source', 'nexus')
            log.info('← Remote command: %s', text[:60])
            asyncio.create_task(self.app.handle_command(text, source))

        @sio.on('nexus:wake', namespace='/nexus')
        async def on_wake(_data):
            log.info('Wake signal received')
            asyncio.create_task(
                self.app.speak("NEXUS en ligne. Qu'est-ce qu'on fait Kouider ?")
            )

        @sio.on('nexus:save_file', namespace='/nexus')
        async def on_save_file(data: dict):
            """Reçoit un fichier de Dzaryx, le sauvegarde dans un dossier organisé et
            ouvre l'explorateur dessus. Affiche aussi sur l'écran si demandé."""
            import base64 as _b64, time as _time
            b64      = data.get('data', '')
            filename = data.get('filename', f'file_{int(_time.time())}.jpg')
            folder   = data.get('folder', 'Divers')
            caption  = data.get('caption', '')
            display  = data.get('display', False)
            if not b64:
                return
            try:
                saved = self.app.files.save_organized_file(
                    b64, filename, folder, caption, open_explorer=True,
                )
                log.info('Fichier organisé: %s', saved)
                if display:
                    try:
                        os.startfile(saved)
                    except Exception:
                        pass
                msg = (
                    f"Fichier sauvegardé dans {folder}. "
                    f"{'Affiché sur l\'écran.' if display else 'Dossier ouvert dans l\'explorateur.'}"
                )
                asyncio.create_task(self.app.speak(msg))
            except Exception as e:
                log.error('save_file error: %s', e)
                asyncio.create_task(self.app.speak(f"Erreur sauvegarde: {e}"))

        @sio.on('nexus:display_image', namespace='/nexus')
        async def on_display_image(data: dict):
            """Reçoit une image depuis Telegram/Dzaryx et l'affiche sur l'écran du PC."""
            import base64 as _b64, tempfile, time as _time
            b64      = data.get('data', '')
            filename = data.get('filename', f'nexus_{int(_time.time())}.jpg')
            caption  = data.get('caption', '')
            if not b64:
                return
            img_bytes = _b64.b64decode(b64)
            path = os.path.join(tempfile.gettempdir(), filename)
            with open(path, 'wb') as f:
                f.write(img_bytes)
            try:
                os.startfile(path)
                log.info('Image affichée sur PC: %s', path)
            except Exception as e:
                log.error('Erreur affichage image: %s', e)
                import subprocess
                try:
                    subprocess.Popen(['explorer', path])
                except Exception:
                    pass
            msg = f"Photo reçue{' — ' + caption if caption else ''} — affichée sur l'écran."
            asyncio.create_task(self.app.speak(msg))

    async def send_to_dzaryx(self, text: str, source: str = 'nexus') -> str | None:
        """Send message to Dzaryx AI, receive response via ack."""
        if not self._connected or not self._sio:
            return "Je suis hors ligne — backend Dzaryx inaccessible."

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()

        def ack(data):
            if not future.done():
                future.set_result((data or {}).get('text', ''))

        await self._sio.emit(
            'nexus:message',
            {'text': text, 'source': source, 'session': SESSION_ID},
            namespace='/nexus',
            callback=ack,
        )
        try:
            return await asyncio.wait_for(future, timeout=45.0)
        except asyncio.TimeoutError:
            return "Timeout — Dzaryx ne répond pas."

    async def journal(self, message: str) -> None:
        if self._connected and self._sio:
            try:
                await self._sio.emit('nexus:journal', {'text': message}, namespace='/nexus')
            except Exception:
                pass

    async def send_file_telegram(self, file_path: str, caption: str = '') -> bool:
        """Envoie un fichier quelconque via le backend (nexus:telegram_file)."""
        if not self._connected or not self._sio:
            log.warning('send_file_telegram: backend non connecté')
            return False
        import base64, os
        try:
            with open(file_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode()
            filename = os.path.basename(file_path)
            await self._sio.emit(
                'nexus:telegram_file',
                {'data': b64, 'filename': filename, 'caption': caption or f'📎 {filename}'},
                namespace='/nexus',
            )
            log.info('Fichier envoyé au backend pour Telegram: %s (%d chars b64)', filename, len(b64))
            return True
        except Exception as e:
            log.error('send_file_telegram error: %s', e)
            return False

    async def send_photo_telegram(self, file_path: str, caption: str = '') -> bool:
        """Envoie une photo via le backend (nexus:telegram_photo event)."""
        if not self._connected or not self._sio:
            log.warning('send_photo_telegram: backend non connecté')
            return False
        import base64
        try:
            with open(file_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode()
            await self._sio.emit(
                'nexus:telegram_photo',
                {'image': b64, 'caption': caption or '📸 Screenshot NEXUS'},
                namespace='/nexus',
            )
            log.info('Photo envoyée au backend pour Telegram (%d chars b64)', len(b64))
            return True
        except Exception as e:
            log.error('send_photo_telegram error: %s', e)
            return False
