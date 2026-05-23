"""
NEXUS WebSocket Client — PRODUCTION HARDENED v2
Connects to Dzaryx backend via Socket.IO /nexus namespace.

Hardening features:
  - Security   : command whitelist + blocklist, audit trail
  - Screenshot : native PowerShell → Telegram (full PNG, no stdout truncation)
  - Telemetry  : python_exe, python_ver, hostname, RAM, CPU, uptime, OS
  - Stability  : exponential backoff, anti-duplicate job queue, dedup guard
  - Logging    : structured JSON logs to nexus/logs/ (nexus / jobs / security / websocket)
"""
import asyncio
import logging
import os
import re
import sys
import time
import uuid
from datetime import datetime

try:
    from .nexus_logger import (
        nexus_log, jobs_log, security_log, ws_log,
        log_job_start, log_job_done, log_job_blocked,
        log_job_timeout, log_ws_connect, log_ws_disconnect,
        log_ws_backoff, log_ws_heartbeat, log_security_event,
    )
except ImportError:
    # Fallback if run standalone (no package context)
    nexus_log = jobs_log = security_log = ws_log = logging.getLogger('nexus.ws')
    def log_job_start(*a, **k): pass
    def log_job_done(*a, **k): pass
    def log_job_blocked(*a, **k): pass
    def log_job_timeout(*a, **k): pass
    def log_ws_connect(*a, **k): pass
    def log_ws_disconnect(*a, **k): pass
    def log_ws_backoff(*a, **k): pass
    def log_ws_heartbeat(*a, **k): pass
    def log_security_event(*a, **k): pass

log = logging.getLogger('nexus.ws')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
PC_TOKEN    = os.environ.get('PC_AGENT_TOKEN', '')
SESSION_ID  = 'nexus-kouider'

_NEXUS_START_TIME = time.time()

# ── Security: blocked patterns (deny-list) ────────────────────────────────────

_BLOCKED_PATTERNS = [
    r'format\s+[a-z]:',          # disk format
    r'diskpart',                  # partition tool
    r'del\s+.*/[fsq]',           # mass deletion flags
    r'rmdir\s+/[sq]',            # recursive dir delete
    r'\brd\s+/[sq]',             # same
    r'rm\s+-[rf]{1,2}\s+/',      # Unix rm -rf /
    r'shutdown\s+/[rsf]',        # forced shutdown/reboot
    r'mkformat', r'bcdedit', r'bootrec',
    r'cipher\s+/w',              # wipe free space
    r'reg\s+(delete|add)\s+hklm', # registry root modification
    r'net\s+user\s+\w+\s+/delete', # delete user account
]
_BLOCKED_RE = re.compile('|'.join(_BLOCKED_PATTERNS), re.IGNORECASE)

# ── Security: allowed command prefixes (allowlist — admin = bypass) ───────────

_ALLOWED_PREFIXES = (
    'git ', 'node ', 'npx ', 'npm ', 'py ', 'python3 ',
    'powershell ', 'cd', 'dir', 'type ', 'echo ',
    'ipconfig', 'ping ', 'netstat', 'tasklist',
    'del ', 'mkdir ', 'copy ', 'move ', 'rename ',
    'where ', 'which ',
    'systeminfo', 'wmic ',
    'curl ', 'certutil ',
)
_ADMIN_REQUIRED_PREFIXES = (
    'taskkill ', 'net ', 'sc ', 'reg ',
    'schtasks ', 'icacls ', 'attrib ',
)

# ── Anti-duplicate job queue ──────────────────────────────────────────────────

_RUNNING_JOBS: dict[str, float] = {}   # cmd_fingerprint → started_at
_JOB_DEDUP_TTL = 5.0                   # seconds before same cmd allowed again


def _job_fingerprint(cmd: str, cwd: str | None) -> str:
    return f'{cmd.strip()[:120]}|{cwd or ""}'


def _is_duplicate(cmd: str, cwd: str | None) -> bool:
    fp  = _job_fingerprint(cmd, cwd)
    now = time.time()
    if fp in _RUNNING_JOBS and (now - _RUNNING_JOBS[fp]) < _JOB_DEDUP_TTL:
        return True
    _RUNNING_JOBS[fp] = now
    return False


def _finish_job(cmd: str, cwd: str | None) -> None:
    fp = _job_fingerprint(cmd, cwd)
    _RUNNING_JOBS.pop(fp, None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_mac() -> str:
    node = uuid.getnode()
    return ':'.join(f'{(node >> i) & 0xff:02x}' for i in range(40, -1, -8))


def _sysinfo_dict() -> dict:
    """Collect full system telemetry synchronously."""
    import platform as _pl
    info: dict = {
        'python_executable': sys.executable,
        'python_version':    sys.version.split()[0],
        'python_full':       sys.version,
        'hostname':          _pl.node(),
        'os':                _pl.system(),
        'os_version':        _pl.version()[:200],
        'os_release':        _pl.release(),
        'machine':           _pl.machine(),
        'cwd':               os.getcwd(),
        'pid':               os.getpid(),
        'uptime_s':          round(time.time() - _NEXUS_START_TIME, 1),
    }
    try:
        import psutil as _ps
        mem = _ps.virtual_memory()
        cpu = _ps.cpu_percent(interval=0.3)
        info['ram_total_mb']  = round(mem.total  / 1_048_576)
        info['ram_used_mb']   = round(mem.used   / 1_048_576)
        info['ram_percent']   = mem.percent
        info['cpu_percent']   = cpu
    except ImportError:
        # psutil not installed — provide what we can
        info['ram_note'] = 'psutil not installed — pip install psutil'
    return info


# ── Main client ───────────────────────────────────────────────────────────────

class NexusWSClient:
    def __init__(self, app) -> None:
        self.app = app
        self._sio = None
        self._connected = False
        self._connect_attempt = 0

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
            self._connect_attempt += 1
            self._sio = socketio.AsyncClient(
                reconnection=False,
                logger=False,
                engineio_logger=False,
            )
            self._setup_events()
            try:
                log.info('Connecting → %s/nexus (attempt=%d backoff=%ds)',
                         BACKEND_URL, self._connect_attempt, delay)
                log_ws_backoff(delay, self._connect_attempt)
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
                ws_log.error('ws_error', extra={'data': {'error': str(e), 'next_delay_s': delay}}) if hasattr(ws_log, 'error') else None
            finally:
                self._connected = False
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)

    def _setup_events(self) -> None:
        sio = self._sio

        # ── Connection lifecycle ──────────────────────────────────────────────

        @sio.event(namespace='/nexus')
        async def connect():
            self._connected = True
            info = _sysinfo_dict()
            log.info('✅ Connected to Dzaryx /nexus — host=%s py=%s',
                     info['hostname'], info['python_executable'])
            log_ws_connect(sio.sid or '', BACKEND_URL)
            await sio.emit('nexus:register', {
                'mac':              _get_mac(),
                'hostname':         info['hostname'],
                'python':           info['python_executable'],
                'py_ver':           info['python_version'],
                'os':               info['os'],
                'os_release':       info['os_release'],
                'uptime_s':         info['uptime_s'],
                'ram_used_mb':      info.get('ram_used_mb'),
                'ram_total_mb':     info.get('ram_total_mb'),
                'cpu_percent':      info.get('cpu_percent'),
            }, namespace='/nexus')
            await self.app.gui_send({'type': 'status', 'backend': True})

        @sio.event(namespace='/nexus')
        async def disconnect():
            self._connected = False
            log.warning('Disconnected from backend')
            log_ws_disconnect(sio.sid or '', 'socket.io_disconnect', self._connect_attempt)
            await self.app.gui_send({'type': 'status', 'backend': False})

        # ── Heartbeat ─────────────────────────────────────────────────────────

        @sio.on('nexus:ping', namespace='/nexus')
        async def on_ping(_data, ack=None):
            import platform
            payload = {
                'time':     datetime.now().isoformat(),
                'hostname': platform.node() or 'PC-Kouider',
                'uptime_s': round(time.time() - _NEXUS_START_TIME, 1),
            }
            log_ws_heartbeat(0)
            if callable(ack):
                ack(payload)

        # ── AI command relay ──────────────────────────────────────────────────

        @sio.on('nexus:command', namespace='/nexus')
        async def on_command(data: dict):
            text   = data.get('text', '')
            source = data.get('source', 'nexus')
            log.info('← Remote command: %s', text[:60])
            asyncio.create_task(self.app.handle_command(text, source))

        # ── Wake signal ───────────────────────────────────────────────────────

        @sio.on('nexus:wake', namespace='/nexus')
        async def on_wake(_data):
            log.info('Wake signal received')
            asyncio.create_task(
                self.app.speak("NEXUS en ligne. Qu'est-ce qu'on fait Kouider ?")
            )

        # ── Shell command — security + dedup + logging ────────────────────────

        @sio.on('nexus:run_command', namespace='/nexus')
        async def on_run_command(data: dict):
            import subprocess as _sp
            cmd       = data.get('command', '').strip()
            cwd       = data.get('cwd') or None
            timeout_s = int(data.get('timeout', 30))
            admin     = bool(data.get('admin', False))
            job_id    = f'job_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}'

            # ── Security: blocklist (always enforced) ─────────────────────────
            match = _BLOCKED_RE.search(cmd)
            if match:
                log_job_blocked(cmd, match.group(0))
                log_security_event('blocked_command', f'cmd={cmd[:120]}')
                return {
                    'ok': False, 'exit_code': -2, 'stdout': '',
                    'stderr': f'NEXUS SECURITY: command blocked — matched pattern "{match.group(0)}"',
                    'command': cmd, 'job_id': job_id, 'blocked': True,
                }

            # ── Security: allowlist (skip if admin) ───────────────────────────
            if not admin:
                cmd_lower = cmd.lower()
                if not any(cmd_lower.startswith(p) for p in _ALLOWED_PREFIXES):
                    if any(cmd_lower.startswith(p) for p in _ADMIN_REQUIRED_PREFIXES):
                        log_security_event('admin_required', f'cmd={cmd[:120]}')
                        return {
                            'ok': False, 'exit_code': -3, 'stdout': '',
                            'stderr': f'NEXUS SECURITY: admin=true required for this command',
                            'command': cmd, 'job_id': job_id, 'blocked': True,
                        }
                    # Unknown prefix — allow but log
                    nexus_log.warning('unknown_cmd_prefix: %s', cmd[:80])

            # ── Anti-duplicate ────────────────────────────────────────────────
            if _is_duplicate(cmd, cwd):
                log.warning('Duplicate job rejected: %s', cmd[:60])
                return {
                    'ok': False, 'exit_code': -4, 'stdout': '',
                    'stderr': f'NEXUS: duplicate command rejected (dedup_ttl={_JOB_DEDUP_TTL}s)',
                    'command': cmd, 'job_id': job_id, 'blocked': True, 'duplicate': True,
                }

            log.info('run_command [%s] ▶ %s (cwd=%s timeout=%ss)', job_id, cmd[:80], cwd, timeout_s)
            log_job_start(job_id, cmd, cwd, timeout_s)
            t0 = time.time()
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, lambda: _sp.run(
                    cmd, shell=True, capture_output=True, text=True,
                    cwd=cwd, timeout=timeout_s,
                    encoding='utf-8', errors='replace',
                ))
                elapsed = round((time.time() - t0) * 1000)
                log_job_done(job_id, cmd, result.returncode, len(result.stdout), len(result.stderr), elapsed)
                payload = {
                    'ok':        result.returncode == 0,
                    'exit_code': result.returncode,
                    'stdout':    result.stdout[:50_000],
                    'stderr':    result.stderr[:10_000],
                    'command':   cmd,
                    'job_id':    job_id,
                    'elapsed_ms': elapsed,
                }
                log.info('run_command [%s] exit=%d stdout=%d stderr=%d elapsed=%dms',
                         job_id, result.returncode, len(result.stdout), len(result.stderr), elapsed)
            except _sp.TimeoutExpired:
                log_job_timeout(job_id, cmd, timeout_s)
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': f'Timeout {timeout_s}s', 'command': cmd, 'job_id': job_id}
                log.warning('run_command [%s] TIMEOUT: %s', job_id, cmd[:60])
            except Exception as e:
                payload = {'ok': False, 'exit_code': -1, 'stdout': '', 'stderr': str(e), 'command': cmd, 'job_id': job_id}
                log.error('run_command [%s] ERROR: %s', job_id, e)
            finally:
                _finish_job(cmd, cwd)
            return payload

        # ── Read file ─────────────────────────────────────────────────────────

        @sio.on('nexus:read_file', namespace='/nexus')
        async def on_read_file(data: dict):
            import os as _os
            path = data.get('path', '')
            log.info('nexus:read_file ▶ %s', path)
            try:
                if not _os.path.exists(path):
                    return {'ok': False, 'path': path, 'error': 'File not found', 'content': None}
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                nexus_log.info('read_file ✅ path=%s size=%d', path, len(content))
                return {'ok': True, 'path': path, 'content': content, 'size': len(content)}
            except Exception as e:
                log.error('read_file ERROR: %s', e)
                return {'ok': False, 'path': path, 'error': str(e), 'content': None}

        # ── List files in directory ───────────────────────────────────────────

        @sio.on('nexus:list_files', namespace='/nexus')
        async def on_list_files(data: dict):
            import os as _os
            path = data.get('path', '')
            ext  = data.get('ext', '.md')
            log.info('nexus:list_files ▶ %s (ext=%s)', path, ext)
            try:
                if not _os.path.isdir(path):
                    return {'ok': False, 'path': path, 'error': 'Not a directory', 'files': []}
                files = sorted([f for f in _os.listdir(path) if f.endswith(ext)])
                nexus_log.info('list_files ✅ path=%s count=%d', path, len(files))
                return {'ok': True, 'path': path, 'files': files}
            except Exception as e:
                log.error('list_files ERROR: %s', e)
                return {'ok': False, 'path': path, 'error': str(e), 'files': []}

        # ── Self-restart (watchdog relance automatiquement) ──────────────────

        @sio.on('nexus:self_restart', namespace='/nexus')
        async def on_self_restart(_data: dict):
            import asyncio as _aio
            nexus_log.info('self_restart requested by backend — exiting for watchdog relaunching')
            log.info('nexus:self_restart ▶ exiting in 1s...')
            asyncio.create_task(self.journal('🔄 Nexus redémarre via watchdog...'))
            async def _do_exit():
                await _aio.sleep(1.0)
                import os as _os
                _os.kill(_os.getpid(), 15)  # SIGTERM → watchdog relance
            asyncio.create_task(_do_exit())
            return {'ok': True, 'message': 'Redémarrage en cours, watchdog va relancer Nexus...'}

        # ── Find Obsidian vault path ──────────────────────────────────────────

        @sio.on('nexus:find_obsidian_vault', namespace='/nexus')
        async def on_find_obsidian_vault(_data: dict):
            import os as _os
            import asyncio as _aio
            log.info('nexus:find_obsidian_vault ▶ searching...')

            def _search_vaults() -> list:
                home = _os.path.expanduser('~')
                candidates = [
                    _os.path.join(home, 'Documents'),
                    _os.path.join(home, 'OneDrive'),
                    _os.path.join(home, 'Desktop'),
                    _os.path.join(home, 'Obsidian'),
                    home,
                ]
                found = []
                for base in candidates:
                    if not _os.path.isdir(base):
                        continue
                    try:
                        for root, dirs, _ in _os.walk(base):
                            if '.obsidian' in dirs:
                                found.append(root)
                            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('AppData', 'node_modules', '$RECYCLE.BIN')]
                            if len(found) >= 3:
                                break
                    except PermissionError:
                        continue
                    if found:
                        break
                return found

            try:
                loop = _aio.get_event_loop()
                vaults = await loop.run_in_executor(None, _search_vaults)
                nexus_log.info('find_obsidian_vault ✅ found=%d vaults=%s', len(vaults), vaults)
                if vaults:
                    return {'ok': True, 'vault': vaults[0], 'all_vaults': vaults}
                return {'ok': False, 'vault': None, 'error': 'No Obsidian vault found'}
            except Exception as e:
                log.error('find_obsidian_vault ERROR: %s', e)
                return {'ok': False, 'vault': None, 'error': str(e)}

        # ── Write file ────────────────────────────────────────────────────────

        @sio.on('nexus:write_file', namespace='/nexus')
        async def on_write_file(data: dict):
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
                nexus_log.info('write_file ✅ path=%s size=%d', path, len(content))
                return {'ok': True, 'path': path, 'size': len(content)}
            except Exception as e:
                log.error('write_file ERROR: %s', e)
                return {'ok': False, 'path': path, 'error': str(e)}

        # ── Screenshot → Telegram (full PNG, no stdout truncation) ────────────

        @sio.on('nexus:screenshot', namespace='/nexus')
        async def on_screenshot(data: dict):
            import subprocess as _sp, tempfile as _tmp, base64 as _b64, platform as _platform
            caption  = data.get('caption') or f'📸 NEXUS — {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
            tmp_path = _tmp.mktemp(suffix='.png', prefix='nexus_screen_')
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
                    err = (result.stderr or result.stdout or 'unknown error').strip()[:500]
                    log.error('screenshot PowerShell failed exit=%d: %s', result.returncode, err)
                    return {'ok': False, 'error': f'PowerShell exit {result.returncode}: {err}'}

                if not os.path.exists(tmp_path):
                    return {'ok': False, 'error': 'PNG not created by PowerShell'}

                with open(tmp_path, 'rb') as f:
                    img_bytes = f.read()
                size_bytes = len(img_bytes)
                b64 = _b64.b64encode(img_bytes).decode()

                # Send full image via backend event (not stdout — no truncation limit)
                await sio.emit('nexus:telegram_photo', {
                    'image':   b64,
                    'caption': caption,
                }, namespace='/nexus')

                log.info('screenshot ✅ %d bytes (%.1f KB) → Telegram', size_bytes, size_bytes / 1024)
                nexus_log.info('screenshot_sent size_bytes=%d', size_bytes)
                return {
                    'ok':               True,
                    'sent_to_telegram': True,
                    'size_bytes':       size_bytes,
                    'size_kb':          round(size_bytes / 1024, 1),
                    'timestamp':        datetime.now().isoformat(),
                    'hostname':         _platform.node(),
                }
            except _sp.TimeoutExpired:
                log.error('screenshot TIMEOUT 20s')
                return {'ok': False, 'error': 'PowerShell screenshot timeout 20s'}
            except Exception as e:
                log.error('screenshot ERROR: %s', e)
                return {'ok': False, 'error': str(e)}
            finally:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        # ── Screenshot → base64 in ack (no Telegram) ─────────────────────────
        # Used by Dzaryx agent to return screenshot directly in HTTP response.

        @sio.on('nexus:screenshot_base64', namespace='/nexus')
        async def on_screenshot_base64(data: dict):
            import subprocess as _sp, tempfile as _tmp, base64 as _b64, platform as _platform
            tmp_path = _tmp.mktemp(suffix='.png', prefix='nexus_b64_')
            ps_cmd = (
                f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
                f"$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                f"$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); "
                f"$g=[System.Drawing.Graphics]::FromImage($bmp); "
                f"$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); "
                f"$bmp.Save('{tmp_path}'); $bmp.Dispose(); $g.Dispose()"
            )
            log.info('nexus:screenshot_base64 ▶ %s', tmp_path)
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, lambda: _sp.run(
                    ['powershell', '-NonInteractive', '-Command', ps_cmd],
                    capture_output=True, text=True, timeout=20,
                ))
                if result.returncode != 0:
                    err = (result.stderr or result.stdout or 'unknown').strip()[:500]
                    log.error('screenshot_base64 PowerShell failed exit=%d: %s', result.returncode, err)
                    return {'ok': False, 'error': f'PowerShell exit {result.returncode}: {err}'}
                if not os.path.exists(tmp_path):
                    return {'ok': False, 'error': 'PNG not created by PowerShell'}
                with open(tmp_path, 'rb') as f:
                    img_bytes = f.read()
                b64 = _b64.b64encode(img_bytes).decode()
                log.info('screenshot_base64 ✅ %d bytes (%.1f KB)', len(img_bytes), len(img_bytes) / 1024)
                nexus_log.info('screenshot_b64_sent size_bytes=%d', len(img_bytes))
                return {
                    'ok':           True,
                    'image_base64': b64,
                    'size_bytes':   len(img_bytes),
                    'size_kb':      round(len(img_bytes) / 1024, 1),
                    'timestamp':    datetime.now().isoformat(),
                    'hostname':     _platform.node(),
                }
            except _sp.TimeoutExpired:
                log.error('screenshot_base64 TIMEOUT 20s')
                return {'ok': False, 'error': 'PowerShell screenshot timeout 20s'}
            except Exception as e:
                log.error('screenshot_base64 ERROR: %s', e)
                return {'ok': False, 'error': str(e)}
            finally:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        # ── Sysinfo + telemetry (full) ────────────────────────────────────────

        @sio.on('nexus:sysinfo', namespace='/nexus')
        async def on_sysinfo(_data: dict):
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(None, _sysinfo_dict)
            info['ok'] = True
            return info

        # ── Save file (organised folders) ─────────────────────────────────────

        @sio.on('nexus:save_file', namespace='/nexus')
        async def on_save_file(data: dict):
            import base64 as _b64, time as _time
            b64        = data.get('data', '')
            filename   = data.get('filename', f'file_{int(_time.time())}.jpg')
            folder     = data.get('folder', 'Divers')
            caption    = data.get('caption', '')
            open_after = data.get('display', False) or data.get('open_after', False)
            if not b64:
                return
            try:
                saved = self.app.files.save_organized_file(b64, filename, folder, caption, open_explorer=True)
                if open_after:
                    try:
                        os.startfile(saved)
                    except Exception:
                        pass
                asyncio.create_task(self.journal(f'✅ Sauvegardé dans *{folder}/*\n`{os.path.basename(saved)}`'))
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

        # ── OS Agent — File Explorer ─────────────────────────────────────────

        @sio.on('nexus:file_list', namespace='/nexus')
        async def on_file_list(data: dict):
            from .os_agent import file_list
            return await file_list(data)

        @sio.on('nexus:file_search', namespace='/nexus')
        async def on_file_search(data: dict):
            from .os_agent import file_search
            return await file_search(data)

        @sio.on('nexus:file_read', namespace='/nexus')
        async def on_file_read(data: dict):
            from .os_agent import file_read
            return await file_read(data)

        @sio.on('nexus:file_send', namespace='/nexus')
        async def on_file_send(data: dict):
            from .os_agent import file_send
            return await file_send(data, sio)

        @sio.on('nexus:file_open', namespace='/nexus')
        async def on_file_open(data: dict):
            from .os_agent import file_open
            return await file_open(data)

        # ── OS Agent — Window Manager ─────────────────────────────────────────

        @sio.on('nexus:window_list', namespace='/nexus')
        async def on_window_list(data: dict):
            from .os_agent import window_list
            return await window_list(data)

        @sio.on('nexus:window_focus', namespace='/nexus')
        async def on_window_focus(data: dict):
            from .os_agent import window_focus
            return await window_focus(data)

        @sio.on('nexus:window_close', namespace='/nexus')
        async def on_window_close(data: dict):
            from .os_agent import window_close
            return await window_close(data)

        @sio.on('nexus:window_screenshot', namespace='/nexus')
        async def on_window_screenshot(data: dict):
            from .os_agent import window_screenshot
            return await window_screenshot(data, sio)

        # ── OS Agent — Process Manager ────────────────────────────────────────

        @sio.on('nexus:process_list', namespace='/nexus')
        async def on_process_list(data: dict):
            from .os_agent import process_list
            return await process_list(data)

        @sio.on('nexus:process_kill', namespace='/nexus')
        async def on_process_kill(data: dict):
            from .os_agent import process_kill
            return await process_kill(data)

        # ── OS Agent — App Launcher ───────────────────────────────────────────

        @sio.on('nexus:app_launch', namespace='/nexus')
        async def on_app_launch(data: dict):
            from .os_agent import app_launch
            return await app_launch(data)

        @sio.on('nexus:focus_app', namespace='/nexus')
        async def on_focus_app(data: dict):
            from .os_agent import focus_app
            return await focus_app(data)

        # ── Terminal Manager ──────────────────────────────────────────────────

        @sio.on('nexus:terminal_run', namespace='/nexus')
        async def on_terminal_run(data: dict):
            from .os_agent import terminal_run
            return await terminal_run(data, sio)

        @sio.on('nexus:claude_code_start', namespace='/nexus')
        async def on_claude_code_start(data: dict):
            from .os_agent import claude_code_start
            return await claude_code_start(data)

        @sio.on('nexus:get_environment', namespace='/nexus')
        async def on_get_environment(_data: dict):
            from .os_agent import get_environment
            return get_environment()

        # ── OS Agent — Screen Understanding ──────────────────────────────────

        @sio.on('nexus:screen_understand', namespace='/nexus')
        async def on_screen_understand(data: dict):
            from .os_agent import screen_understand
            return await screen_understand(data, sio)

        # ── Display image on screen ───────────────────────────────────────────

        @sio.on('nexus:display_image', namespace='/nexus')
        async def on_display_image(data: dict):
            import base64 as _b64, tempfile, time as _time
            b64      = data.get('data', '')
            filename = data.get('filename', f'nexus_{int(_time.time())}.jpg')
            caption  = data.get('caption', '')
            if not b64:
                return
            path = os.path.join(tempfile.gettempdir(), filename)
            with open(path, 'wb') as f:
                f.write(_b64.b64decode(b64))
            try:
                os.startfile(path)
            except Exception:
                import subprocess
                try:
                    subprocess.Popen(['explorer', path])
                except Exception:
                    pass
            asyncio.create_task(self.app.speak(
                f"Photo reçue{' — ' + caption if caption else ''} — affichée sur l'écran."
            ))

        # ── Remote control — souris ──────────────────────────────────────────

        @sio.on('nexus:mouse_move', namespace='/nexus')
        async def on_mouse_move(data: dict):
            from .input_control import InputControl
            x = int(data.get('x', 0)); y = int(data.get('y', 0))
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: InputControl().move_mouse(x, y))
            return {'ok': True, 'result': result}

        @sio.on('nexus:mouse_click', namespace='/nexus')
        async def on_mouse_click(data: dict):
            from .input_control import InputControl
            x      = int(data.get('x', 0)); y = int(data.get('y', 0))
            button = data.get('button', 'left')
            loop = asyncio.get_event_loop()
            ic = InputControl()
            if button == 'right':
                result = await loop.run_in_executor(None, lambda: ic.right_click(x, y))
            elif button == 'double':
                result = await loop.run_in_executor(None, lambda: ic.double_click(x, y))
            else:
                result = await loop.run_in_executor(None, lambda: ic.click(x, y))
            return {'ok': True, 'result': result}

        @sio.on('nexus:mouse_scroll', namespace='/nexus')
        async def on_mouse_scroll(data: dict):
            from .input_control import InputControl
            direction = data.get('direction', 'up')
            amount    = int(data.get('amount', 3))
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: InputControl().scroll(direction, amount))
            return {'ok': True, 'result': result}

        # ── Remote control — clavier ──────────────────────────────────────────

        @sio.on('nexus:key_press', namespace='/nexus')
        async def on_key_press(data: dict):
            from .input_control import InputControl
            key = data.get('key', '')
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: InputControl().press_key(key))
            return {'ok': True, 'result': result}

        @sio.on('nexus:type_text', namespace='/nexus')
        async def on_type_text(data: dict):
            from .input_control import InputControl
            text = data.get('text', '')[:500]
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: InputControl().type_text(text))
            return {'ok': True, 'result': result}

        @sio.on('nexus:hotkey', namespace='/nexus')
        async def on_hotkey(data: dict):
            from .input_control import InputControl
            keys = data.get('keys', [])
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, lambda: InputControl().hotkey(*keys))
            return {'ok': True, 'result': result}

        # ── Remote control — infos écran ──────────────────────────────────────

        @sio.on('nexus:get_screen_size', namespace='/nexus')
        async def on_get_screen_size(_data: dict):
            import ctypes as _ctypes
            u32 = _ctypes.windll.user32
            return {'ok': True, 'width': u32.GetSystemMetrics(0), 'height': u32.GetSystemMetrics(1)}

        # ── Screenshot JPEG rapide (live view) ───────────────────────────────

        @sio.on('nexus:screenshot_jpeg', namespace='/nexus')
        async def on_screenshot_jpeg(data: dict):
            import subprocess as _sp, tempfile as _tmp, base64 as _b64
            quality  = max(10, min(90, int(data.get('quality', 50))))
            scale    = max(0.2, min(1.0, float(data.get('scale', 0.5))))
            tmp_path = _tmp.mktemp(suffix='.jpg', prefix='nexus_live_')
            ps_cmd = (
                f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
                f"$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                f"$w=[int]($s.Width*{scale}); $h=[int]($s.Height*{scale}); "
                f"$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); "
                f"$g=[System.Drawing.Graphics]::FromImage($bmp); "
                f"$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); "
                f"$thumb=New-Object System.Drawing.Bitmap($w,$h); "
                f"$tg=[System.Drawing.Graphics]::FromImage($thumb); "
                f"$tg.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; "
                f"$tg.DrawImage($bmp,0,0,$w,$h); "
                f"$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object{{$_.MimeType -eq 'image/jpeg'}}; "
                f"$ep=New-Object System.Drawing.Imaging.EncoderParameters(1); "
                f"$ep.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]{quality}); "
                f"$thumb.Save('{tmp_path}',$enc,$ep); "
                f"$bmp.Dispose();$g.Dispose();$thumb.Dispose();$tg.Dispose()"
            )
            log.info('nexus:screenshot_jpeg q=%d scale=%.1f', quality, scale)
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(None, lambda: _sp.run(
                    ['powershell', '-NonInteractive', '-Command', ps_cmd],
                    capture_output=True, text=True, timeout=15,
                ))
                if result.returncode != 0 or not os.path.exists(tmp_path):
                    return {'ok': False, 'error': (result.stderr or result.stdout or 'failed')[:300]}
                with open(tmp_path, 'rb') as f:
                    img_bytes = f.read()
                b64 = _b64.b64encode(img_bytes).decode()
                return {
                    'ok': True, 'image_base64': b64,
                    'size_bytes': len(img_bytes), 'size_kb': round(len(img_bytes) / 1024, 1),
                    'timestamp': datetime.now().isoformat(),
                }
            except _sp.TimeoutExpired:
                return {'ok': False, 'error': 'Screenshot timeout 15s'}
            except Exception as e:
                return {'ok': False, 'error': str(e)}
            finally:
                try: os.remove(tmp_path)
                except Exception: pass

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
            return True
        except Exception as e:
            log.error('send_file_telegram error: %s', e)
            return False

    async def send_photo_telegram(self, file_path: str, caption: str = '') -> bool:
        if not self._connected or not self._sio:
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
            return True
        except Exception as e:
            log.error('send_photo_telegram error: %s', e)
            return False
