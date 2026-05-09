"""
NEXUS WebSocket Client — HARDENED
Connects to Dzaryx backend via Socket.IO /nexus namespace.

Security : dangerous shell patterns blocked server-side + client-side.
Screenshot: captured natively via PowerShell, sent as Telegram photo (no stdout truncation).
Watchdog  : exponential backoff reconnect (5s → 60s max).
"""
import asyncio
import logging
import os
import re
import sys
import uuid
from datetime import datetime

log = logging.getLogger('nexus.ws')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
PC_TOKEN    = os.environ.get('PC_AGENT_TOKEN', '')
SESSION_ID  = 'nexus-kouider'

# ── Security: patterns blocked unconditionally ────────────────────────────────
_BLOCKED_PATTERNS = [
    r'format\s+[a-z]:',          # disk format
    r'diskpart',                  # partition tool
    r'del\s+.*/[fsq]',           # mass file deletion flags
    r'rmdir\s+/[sq]',            # recursive directory delete
    r'\brd\s+/[sq]',             # same
    r'rm\s+-[rf]{1,2}\s+/',      # Unix rm -rf /
    r'shutdown\s+/[rsf]',        # forced shutdown/reboot
    r'mkformat',
    r'bcdedit',
    r'bootrec',
    r'cipher\s+/w',              # wipe free space
    r'sfc\s+/scannow',           # system file checker (slow, blocks)
]
_BLOCKED_RE = re.compile('|'.join(_BLOCKED_PATTERNS), re.IGNORECASE)


def _get_mac() -> str:
    node = uuid.getnode()
    return ':'.join(f'{(node >> i) & 0xff:02x}' for i in range(40, -1, -8))


def _python_cmd() -> str:
    """Return the real Python executable used by this Nexus process."""
    return sys.executable


class NexusWSClient:
    def __init__(self, app) -> None:
        self.app = app
        self._sio = None
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    async def run(self) -> None:
        """Connect forever with exponential backoff (5s → 60s max)."""
        try:
            import socketio
        except ImportError:
            log.error('python-socketio not installed → pip install "python-socketio[asyncio_client]"')
            return

        delay = 5
        while True:
            self._sio = socketio.AsyncClient(
                reconnection=False,
                logger=False,
                engineio_logger=False,
            )
            self._setup_events()
            try:
                log.info('Connecting → %s/nexus (backoff=%ds)', BACKEND_URL, delay)
                await self._sio.connect(
                    BACKEND_URL,
                    namespaces=['/nexus'],
                    auth={'token': PC_TOKEN},
                    wait_timeout=15,
                )
                delay = 5  # reset on successful connect
                await self._sio.wait()
            except Exception as e:
                log.error('Socket error: %s — reconnect in %ds', e, delay)
            finally:
                self._connected = False
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)  # exponential backoff, max 60s

    def _setup_events(self) -> None:
        sio = self._sio

        # ── Connection lifecycle ──────────────────────────────────────────────

        @sio.event(namespace='/nexus')
        async def connect():
            self._connected = True
            log.info('✅ Connected to Dzaryx /nexus')
            import platform as _platform
            await sio.emit('nexus:register', {
                'mac':      _get_mac(),
                'hostname': _platform.node(),
                'python':   sys.executable,
                'py_ver':   sys.version.split()[0],
            }, namespace='/nexus')
            await self.app.gui_send({'type': 'status', 'backend': True})

        @sio.event(namespace='/nexus')
        async def disconnect():
            self._connected = False
            log.warning('Disconnected from backend')
            await self.app.gui_send({'type': 'status', 'backend': False})

        # ── AI message relay ──────────────────────────────────────────────────

        @sio.on('nexus:command', namespace='/nexus')
        async def on_command(data: dict):
            text   = data.get('text', '')
            source = data.get('source', 'nexus')
            log.info('← Remote command: %s', text[:60])
            asyncio.create_task(self.app.handle_command(text, source))

        # ── Heartbeat ─────────────────────────────────────────────────────────

        @sio.on('nexus:ping', namespace='/nexus')
        async def on_ping(_data, ack=None):
            import platform
            payload = {
                'time':     datetime.now().isoformat(),
                'hostname': platform.node() or 'PC-Kouider',
            }
            log.debug('PING → PONG %s', payload['time'])
            if callable(ack):
                ack(payload)

        # ── Wake signal ───────────────────────────────────────────────────────

        @sio.on('nexus:wake', namespace='/nexus')
        async def on_wake(_data):
            log.info('Wake signal received')
            asyncio.create_task(
                self.app.speak("NEXUS en ligne. Qu'est-ce qu'on fait Kouider ?")
            )

        # ── Shell command ─────────────────────────────────────────────────────

        @sio.on('nexus:run_command', namespace='/nexus')
        async def on_run_command(data: dict):
            """Run shell command — blocked if dangerous, stdout capped at 50k."""
            import subprocess as _sp
            cmd       = data.get('command', '')
            cwd       = data.get('cwd') or None
            timeout_s = int(data.get('timeout', 30))

            # Security check
            if _BLOCKED_RE.search(cmd):
                log.warning('BLOCKED command: %s', cmd[:120])
                return {
                    'ok':        False,
                    'exit_code': -2,
                    'stdout':    '',
                    'stderr':    f'NEXUS SECURITY: command blocked — matches dangerous pattern',
                    'command':   cmd,
                    'blocked':   True,
                }

            log.info('nexus:run_command ▶ %s (cwd=%s timeout=%ss)', cmd[:80], cwd, timeout_s)
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
                    'stdout':    result.stdout[:50_000],
                    'stderr':    result.stderr[:10_000],
                    'command':   cmd,
                }
                log.info('run_command exit=%d stdout=%d stderr=%d',
                         result.returncode, len(result.stdout), len(result.stderr))
            except _sp.TimeoutExpired:
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': f'Timeout {timeout_s}s', 'command': cmd}
                log.warning('run_command TIMEOUT: %s', cmd[:60])
            except Exception as e:
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': str(e), 'command': cmd}
                log.error('run_command ERROR: %s', e)
            return payload

        # ── Write file ────────────────────────────────────────────────────────

        @sio.on('nexus:write_file', namespace='/nexus')
        async def on_write_file(data: dict):
            """Write text content to a local path — return-value ack."""
            import os as _os
            path    = data.get('path', '')
            content = data.get('content', '')
            log.info('nexus:write_file ▶ %s (%d chars)', path, len(content))
            try:
                dir_path = _os.path.dirname(path)
                if dir_path:
                    _os.makedirs(dir_path, exist_ok=True)
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                payload = {'ok': True, 'path': path, 'size': len(content)}
                log.info('write_file ✅ %s', path)
            except Exception as e:
                payload = {'ok': False, 'path': path, 'error': str(e)}
                log.error('write_file ERROR: %s', e)
            return payload

        # ── Screenshot → Telegram (no stdout truncation) ──────────────────────

        @sio.on('nexus:screenshot', namespace='/nexus')
        async def on_screenshot(data: dict):
            """Capture desktop screenshot via PowerShell → send as Telegram photo."""
            import subprocess as _sp, tempfile as _tmp, time as _time
            import os as _os, base64 as _b64, platform as _platform

            caption = data.get('caption') or f'📸 NEXUS — {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
            tmp_path = _os.path.join(_tmp.gettempdir(), f'nexus_screen_{int(_time.time())}.png')

            ps_cmd = (
                f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
                f"$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                f"$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); "
                f"$g=[System.Drawing.Graphics]::FromImage($bmp); "
                f"$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); "
                f"$bmp.Save('{tmp_path}'); $bmp.Dispose(); $g.Dispose()"
            )
            log.info('nexus:screenshot ▶ %s', tmp_path)
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, lambda: _sp.run(
                    ['powershell', '-NonInteractive', '-Command', ps_cmd],
                    capture_output=True, text=True, timeout=20,
                ))
                if result.returncode != 0:
                    err = result.stderr.strip()[:500] or result.stdout.strip()[:500]
                    log.error('screenshot PowerShell failed: %s', err)
                    return {'ok': False, 'error': f'PowerShell failed (exit {result.returncode}): {err}'}

                if not _os.path.exists(tmp_path):
                    return {'ok': False, 'error': 'PNG file not created by PowerShell'}

                with open(tmp_path, 'rb') as f:
                    img_bytes = f.read()
                size_bytes = len(img_bytes)
                b64 = _b64.b64encode(img_bytes).decode()

                # Send full image to Telegram via backend event (bypasses stdout cap)
                await sio.emit('nexus:telegram_photo', {
                    'image':   b64,
                    'caption': caption,
                }, namespace='/nexus')

                log.info('screenshot ✅ %d bytes → Telegram', size_bytes)
                return {
                    'ok':              True,
                    'sent_to_telegram': True,
                    'size_bytes':      size_bytes,
                    'timestamp':       datetime.now().isoformat(),
                    'hostname':        _platform.node(),
                }
            except _sp.TimeoutExpired:
                return {'ok': False, 'error': 'PowerShell screenshot timeout 20s'}
            except Exception as e:
                log.error('screenshot ERROR: %s', e)
                return {'ok': False, 'error': str(e)}
            finally:
                try:
                    _os.remove(tmp_path)
                except Exception:
                    pass

        # ── Sysinfo ───────────────────────────────────────────────────────────

        @sio.on('nexus:sysinfo', namespace='/nexus')
        async def on_sysinfo(_data: dict):
            """Return real system info: Python path, version, hostname, OS."""
            import platform as _platform, os as _os
            return {
                'ok':               True,
                'python_executable': sys.executable,
                'python_version':    sys.version.split()[0],
                'python_full':       sys.version,
                'hostname':          _platform.node(),
                'os':                _platform.system(),
                'os_version':        _platform.version()[:200],
                'os_release':        _platform.release(),
                'cwd':               _os.getcwd(),
                'pid':               _os.getpid(),
            }

        # ── Save file (organised) ─────────────────────────────────────────────

        @sio.on('nexus:save_file', namespace='/nexus')
        async def on_save_file(data: dict):
            import base64 as _b64, time as _time
            b64        = data.get('data', '')
            filename   = data.get('filename', f'file_{int(_time.time())}.jpg')
            folder     = data.get('folder', 'Divers')
            caption    = data.get('caption', '')
            display    = data.get('display', False)
            open_after = data.get('open_after', False)
            if not b64:
                return
            try:
                saved = self.app.files.save_organized_file(b64, filename, folder, caption, open_explorer=True)
                log.info('Fichier organisé: %s', saved)
                if display or open_after:
                    try:
                        os.startfile(saved)
                    except Exception:
                        pass
                reply = f'✅ Sauvegardé dans *{folder}/*\n`{os.path.basename(saved)}`'
                asyncio.create_task(self.journal(reply))
                asyncio.create_task(self.app.speak(f'Fichier sauvegardé dans {folder}.'))
            except Exception as e:
                log.error('save_file error: %s', e)
                asyncio.create_task(self.journal(f'❌ Erreur sauvegarde: {e}'))

        # ── Live camera relay ─────────────────────────────────────────────────

        @sio.on('nexus:live_frame', namespace='/nexus')
        async def on_live_frame(data: dict):
            b64 = data.get('data', '')
            if not b64:
                return
            self.app.vision.push_relay_frame(b64)
            await self.app.gui_send({'type': 'live_frame', 'data': b64})

        # ── Display image on PC screen ────────────────────────────────────────

        @sio.on('nexus:display_image', namespace='/nexus')
        async def on_display_image(data: dict):
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
                log.info('Image affichée: %s', path)
            except Exception as e:
                log.error('Erreur affichage image: %s', e)
                import subprocess
                try:
                    subprocess.Popen(['explorer', path])
                except Exception:
                    pass
            msg = f"Photo reçue{' — ' + caption if caption else ''} — affichée sur l'écran."
            asyncio.create_task(self.app.speak(msg))

    # ── Public API ────────────────────────────────────────────────────────────

    async def send_to_dzaryx(self, text: str, source: str = 'nexus') -> str | None:
        if not self._connected or not self._sio:
            return 'Je suis hors ligne — backend Dzaryx inaccessible.'
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
            return 'Timeout — Dzaryx ne répond pas.'

    async def journal(self, message: str) -> None:
        if self._connected and self._sio:
            try:
                await self._sio.emit('nexus:journal', {'text': message}, namespace='/nexus')
            except Exception:
                pass

    async def send_file_telegram(self, file_path: str, caption: str = '') -> bool:
        if not self._connected or not self._sio:
            log.warning('send_file_telegram: backend non connecté')
            return False
        import base64
        try:
            with open(file_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode()
            filename = os.path.basename(file_path)
            await self._sio.emit(
                'nexus:telegram_file',
                {'data': b64, 'filename': filename, 'caption': caption or f'📎 {filename}'},
                namespace='/nexus',
            )
            log.info('Fichier → Telegram: %s (%d chars b64)', filename, len(b64))
            return True
        except Exception as e:
            log.error('send_file_telegram error: %s', e)
            return False

    async def send_photo_telegram(self, file_path: str, caption: str = '') -> bool:
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
            log.info('Photo → Telegram (%d chars b64)', len(b64))
            return True
        except Exception as e:
            log.error('send_photo_telegram error: %s', e)
            return False
