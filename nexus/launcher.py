#!/usr/bin/env python3
"""
NEXUS Launcher — Service léger Windows permanent
Tourne en arrière-plan même quand Nexus principal est éteint.
Reçoit commandes de Dzaryx/Telegram et réveille Nexus sur demande.

Lance: pythonw launcher.py  (ou install-nexus-launcher.bat)
"""
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import asyncio
import logging
import os
import platform
import subprocess
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

# ── Logging vers fichier (pas de console pour service background) ──────────
LOG_FILE = Path(__file__).parent / 'launcher.log'
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [LAUNCHER] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.FileHandler(str(LOG_FILE), encoding='utf-8'),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger('launcher')

# ── Config ─────────────────────────────────────────────────────────────────
BACKEND_URL  = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
PC_TOKEN     = os.environ.get('PC_AGENT_TOKEN', '')
NEXUS_DIR    = Path(__file__).parent
START_BAT    = NEXUS_DIR / 'start.bat'
NEXUS_PY     = NEXUS_DIR / 'nexus.py'
RECONNECT_S  = 8   # secondes entre reconnexions
WAKE_TIMEOUT = 22  # secondes max pour détecter nexus.py dans la liste processus

_start_time   = datetime.now()
_last_wake_at: datetime | None = None
_last_error:   str = ''


# ── Process detection ──────────────────────────────────────────────────────

def _is_nexus_running() -> bool:
    """Vérifie si nexus.py (pas launcher.py) tourne via psutil."""
    try:
        import psutil
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = ' '.join(str(c) for c in (proc.info.get('cmdline') or []))
                if 'nexus.py' in cmdline and 'launcher.py' not in cmdline:
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except ImportError:
        log.warning('psutil non installé — pip install psutil')
    return False


def _find_python() -> str:
    """Trouve le bon exécutable Python."""
    for candidate in [
        'python',
        r'C:\Users\douba\AppData\Local\Programs\Python\Python313\python.exe',
        r'C:\Users\douba\AppData\Local\Programs\Python\Python312\python.exe',
        r'C:\Users\douba\AppData\Local\Programs\Python\Python311\python.exe',
        r'C:\Python311\python.exe',
        sys.executable,
    ]:
        try:
            result = subprocess.run([candidate, '--version'], capture_output=True, timeout=5)
            if result.returncode == 0:
                return candidate
        except Exception:
            continue
    return sys.executable


def _launch_nexus() -> tuple[bool, str]:
    """Lance nexus.py via start.bat ou directement. Retourne (succès, message)."""
    global _last_wake_at, _last_error
    _last_wake_at = datetime.now()

    if _is_nexus_running():
        return True, 'Nexus était déjà en cours d\'exécution'

    try:
        if START_BAT.exists():
            subprocess.Popen(
                ['cmd.exe', '/c', str(START_BAT)],
                cwd=str(NEXUS_DIR),
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            msg = f'Nexus lancé via start.bat à {datetime.now().strftime("%H:%M:%S")}'
        else:
            python = _find_python()
            subprocess.Popen(
                [python, str(NEXUS_PY)],
                cwd=str(NEXUS_DIR),
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            msg = f'Nexus lancé via nexus.py ({python}) à {datetime.now().strftime("%H:%M:%S")}'

        log.info(msg)
        return True, msg

    except Exception as e:
        _last_error = str(e)
        log.error('Échec démarrage Nexus: %s', e)
        return False, f'Erreur démarrage: {e}'


# ── Launcher client Socket.IO ─────────────────────────────────────────────

class NexusLauncher:
    def __init__(self) -> None:
        self._sio = None
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    def _uptime_str(self) -> str:
        secs = int((datetime.now() - _start_time).total_seconds())
        h, rem = divmod(secs, 3600)
        m, s   = divmod(rem, 60)
        return f'{h}h{m:02d}m{s:02d}s'

    def _status_payload(self) -> dict:
        return {
            'launcher':   True,
            'nexus_running': _is_nexus_running(),
            'hostname':   platform.node() or 'PC-Kouider',
            'uptime':     self._uptime_str(),
            'uptime_sec': int((datetime.now() - _start_time).total_seconds()),
            'last_wake':  _last_wake_at.isoformat() if _last_wake_at else None,
            'last_error': _last_error or None,
            'time':       datetime.now().isoformat(),
        }

    async def run(self) -> None:
        try:
            import socketio
        except ImportError:
            log.error('python-socketio non installé → pip install "python-socketio[asyncio_client]"')
            return

        while True:
            self._sio = socketio.AsyncClient(
                reconnection=False,
                logger=False,
                engineio_logger=False,
            )
            self._setup_events()
            try:
                log.info('Connexion → %s/launcher', BACKEND_URL)
                await self._sio.connect(
                    BACKEND_URL,
                    namespaces=['/launcher'],
                    auth={'token': PC_TOKEN},
                    wait_timeout=15,
                )
                await self._sio.wait()
            except Exception as e:
                log.error('Socket error: %s — reconnexion dans %ds', e, RECONNECT_S)
            finally:
                self._connected = False
                await asyncio.sleep(RECONNECT_S)

    def _setup_events(self) -> None:
        sio = self._sio

        @sio.event(namespace='/launcher')
        async def connect():
            self._connected = True
            log.info('✅ Connecté à Dzaryx /launcher')
            await sio.emit('launcher:hello', self._status_payload(), namespace='/launcher')

        @sio.event(namespace='/launcher')
        async def disconnect():
            self._connected = False
            log.warning('Déconnecté du backend')

        @sio.on('launcher:wake', namespace='/launcher')
        async def on_wake(_data, ack=None):
            """Commande de réveil reçue — démarre Nexus principal."""
            log.info('← Commande WAKE reçue')

            if _is_nexus_running():
                msg = '✅ Nexus est déjà actif'
                log.info(msg)
                if callable(ack):
                    ack({'success': True, 'status': 'already_running', 'message': msg})
                return

            # Lance le processus Nexus
            loop = asyncio.get_running_loop()
            started, start_msg = await loop.run_in_executor(None, _launch_nexus)

            if not started:
                log.error('Démarrage échoué: %s', start_msg)
                if callable(ack):
                    ack({'success': False, 'status': 'error', 'message': start_msg})
                return

            # Attendre que nexus.py apparaisse dans les processus (max WAKE_TIMEOUT sec)
            log.info('Attente apparition nexus.py dans les processus...')
            deadline = time.monotonic() + WAKE_TIMEOUT
            while time.monotonic() < deadline:
                await asyncio.sleep(1.5)
                if _is_nexus_running():
                    msg = f'🟢 Nexus démarré et détecté — {start_msg}'
                    log.info(msg)
                    if callable(ack):
                        ack({'success': True, 'status': 'started', 'message': msg})
                    return

            # Process pas encore détecté — on ack quand même (peut être en init lente)
            msg = f'⚠️ Nexus lancé mais pas encore détecté dans les processus — {start_msg}'
            log.warning(msg)
            if callable(ack):
                ack({'success': True, 'status': 'starting', 'message': msg})

        @sio.on('launcher:ping', namespace='/launcher')
        async def on_ping(_data, ack=None):
            """Ping → pong avec état complet."""
            payload = self._status_payload()
            log.info('PING → PONG (nexus_running=%s)', payload['nexus_running'])
            if callable(ack):
                ack(payload)

        @sio.on('launcher:status_request', namespace='/launcher')
        async def on_status(_data, ack=None):
            """Demande de statut complet."""
            if callable(ack):
                ack(self._status_payload())

        @sio.on('launcher:stop_nexus', namespace='/launcher')
        async def on_stop(_data, ack=None):
            """Arrêter Nexus principal."""
            log.info('← Commande STOP NEXUS')
            try:
                import psutil
                killed = 0
                for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                    try:
                        cmdline = ' '.join(str(c) for c in (proc.info.get('cmdline') or []))
                        if 'nexus.py' in cmdline and 'launcher.py' not in cmdline:
                            proc.terminate()
                            killed += 1
                    except Exception:
                        pass
                msg = f'✅ {killed} processus Nexus arrêté(s)' if killed else '⚠️ Aucun processus Nexus trouvé'
            except Exception as e:
                msg = f'❌ Erreur stop: {e}'
            log.info(msg)
            if callable(ack):
                ack({'success': True, 'message': msg})


def main() -> None:
    if not PC_TOKEN:
        log.error('PC_AGENT_TOKEN manquant dans .env — abandon')
        sys.exit(1)

    print("""
 ██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗███████╗██████╗
 ██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║██╔════╝██╔══██╗
 ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║█████╗  ██████╔╝
 ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║██╔══╝  ██╔══██╗
 ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║███████╗██║  ██║
 ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
 SERVICE LÉGER PERMANENT · FIK CONCIERGERIE · ORAN
""")
    log.info('NEXUS Launcher démarré — Backend: %s', BACKEND_URL)
    launcher = NexusLauncher()
    try:
        asyncio.run(launcher.run())
    except KeyboardInterrupt:
        log.info('Launcher arrêté manuellement.')


if __name__ == '__main__':
    main()
