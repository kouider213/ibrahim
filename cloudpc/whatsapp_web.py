"""WhatsApp Business de Kouider dans le Chrome du PC cloud (web.whatsapp.com, appareil connecté) — 2026-10-15.

Dzaryx LIT les messages des clients et RÉPOND seulement après l'accord de Kouider (le backend demande la
confirmation avant d'appeler `send`). Pas d'envoi en masse, pas de premier contact : uniquement des réponses à des
conversations existantes, tapées dans la vraie page comme un humain (limite le risque de blocage du numéro).

- `watch()` : toutes les 20 s, liste les discussions NON LUES (sans les ouvrir : elles restent non lues sur le téléphone)
  et prévient le backend (`cloud:wa_new`) pour chaque nouveau message.
- `action(d)` : status | link_code | unread | read | send — appelé par l'outil `whatsapp_web` du backend.
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path

from cdp import Page

log = logging.getLogger('cloudpc.wa')
URL = 'https://web.whatsapp.com/'
LOCK = asyncio.Lock()          # un seul acteur à la fois dans l'onglet WhatsApp
# Pendant une connexion (30 min après une demande de code) : chaque nouveau code affiché → Telegram (il change souvent)
LINK_FLAG = Path(os.environ.get('CLOUDPC_DATA', '/root/cloudpc-data')) / 'wa_link_until'

JS_STATE = """(() => ({
  logged: !!document.querySelector('#pane-side'),
  code: [...document.querySelectorAll('[data-link-code]')].map(e => e.getAttribute('data-link-code')).join('') || null,
  text: (document.body ? document.body.innerText : '').slice(0, 400),
}))()"""

# Discussions de la colonne de gauche (titre, aperçu, heure, nombre de non lus) — sans rien ouvrir
JS_CHATS = r"""(() => {
  const pane = document.querySelector('#pane-side');
  if (!pane) return null;
  const rows = [...pane.querySelectorAll('[role="listitem"], [role="row"]')];
  return rows.map(r => {
    const titled = [...r.querySelectorAll('span[title]')];
    const name = titled[0] ? titled[0].getAttribute('title') : '';
    const preview = titled.length > 1 ? titled[titled.length - 1].getAttribute('title') : '';
    const badge = [...r.querySelectorAll('span[aria-label]')].map(s => s.getAttribute('aria-label'))
      .find(l => /non lu|unread/i.test(l || '')) || '';
    const n = parseInt((badge.match(/\d+/) || ['0'])[0], 10) || (badge ? 1 : 0);
    const time = ((r.innerText || '').split('\n').find(l => /^\d{1,2}:\d{2}$|^hier$|^\d{2}\/\d{2}\/\d{4}$/i.test(l.trim())) || '').trim();
    return { name, preview, unread: n, time };
  }).filter(c => c.name);
})()"""

JS_MESSAGES = r"""((max) => {
  const main = document.querySelector('#main');
  if (!main) return null;
  const title = (main.querySelector('header span[title], header span[dir="auto"]') || {}).innerText || '';
  const rows = [...main.querySelectorAll('div.message-in, div.message-out')];
  return { chat: title, messages: rows.slice(-max).map(m => {
    const c = m.querySelector('[data-pre-plain-text]');
    const meta = c ? c.getAttribute('data-pre-plain-text') : '';
    const text = [...m.querySelectorAll('span.selectable-text')].map(s => s.innerText).join(' ').trim();
    return { me: m.classList.contains('message-out'), meta: meta.trim(), text: text || (m.querySelector('img') ? '[photo]' : m.querySelector('audio, [data-icon*="audio"], [data-icon*="ptt"]') ? '[message vocal]' : '[pièce jointe]') };
  }) };
})"""


async def _page():
    return Page('https://web.whatsapp.com', URL)


async def _shown_code(text: str) -> str | None:
    if 'Saisissez le code' not in text:
        return None
    lines = [l.strip() for l in text.split('\n')]
    i = next((i for i, l in enumerate(lines) if l.startswith('Association du compte')), None)
    if i is None:
        return None
    chars = [l for l in lines[i + 1:i + 12] if len(l) == 1 and l != '-' and l.isalnum()][:8]
    return ''.join(chars[:4]) + '-' + ''.join(chars[4:]) if len(chars) == 8 else None


def _linking() -> bool:
    try:
        return float(LINK_FLAG.read_text()) > time.time()
    except (OSError, ValueError):
        return False


async def _key(p: Page, key: str, code: str, vk: int, mods: int = 0) -> None:
    for t in ('keyDown', 'keyUp'):
        await p.call('Input.dispatchKeyEvent', {'type': t, 'key': key, 'code': code, 'windowsVirtualKeyCode': vk, 'modifiers': mods})


async def _click_text(p: Page, pattern: str) -> bool:
    return bool(await p.js(f"""(() => {{ const re = new RegExp({json.dumps(pattern)}, 'i');
      const el = [...document.querySelectorAll('div[role=button],button,span')].find(e => re.test((e.innerText || '').trim()));
      if (el) el.click(); return !!el; }})()"""))


async def status() -> dict:
    async with await _page() as p:
        s = await p.js(JS_STATE)
    return {'ok': True, 'logged_in': bool(s['logged']), 'screen': s['text']}


async def link_code(phone: str) -> dict:
    """Connexion par numéro : renvoie le code à 8 caractères à taper dans WhatsApp Business."""
    async with await _page() as p:
        s = await p.js(JS_STATE)
        if s['logged']:
            return {'ok': True, 'logged_in': True}
        await p.call('Page.navigate', {'url': URL})
        await asyncio.sleep(10)
        await _click_text(p, '^(Se connecter|Connecter plutôt) avec un numéro')
        await asyncio.sleep(2)
        await p.js("document.querySelector('[data-testid=phone-number-input]').focus()")
        await _key(p, 'a', 'KeyA', 65, 2)
        await _key(p, 'Backspace', 'Backspace', 8)
        await p.call('Input.insertText', {'text': phone})
        await asyncio.sleep(1)
        await _click_text(p, '^Suivant$')
        for _ in range(20):
            await asyncio.sleep(1)
            code = _shown_code(await p.js("document.body.innerText"))
            if code:
                LINK_FLAG.write_text(str(time.time() + 1800))
                return {'ok': True, 'logged_in': False, 'code': code}
    return {'ok': False, 'error': "Code de connexion non affiché (numéro refusé ou page changée)."}


async def unread() -> dict:
    async with await _page() as p:
        chats = await p.js(JS_CHATS)
    if chats is None:
        return {'ok': False, 'error': 'WhatsApp non connecté sur le PC cloud.'}
    return {'ok': True, 'chats': [c for c in chats if c['unread']], 'recent': chats[:15]}


async def _open_chat(p: Page, chat: str) -> bool:
    """Ouvre une discussion : clic dans la liste si visible, sinon recherche. Numéro → lien direct."""
    digits = ''.join(ch for ch in chat if ch.isdigit())
    if len(digits) >= 9 and len(digits) == len(chat.replace('+', '').replace(' ', '')):
        await p.call('Page.navigate', {'url': f'{URL}send?phone={digits}'})
        for _ in range(30):
            await asyncio.sleep(1)
            if await p.js("!!document.querySelector('#main footer [contenteditable=true]')"):
                return True
        return False
    clicked = await p.js(f"""(() => {{ const want = {json.dumps(chat.lower())};
      const span = [...document.querySelectorAll('#pane-side span[title]')].find(s => (s.getAttribute('title') || '').toLowerCase() === want)
        || [...document.querySelectorAll('#pane-side span[title]')].find(s => (s.getAttribute('title') || '').toLowerCase().includes(want));
      if (!span) return false;
      const row = span.closest('[role="listitem"], [role="row"]') || span;
      for (const t of ['mousedown', 'mouseup', 'click']) row.dispatchEvent(new MouseEvent(t, {{ bubbles: true }}));
      return true; }})()""")
    if not clicked:
        # Recherche (discussion hors écran)
        await p.js("(document.querySelector('#side [contenteditable=true]') || document.querySelector('#side input')).focus()")
        await _key(p, 'a', 'KeyA', 65, 2)
        await _key(p, 'Backspace', 'Backspace', 8)
        await p.call('Input.insertText', {'text': chat})
        await asyncio.sleep(2.5)
        await _key(p, 'Enter', 'Enter', 13)
    for _ in range(10):
        await asyncio.sleep(0.5)
        if await p.js("!!document.querySelector('#main footer [contenteditable=true]')"):
            return True
    return False


async def read(chat: str, n: int = 15) -> dict:
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            await asyncio.sleep(1.5)
            r = await p.js(f'({JS_MESSAGES})({int(n)})')
    return {'ok': True, **(r or {'messages': []})}


async def send(chat: str, text: str) -> dict:
    text = text.strip()
    if not text:
        return {'ok': False, 'error': 'Message vide.'}
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            title = await p.js("((document.querySelector('#main header span[title], #main header span[dir=\"auto\"]') || {}).innerText || '')")
            await p.js("document.querySelector('#main footer [contenteditable=true]').focus()")
            lines = text.split('\n')
            for i, line in enumerate(lines):
                if line:
                    await p.call('Input.insertText', {'text': line})
                if i < len(lines) - 1:
                    await _key(p, 'Enter', 'Enter', 13, 8)       # Maj+Entrée = retour à la ligne
                await asyncio.sleep(0.2)
            await asyncio.sleep(0.6)
            await _key(p, 'Enter', 'Enter', 13)
            await asyncio.sleep(2)
            last = await p.js(f'({JS_MESSAGES})(1)')
    sent = bool(last and last['messages'] and last['messages'][-1]['me'])
    return {'ok': sent, 'chat': title or chat, **({} if sent else {'error': "Le message n'apparaît pas comme envoyé."})}


async def action(d: dict) -> dict:
    a = str(d.get('action') or 'status')
    if a == 'status':
        return await status()
    if a == 'link_code':
        return await link_code(str(d.get('phone') or ''))
    if a == 'unread':
        return await unread()
    if a == 'read':
        return await read(str(d.get('chat') or ''), int(d.get('n') or 15))
    if a == 'send':
        return await send(str(d.get('chat') or ''), str(d.get('text') or ''))
    return {'ok': False, 'error': f'action inconnue : {a}'}


async def watch(emit) -> None:
    """Boucle : nouveaux messages non lus → emit('cloud:wa_new', {...}). Ne marque rien comme lu."""
    seen: dict[str, str] = {}
    first = True
    was_logged = None
    last_code = None
    while True:
        try:
            if not LOCK.locked():
                async with await _page() as p:
                    s = await p.js(JS_STATE)
                    logged = bool(s['logged'])
                    if logged != was_logged:
                        await emit('cloud:wa_state', {'logged_in': logged})
                        was_logged = logged
                    chats = await p.js(JS_CHATS) if logged else None
                    if not logged and _linking():
                        code = _shown_code(await p.js('document.body.innerText'))
                        if code and code != last_code:
                            last_code = code
                            await emit('cloud:wa_code', {'code': code})
                    if logged and _linking():
                        LINK_FLAG.unlink(missing_ok=True)
                for c in chats or []:
                    key = c['name']
                    sig = f"{c['unread']}|{c['preview']}"
                    if c['unread'] and seen.get(key) != sig and not first:
                        await emit('cloud:wa_new', c)
                    seen[key] = sig if c['unread'] else ''
                if chats is not None:
                    first = False
        except Exception as e:  # onglet rechargé, Chrome relancé… on réessaie au tour suivant
            log.warning('watch: %s', e)
        await asyncio.sleep(5 if _linking() else 20)
