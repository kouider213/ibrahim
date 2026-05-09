"""
NEXUS WebSocket Client
Connects to Dzaryx backend via Socket.IO /nexus namespace
Handles: AI messages, remote commands, WoL registration, Telegram journal
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime

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

        @sio.on('nexus:ping', namespace='/nexus')
        async def on_ping(_data, ack=None):
            import platform
            payload = {
                'time':     datetime.now().isoformat(),
                'hostname': platform.node() or 'PC-Kouider',
            }
            log.info('PING received → PONG %s', payload['time'])
            if callable(ack):
                ack(payload)

        @sio.on('nexus:wake', namespace='/nexus')
        async def on_wake(_data):
            log.info('Wake signal received')
            asyncio.create_task(
                self.app.speak("NEXUS en ligne. Qu'est-ce qu'on fait Kouider ?")
            )

        @sio.on('nexus:run_command', namespace='/nexus')
        async def on_run_command(data: dict, ack=None):
            """Run a shell command on the PC, return stdout/stderr/exit_code via ack."""
            import subprocess as _sp
            cmd       = data.get('command', '')
            cwd       = data.get('cwd') or None
            timeout_s = int(data.get('timeout', 30))
            log.info('nexus:run_command — %s (cwd=%s timeout=%ss)', cmd[:80], cwd, timeout_s)
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, lambda: _sp.run(
                    cmd, shell=True, capture_output=True, text=True,
                    cwd=cwd, timeout=timeout_s,
                    encoding='utf-8', errors='replace',
                ))
                payload = {
                    'ok':        result.returncode == 0,
                    'exit_code': result.returncode,
                    'stdout':    result.stdout[:4000],
                    'stderr':    result.stderr[:2000],
                    'command':   cmd,
                }
                log.info('run_command exit=%d stdout=%d chars stderr=%d chars',
                         result.returncode, len(result.stdout), len(result.stderr))
            except _sp.TimeoutExpired:
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': f'Timeout {timeout_s}s', 'command': cmd}
                log.warning('run_command TIMEOUT: %s', cmd[:60])
            except Exception as e:
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': str(e), 'command': cmd}
                log.error('run_command ERROR: %s', e)
            if callable(ack):
                ack(payload)

        @sio.on('nexus:write_file', namespace='/nexus')
        async def on_write_file(data: dict, ack=None):
            """Write text content to a local file path on the PC."""
            import os as _os
            path    = data.get('path', '')
            content = data.get('content', '')
            log.info('nexus:write_file — %s (%d chars)', path, len(content))
            try:
                dir_path = _os.path.dirname(path)
                if dir_path:
                    _os.makedirs(dir_path, exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                payload = {'ok': True, 'path': path, 'size': len(content)}
                log.info('write_file OK: %s', path)
            except Exception as e:
                payload = {'ok': False, 'path': path, 'error': str(e)}
                log.error('write_file ERROR: %s', e)
            if callable(ack):
                ack(payload)

        @sio.on('nexus:save_file', namespace='/nexus')
        async def on_save_file(data: dict):
            """Reçoit un fichier de Dzaryx, le sauvegarde dans un dossier organisé."""
            import base64 as _b64, time as _time, re as _re
            b64      = data.get('data', '')
            filename = data.get('filename', f'file_{int(_time.time())}.jpg')
            folder   = data.get('folder', 'Divers')
            caption  = data.get('caption', '')
            display  = data.get('display', False)
            open_after = data.get('open_after', False)
            chat_id  = data.get('chatId')
            if not b64:
                return
            try:
                saved = self.app.files.save_organized_file(
                    b64, filename, folder, caption, open_explorer=True,
                )
                log.info('Fichier organisé: %s', saved)
                if display or open_after:
                    try:
                        os.startfile(saved)
                    except Exception:
                        pass
                reply = f'✅ Sauvegardé dans *{folder}/*\n`{os.path.basename(saved)}`'
                asyncio.create_task(self.journal(reply))
                asyncio.create_task(self.app.speak(f"Fichier sauvegardé dans {folder}."))
            except Exception as e:
                log.error('save_file error: %s', e)
                asyncio.create_task(self.journal(f'❌ Erreur sauvegarde: {e}'))

        @sio.on('nexus:live_frame', namespace='/nexus')
        async def on_live_frame(data: dict):
            """Reçoit une frame live de la caméra Dzaryx et l'affiche sur le PC via OpenCV."""
            b64 = data.get('data', '')
            if not b64:
                return
            # Affiche dans une fenêtre OpenCV dédiée (thread séparé)
            self.app.vision.push_relay_frame(b64)
            # Aussi transmet au GUI browser pour visualisation
            await self.app.gui_send({'type': 'live_frame', 'data': b64})

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
