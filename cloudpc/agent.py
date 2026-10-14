#!/usr/bin/env python3
"""
PC cloud — agent qui relie le bureau virtuel du VPS (cloudpc/desktop.sh, écran :50) à Dzaryx.

Toujours allumé (pas de batterie, pas de mise à jour Windows, pas de coupure chez Kouider) : quand le laptop est
éteint, Kouider voit et pilote ce PC depuis l'app (MON PC → PC cloud), et Dzaryx y fait ses tâches web
(browser-worker branché sur le même Chrome par CDP — Kouider peut regarder et prendre la main).

Socket.IO namespace /cloudpc du backend (même jeton que Nexus : PC_AGENT_TOKEN). Événements avec réponse :
cloud:frame, cloud:click, cloud:drag, cloud:scroll, cloud:key, cloud:type, cloud:hotkey, cloud:open_url,
cloud:tabs, cloud:tab_activate, cloud:tab_close, cloud:page_text, cloud:fetch_text (page lue en arrière-plan),
cloud:restart_browser, cloud:status, cloud:files, cloud:file_put, cloud:file_link, cloud:file_telegram,
cloud:file_open, cloud:file_delete, cloud:clipboard_get, cloud:clipboard_set, cloud:screenshot_telegram.
Émet cloud:new_file quand un téléchargement se termine (le backend le copie dans le Drive et prévient Kouider).
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
DATA = Path(os.environ.get('CLOUDPC_DATA', '/root/cloudpc-data'))
FILES = DATA / 'downloads'                       # téléchargements de Chrome + fichiers envoyés du téléphone
OUTBOX = ROOT / 'tgcall' / 'outbox'              # le service Telegram de Dzaryx envoie ce qui y est déposé
SB_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SB_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
BUCKET = 'cloudpc'
PARTIAL = ('.crdownload', '.part', '.tmp', '.download')
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


# ── Onglets ──────────────────────────────────────────────────────────────────

@sio.on('cloud:tab_activate', namespace=NS)
@safe
async def on_tab_activate(d):
    await run(lambda: cdp_json(f"/json/activate/{d.get('id', '')}"))
    return ok('onglet affiché')


@sio.on('cloud:tab_close', namespace=NS)
@safe
async def on_tab_close(d):
    if len(await run(tabs)) <= 1:
        return {'ok': False, 'error': 'dernier onglet : je le garde ouvert'}
    await run(lambda: cdp_json(f"/json/close/{d.get('id', '')}"))
    return ok('onglet fermé')


# ── Page lue en arrière-plan (surveillance de pages) : onglet ouvert SANS prendre le premier plan ──────────

async def fetch_text(url: str, wait_s: float, max_chars: int) -> dict:
    import aiohttp
    ver = await run(lambda: cdp_json('/json/version'))
    async with aiohttp.ClientSession() as http:
        async with http.ws_connect(ver['webSocketDebuggerUrl'], max_msg_size=0) as ws:
            seq = 0

            async def call(method: str, params: dict | None = None, session: str | None = None) -> dict:
                nonlocal seq
                seq += 1
                msg = {'id': seq, 'method': method, 'params': params or {}}
                if session:
                    msg['sessionId'] = session
                await ws.send_json(msg)
                while True:
                    r = await asyncio.wait_for(ws.receive_json(), 30)
                    if r.get('id') == seq:
                        if 'error' in r:
                            raise RuntimeError(r['error'].get('message', 'CDP'))
                        return r.get('result', {})

            target = (await call('Target.createTarget', {'url': url, 'background': True}))['targetId']
            try:
                sess = (await call('Target.attachToTarget', {'targetId': target, 'flatten': True}))['sessionId']
                deadline = time.time() + 25
                while time.time() < deadline:
                    st = await call('Runtime.evaluate', {'expression': 'document.readyState', 'returnByValue': True}, sess)
                    if st.get('result', {}).get('value') == 'complete':
                        break
                    await asyncio.sleep(0.5)
                await asyncio.sleep(wait_s)          # pages qui se remplissent après le chargement
                r = await call('Runtime.evaluate', {'expression': '[document.title, location.href, document.body ? document.body.innerText : ""]',
                                                     'returnByValue': True}, sess)
                title, href, text = r.get('result', {}).get('value') or ['', url, '']
                return {'ok': True, 'title': title, 'url': href, 'text': text[:max_chars]}
            finally:
                try:
                    await call('Target.closeTarget', {'targetId': target})
                except Exception:
                    pass


@sio.on('cloud:fetch_text', namespace=NS)
@safe
async def on_fetch_text(d):
    url = str(d.get('url', '')).strip()
    if '://' not in url:
        url = 'https://' + url
    return await fetch_text(url, max(0.0, min(15.0, float(d.get('wait', 3)))), max(500, min(60000, int(d.get('max', 20000)))))


# ── Presse-papiers (copier-coller téléphone ↔ PC cloud) ─────────────────────

@sio.on('cloud:clipboard_get', namespace=NS)
@safe
async def on_clip_get(_d):
    r = await run(lambda: subprocess.run(['xclip', '-selection', 'clipboard', '-o'], capture_output=True, text=True, timeout=5,
                                         env={**os.environ, 'DISPLAY': DISPLAY}))
    return {'ok': True, 'text': (r.stdout or '')[:20000]}


@sio.on('cloud:clipboard_set', namespace=NS)
@safe
async def on_clip_set(d):
    text = str(d.get('text', ''))[:20000]

    def _set() -> None:
        p = subprocess.Popen(['xclip', '-selection', 'clipboard', '-i'], stdin=subprocess.PIPE,
                             env={**os.environ, 'DISPLAY': DISPLAY}, start_new_session=True)
        p.communicate(text.encode(), timeout=5)
    await run(_set)
    if d.get('paste'):
        await asyncio.sleep(0.2)
        await run(lambda: xdo('key', '--clearmodifiers', 'ctrl+v'))
    return ok('collé' if d.get('paste') else 'copié dans le presse-papiers du PC cloud')


# ── Fichiers ─────────────────────────────────────────────────────────────────

def safe_name(name: str) -> str:
    name = os.path.basename(str(name)).strip().replace('\\', '_')
    return ''.join(c for c in name if c not in '\x00/') or f'fichier-{int(time.time())}'


def file_path(name: str) -> Path:
    p = (FILES / safe_name(name)).resolve()
    if p.parent != FILES.resolve() or not p.is_file():
        raise FileNotFoundError(f'fichier introuvable : {name}')
    return p


def list_files() -> list[dict]:
    FILES.mkdir(parents=True, exist_ok=True)
    out = [{'name': f.name, 'size': f.stat().st_size, 'mtime': datetime.fromtimestamp(f.stat().st_mtime).isoformat()}
           for f in FILES.iterdir() if f.is_file() and not f.name.endswith(PARTIAL) and not f.name.startswith('.')]
    return sorted(out, key=lambda x: x['mtime'], reverse=True)[:60]


async def storage_link(p: Path, hours: int = 24) -> str:
    """Copie le fichier dans Supabase Storage (privé) et renvoie un lien temporaire de téléchargement."""
    import aiohttp
    if not (SB_URL and SB_KEY):
        raise RuntimeError('SUPABASE_URL / SUPABASE_SERVICE_KEY absents')
    h = {'apikey': SB_KEY, 'Authorization': f'Bearer {SB_KEY}'}
    key = f"{datetime.now():%Y-%m}/{int(p.stat().st_mtime)}-{urllib.parse.quote(p.name)}"
    async with aiohttp.ClientSession() as http:
        async with http.post(f'{SB_URL}/storage/v1/bucket', json={'id': BUCKET, 'name': BUCKET, 'public': False}, headers=h) as _:
            pass                                             # existe déjà → 409, sans importance
        async with http.post(f'{SB_URL}/storage/v1/object/{BUCKET}/{key}', data=p.read_bytes(),
                             headers={**h, 'x-upsert': 'true', 'Content-Type': 'application/octet-stream'}) as r:
            if r.status >= 300:
                raise RuntimeError(f'Storage {r.status}: {(await r.text())[:150]}')
        async with http.post(f'{SB_URL}/storage/v1/object/sign/{BUCKET}/{key}', json={'expiresIn': hours * 3600}, headers=h) as r:
            j = await r.json()
            if 'signedURL' not in j:
                raise RuntimeError(f'lien : {j}')
            return f"{SB_URL}/storage/v1{j['signedURL']}&download={urllib.parse.quote(p.name)}"


def to_telegram(p: Path, caption: str) -> None:
    OUTBOX.mkdir(exist_ok=True)
    stamp = f'{int(time.time() * 1000)}-cloudpc'
    name = p.name if p.suffix.lower() not in ('.txt', '.jpg', '.call') else p.name + '.fichier'
    (OUTBOX / f'{stamp}.{name}').write_bytes(p.read_bytes())   # même début de nom que le .txt → envoyé comme document
    (OUTBOX / f'{stamp}.txt').write_text(caption or p.name, encoding='utf-8')


@sio.on('cloud:files', namespace=NS)
@safe
async def on_files(_d):
    return {'ok': True, 'files': await run(list_files)}


@sio.on('cloud:file_put', namespace=NS)
@safe
async def on_file_put(d):
    FILES.mkdir(parents=True, exist_ok=True)
    name = safe_name(d.get('name', ''))
    data = base64.b64decode(d.get('b64', ''))
    dest = FILES / name
    if dest.exists():
        dest = FILES / f'{dest.stem}-{int(time.time())}{dest.suffix}'
    dest.write_bytes(data)
    _seen[dest.name] = dest.stat().st_size            # pas de notif « nouveau téléchargement » pour un envoi du téléphone
    return {'ok': True, 'result': f'{dest.name} reçu ({round(len(data) / 1024)} Ko) — dossier Téléchargements du PC cloud', 'name': dest.name}


@sio.on('cloud:file_link', namespace=NS)
@safe
async def on_file_link(d):
    p = file_path(d.get('name', ''))
    return {'ok': True, 'url': await storage_link(p, int(d.get('hours', 24))), 'name': p.name, 'size': p.stat().st_size}


@sio.on('cloud:file_telegram', namespace=NS)
@safe
async def on_file_telegram(d):
    p = file_path(d.get('name', ''))
    if p.stat().st_size > 45 * 1024 * 1024:
        return {'ok': False, 'error': 'trop gros pour Telegram (45 Mo max)'}
    await run(to_telegram, p, str(d.get('caption', '')) or f'📎 {p.name} (PC cloud)')
    return ok(f'{p.name} envoyé sur Telegram')


OFFICE = {'.doc', '.docx', '.odt', '.rtf', '.xls', '.xlsx', '.ods', '.csv', '.ppt', '.pptx', '.odp'}


@sio.on('cloud:file_open', namespace=NS)
@safe
async def on_file_open(d):
    p = file_path(d.get('name', ''))
    if p.suffix.lower() in OFFICE:
        subprocess.Popen(['soffice', '--norestore', str(p)], env={**os.environ, 'DISPLAY': DISPLAY},
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        return ok(f'{p.name} ouvert dans LibreOffice')
    t = await run(lambda: cdp_json('/json/new?' + urllib.parse.quote(p.as_uri(), safe=':/'), 'PUT'))
    if isinstance(t, dict):
        await run(lambda: cdp_json(f"/json/activate/{t['id']}"))
    return ok(f'{p.name} ouvert dans Chrome')


@sio.on('cloud:file_delete', namespace=NS)
@safe
async def on_file_delete(d):
    p = file_path(d.get('name', ''))
    p.unlink()
    _seen.pop(p.name, None)
    return ok(f'{p.name} supprimé')


@sio.on('cloud:screenshot_telegram', namespace=NS)
@safe
async def on_shot_telegram(d):
    f = await run(frame, 1.0, 80)
    OUTBOX.mkdir(exist_ok=True)
    stamp = f'{int(time.time() * 1000)}-cloudpc-ecran'
    (OUTBOX / f'{stamp}.jpg').write_bytes(base64.b64decode(f['image_base64']))
    (OUTBOX / f'{stamp}.txt').write_text(str(d.get('caption', '')) or '🖥️ Écran du PC cloud', encoding='utf-8')
    return ok('capture envoyée sur Telegram')


# ── Nouveaux téléchargements → backend (copie Drive + notification) ───────────

_seen: dict[str, int] = {}


async def watch_downloads() -> None:
    FILES.mkdir(parents=True, exist_ok=True)
    for f in FILES.iterdir():                               # ce qui est déjà là au démarrage n'est pas « nouveau »
        if f.is_file():
            _seen[f.name] = f.stat().st_size
    pending: dict[str, int] = {}
    while True:
        await asyncio.sleep(4)
        try:
            for f in FILES.iterdir():
                if not f.is_file() or f.name.endswith(PARTIAL) or f.name.startswith('.') or f.name in _seen:
                    continue
                size = f.stat().st_size
                if pending.get(f.name) != size:              # encore en train de s'écrire → on attend une taille stable
                    pending[f.name] = size
                    continue
                pending.pop(f.name, None)
                _seen[f.name] = size
                url = None
                try:
                    url = await storage_link(f, 72)
                except Exception as e:
                    log.warning('lien %s: %s', f.name, e)
                log.info('nouveau fichier : %s (%d Ko)', f.name, size // 1024)
                if sio.connected:
                    await sio.emit('cloud:new_file', {'name': f.name, 'size': size, 'url': url}, namespace=NS)
        except Exception as e:
            log.warning('surveillance téléchargements : %s', e)


@sio.event(namespace=NS)
async def connect():
    log.info('connecté à %s%s', BACKEND, NS)


@sio.event(namespace=NS)
async def disconnect():
    log.warning('déconnecté — reconnexion automatique')


async def main() -> None:
    if not TOKEN:
        raise SystemExit('PC_AGENT_TOKEN manquant dans .env')
    asyncio.create_task(watch_downloads())
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
