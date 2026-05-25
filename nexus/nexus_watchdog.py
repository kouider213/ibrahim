#!/usr/bin/env python3
"""
nexus_watchdog.py — Auto-restart nexus.py on crash + Telegram notification.
Usage: python nexus_watchdog.py
       (runs in foreground, logs to stdout + nexus_watchdog.log)
"""
import asyncio
import logging
import os
import sys
import time
import urllib.request
import json

NEXUS_DIR   = os.path.dirname(os.path.abspath(__file__))
PYTHON_EXE  = sys.executable

BACKEND_URL    = os.getenv('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
PC_AGENT_TOKEN = os.getenv('PC_AGENT_TOKEN', '')

MAX_RESTARTS    = 10    # give up after this many crashes
RESTART_DELAY_S = 5     # base delay between restarts
QUICK_CRASH_S   = 10    # uptime < this = "quick crash" → double delay + extra warning

LOG_FILE = os.path.join(NEXUS_DIR, 'nexus_watchdog.log')

logging.basicConfig(
    level=logging.INFO,
    format='[WATCHDOG] %(asctime)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
    ],
)
log = logging.getLogger('watchdog')


def _send_telegram(text: str) -> None:
    if not PC_AGENT_TOKEN:
        log.info(f'[watchdog] notify (no token): {text[:80]}')
        return
    try:
        payload = json.dumps({'text': text}).encode()
        req = urllib.request.Request(
            f'{BACKEND_URL}/api/nexus/watchdog-notify',
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {PC_AGENT_TOKEN}',
            },
        )
        urllib.request.urlopen(req, timeout=8)
    except Exception as e:
        log.warning(f'Watchdog notify error: {e}')


async def _run_nexus() -> int:
    """Launch nexus.py, stream its stdout, return exit code."""
    log.info(f'Launching: {PYTHON_EXE} nexus.py  cwd={NEXUS_DIR}')
    proc = await asyncio.create_subprocess_exec(
        PYTHON_EXE, 'nexus.py',
        cwd=NEXUS_DIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    if proc.stdout:
        async for raw in proc.stdout:
            line = raw.decode(errors='replace').rstrip()
            sys.stdout.write(f'[NEXUS] {line}\n')
            sys.stdout.flush()
    code = await proc.wait()
    return code if code is not None else -1


async def main() -> None:
    log.info('Nexus Watchdog started')
    _send_telegram('🛡️ *Nexus Watchdog* démarré — surveillance active')

    restarts = 0

    while True:
        t_start   = time.monotonic()
        exit_code = await _run_nexus()
        elapsed   = time.monotonic() - t_start

        # Exit code 0 = graceful stop (SIGTERM or explicit sys.exit(0))
        if exit_code == 0:
            log.info('Nexus stopped cleanly — watchdog exiting')
            _send_telegram('🖥️ *Nexus* arrêté proprement')
            return

        restarts     += 1
        quick_crash   = elapsed < QUICK_CRASH_S

        log.warning(
            f'Nexus crashed exit={exit_code} uptime={elapsed:.1f}s '
            f'quick={quick_crash} restart={restarts}/{MAX_RESTARTS}'
        )
        _send_telegram(
            f'🔄 *Nexus* redémarrage #{restarts}/{MAX_RESTARTS}\n'
            f'• Code sortie: `{exit_code}`\n'
            f'• Uptime: `{elapsed:.0f}s`\n'
            f'{"• ⚠️ crash rapide" if quick_crash else ""}'
        )

        if restarts > MAX_RESTARTS:
            log.error(f'Max restarts ({MAX_RESTARTS}) reached — giving up')
            _send_telegram(
                f'🚨 *Nexus* non récupérable — {MAX_RESTARTS} crashs consécutifs.\n'
                f'Intervention manuelle requise.'
            )
            return

        delay = RESTART_DELAY_S * (2 if quick_crash else 1)
        log.info(f'Waiting {delay}s before restart…')
        await asyncio.sleep(delay)


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info('Watchdog stopped by user (Ctrl+C)')
