#!/usr/bin/env python3
"""
PC cloud — agent qui relie le bureau virtuel du VPS (cloudpc/desktop.sh, écran :50) à Dzaryx.

Toujours allumé (pas de batterie, pas de mise à jour Windows, pas de coupure chez Kouider) : quand le laptop est
éteint, Kouider voit et pilote ce PC depuis l'app (MON PC → PC cloud), et Dzaryx y fait ses tâches web
(browser-worker branché sur le même Chrome par CDP — Kouider peut regarder et prendre la main).

Socket.IO namespace /cloudpc du backend (même jeton que Nexus : PC_AGENT_TOKEN). Événements avec réponse :
cloud:frame, cloud:click, cloud:drag, cloud:scroll, cloud:key, cloud:type, cloud:hotkey, cloud:open_url,
cloud:tabs, cloud:page_text, cloud:restart_browser, cloud:status.
pm2 : dzaryx-cloudpc (cloudpc/.venv/bin/python cloudpc/agent.py)
"""
import asyncio
import base64
import io
import json
import logging
import os
import subprocess
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import socketio

ROOT = Path(__file__).resolve().parent.parent
for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines() if (ROOT / '.env').exists() else []:
    k, _, v = line.partition('=')
    if k.strip() and not line.lstrip().startswith('#') and k.strip() not in os.environ:
        os.environ[k.strip()] = v.strip().strip('"')

BACKEND = os.environ.get('CLOUDPC_BACKEND', 'https://ibrahim-backend-production.up.railway.app')
TOKEN = os.environ.get('PC_AGENT_TOKEN', '')
DISPLAY = os.environ.get('CLOUDPC_DISPLAY', ':50')
CDP = 'http://127.0.0.1:9223'
os.environ['DISPLAY'] = DISPLAY
STARTED = time.time()

logging.basicConfig(level=logging.INFO, format='%(asctime)s [cloudpc] %(levelname)s %(message)s')
log = logging.getLogger('cloudpc')

sio = socketio.AsyncClient(reconnection=True, reconnection_delay=2, reconnection_delay_max=30, logger=False)
NS = '/cloudpc'

# Touches envoyées par l'app (noms façon Windows) → noms xdotool
KEYS = {
    'enter': 'Return', 'return': 'Return', 'backspace': 'BackSpace', 'esc': 'Escape', 'escape': 'Escape',
    'tab': 'Tab', 'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right', 'delete': 'Delete', 'del': 'Delete',
    'home': 'Home', 'end': 'End', 'pageup': 'Prior', 'pagedown': 'Next', 'space': 'space', 'ctrl': 'ctrl',
    'control': 'ctrl', 'alt': 'alt', 'shift': 'shift', 'win': 'super', 'cmd': 'super', 'super': 'super',
}


def xkey(k: str) -> str:
    k = str(k).strip()
    low = k.lower()
    if low in KEYS:
        return KEYS[low]
    if low.startswith('f') and low[1:].isdigit():
        return low.upper()
    return k


def xdo(*args: str, timeout: float = 10) -> str:
    r = subprocess.run(['xdotool', *args], capture_output=True, text=True, timeout=timeout,
                       env={**os.environ, 'DISPLAY': DISPLAY})
    if r.returncode != 0:
        raise RuntimeError((r.stderr or 'xdotool').strip()[:200])
    return r.stdout.strip()


def screen_size() -> tuple[int, int]:
    import mss
    with (mss.MSS if hasattr(mss, 'MSS') else mss.mss)(display=DISPLAY) as s:
        m = s.monitors[1]
        return m['width'], m['height']


def point(data: dict, kx: str = 'x', ky: str = 'y') -> tuple[int, int]:
    # nx/ny = position relative (0..1) dans l'image : juste quelle que soit la taille d'affichage dans l'app
    if f'n{kx}' in data and f'n{ky}' in data:
        w, h = screen_size()
        nx = max(0.0, min(1.0, float(data[f'n{kx}']))); ny = max(0.0, min(1.0, float(data[f'n{ky}'])))
        return round(nx * (w - 1)), round(ny * (h - 1))
    return int(data.get(kx, 0)), int(data.get(ky, 0))


def frame(scale: float, quality: int) -> dict:
    import mss
    from PIL import Image, ImageDraw
    with (mss.MSS if hasattr(mss, 'MSS') else mss.mss)(display=DISPLAY) as s:
        mon = s.monitors[1]
        shot = s.grab(mon)
    img = Image.frombytes('RGB', shot.size, shot.rgb)
    try:   # curseur dessiné (sinon invisible depuis le téléphone)
        loc = dict(x.split(':') for x in xdo('getmouselocation').split() if ':' in x)
        cx, cy = int(loc['x']), int(loc['y'])
        d = ImageDraw.Draw(img); r = max(6, img.width // 160)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 51, 102), width=max(2, r // 3))
    except Exception:
        pass
    if scale < 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.BILINEAR)
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=quality)
    b = buf.getvalue()
    return {'ok': True, 'image_base64': base64.b64encode(b).decode(), 'size_kb': round(len(b) / 1024, 1),
            'width': shot.size[0], 'height': shot.size[1], 'timestamp': datetime.now().isoformat()}


def cdp_json(path: str, method: str = 'GET'):
    req = urllib.request.Request(CDP + path, method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        body = r.read().decode()
    try:
        return json.loads(body or 'null')
    except ValueError:   # /json/activate répond en texte (« Target activated »)
        return body


def tabs() -> list[dict]:
    return [{'id': t['id'], 'title': t.get('title', ''), 'url': t.get('url', '')}
            for t in cdp_json('/json/list') if t.get('type') == 'page']


async def page_text(max_chars: int) -> dict:
    """Texte de l'onglet visible (Playwright branché sur le Chrome du bureau, sans le fermer)."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP)
        try:
            pages = [pg for c in browser.contexts for pg in c.pages]
            page = None
            for pg in pages:
                try:
                    if await pg.evaluate('document.visibilityState') == 'visible':
                        page = pg; break
                except Exception:
                    continue
            page = page or (pages[0] if pages else None)
            if not page:
                return {'ok': False, 'error': 'aucun onglet ouvert'}
            text = await page.evaluate('document.body ? document.body.innerText : ""')
            return {'ok': True, 'url': page.url, 'title': await page.title(), 'text': text[:max_chars]}
        finally:
            await browser.close()   # connect_over_cdp : se détache seulement, Chrome reste ouvert


async def run(fn, *a):
    return await asyncio.get_running_loop().run_in_executor(None, fn, *a)


def ok(result: str = 'ok') -> dict:
    return {'ok': True, 'result': result}


def safe(handler):
    async def wrapped(data=None):
        try:
            return await handler(data or {})
        except Exception as e:
            log.warning('%s: %s', handler.__name__, e)
            return {'ok': False, 'error': str(e)[:300]}
    wrapped.__name__ = handler.__name__
    return wrapped


@sio.on('cloud:frame', namespace=NS)
@safe
async def on_frame(d):
    return await run(frame, max(0.2, min(1.0, float(d.get('scale', 0.6)))), max(20, min(95, int(d.get('quality', 55)))))


@sio.on('cloud:click', namespace=NS)
@safe
async def on_click(d):
    x, y = point(d)
    btn = d.get('button', 'left')
    await run(lambda: xdo('mousemove', str(x), str(y), 'click', *(['--repeat', '2'] if btn == 'double' else []),
                          '3' if btn == 'right' else '1'))
    return ok(f'clic {btn} {x},{y}')


@sio.on('cloud:drag', namespace=NS)
@safe
async def on_drag(d):
    x1, y1 = point(d, 'x1', 'y1'); x2, y2 = point(d, 'x2', 'y2')
    await run(lambda: xdo('mousemove', str(x1), str(y1), 'mousedown', '1', 'mousemove', '--sync', str(x2), str(y2), 'mouseup', '1'))
    return ok('glissé')


@sio.on('cloud:scroll', namespace=NS)
@safe
async def on_scroll(d):
    n = max(1, min(15, int(d.get('amount', 3))))
    await run(lambda: xdo('click', '--repeat', str(n), '--delay', '30', '4' if d.get('direction') == 'up' else '5'))
    return ok('défilé')


@sio.on('cloud:key', namespace=NS)
@safe
async def on_key(d):
    await run(lambda: xdo('key', '--clearmodifiers', xkey(d.get('key', ''))))
    return ok('touche')


@sio.on('cloud:hotkey', namespace=NS)
@safe
async def on_hotkey(d):
    keys = [xkey(k) for k in d.get('keys', [])][:4]
    if not keys:
        return {'ok': False, 'error': 'aucune touche'}
    await run(lambda: xdo('key', '--clearmodifiers', '+'.join(keys)))
    return ok('+'.join(keys))


@sio.on('cloud:type', namespace=NS)
@safe
async def on_type(d):
    text = str(d.get('text', ''))[:2000]
    await run(lambda: xdo('type', '--clearmodifiers', '--delay', '8', '--', text, timeout=60))
    return ok(f'{len(text)} caractères tapés')


@sio.on('cloud:open_url', namespace=NS)
@safe
async def on_open_url(d):
    url = str(d.get('url', '')).strip()
    if not url:
        return {'ok': False, 'error': 'url manquante'}
    if '://' not in url:
        url = 'https://' + url
    t = await run(lambda: cdp_json('/json/new?' + urllib.parse.quote(url, safe=':/?&=%#+@,;~'), 'PUT'))
    await run(lambda: cdp_json(f"/json/activate/{t['id']}") if t else None)
    return ok(f'ouvert : {url}')


@sio.on('cloud:tabs', namespace=NS)
@safe
async def on_tabs(_d):
    return {'ok': True, 'tabs': await run(tabs)}


@sio.on('cloud:page_text', namespace=NS)
@safe
async def on_page_text(d):
    return await page_text(max(500, min(20000, int(d.get('max', 6000)))))


@sio.on('cloud:restart_browser', namespace=NS)
@safe
async def on_restart(_d):
    await run(lambda: subprocess.run(['pkill', '-f', 'remote-debugging-port=9223'], timeout=10))
    return ok('Chrome relancé (2-3 s)')


@sio.on('cloud:status', namespace=NS)
@safe
async def on_status(_d):
    try:
        t = await run(tabs); chrome = True
    except Exception:
        t = []; chrome = False
    w, h = await run(screen_size)
    return {'ok': True, 'chrome': chrome, 'tabs': t[:10], 'width': w, 'height': h,
            'uptime_s': round(time.time() - STARTED), 'host': os.uname().nodename}


@sio.event(namespace=NS)
async def connect():
    log.info('connecté à %s%s', BACKEND, NS)


@sio.event(namespace=NS)
async def disconnect():
    log.warning('déconnecté — reconnexion automatique')


async def main() -> None:
    if not TOKEN:
        raise SystemExit('PC_AGENT_TOKEN manquant dans .env')
    delay = 2
    while True:
        try:
            await sio.connect(BACKEND, namespaces=[NS], auth={'token': TOKEN}, transports=['websocket'], wait_timeout=20)
            delay = 2
            await sio.wait()
        except Exception as e:
            log.warning('connexion impossible (%s) — nouvel essai dans %d s', e, delay)
            await asyncio.sleep(delay)
            delay = min(60, delay * 2)


if __name__ == '__main__':
    asyncio.run(main())
