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

from cdp import Page, cdp_json

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
    // Coches ✓/✓✓ devant l'aperçu = le dernier message vient de NOUS (ex. message d'accueil auto WhatsApp Business)
    const st = r.querySelector('[data-testid="last-msg-status"]');
    const out = !!st && [...st.querySelectorAll('svg title, [data-icon]')]
      .some(e => /ic-(read|delivered|sent|pending|check|dblcheck|clock)|msg-(check|dblcheck|time)|status-(check|dblcheck|time)/i.test(e.getAttribute('data-icon') || e.textContent || ''));
    return { name, preview, unread: n, time, out };
  }).filter(c => c.name);
})()"""

JS_MESSAGES = r"""((max) => {
  const main = document.querySelector('#main');
  if (!main) return null;
  const title = (main.querySelector('header span[title], header span[dir="auto"]') || {}).innerText || '';
  // Ancien DOM : div.message-in/out ; nouveau DOM (2026-10) : [data-testid^=conv-msg-], envoyé = coche msg-check/dblcheck/time ou tail-out
  let rows = [...main.querySelectorAll('div.message-in, div.message-out')];
  if (!rows.length) rows = [...main.querySelectorAll('[data-testid^="conv-msg-"]')];
  // Séparateurs de date (« 13/07/2026 », « mardi », « hier », « aujourd'hui ») : date des bulles sans en-tête
  const DATE_RE = /^(aujourd’hui|aujourd'hui|hier|today|yesterday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}\/\d{1,2}\/\d{4})$/i;
  const seps = [...main.querySelectorAll('div, span')].filter(d => !d.children.length || d.children.length === 1 && !d.children[0].children.length)
    .filter(d => DATE_RE.test((d.innerText || '').trim()));
  const dayOf = m => { let day = ''; for (const d of seps) { if (d.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) day = d.innerText.trim(); } return day; };
  // Qui a envoyé ? La bulle est collée à droite = nous (FIK), à gauche = le client. Les icônes (coches, queue) ne sont
  // que sur la 1re bulle d'une série, d'où des messages à nous pris pour ceux du client.
  const isMe = m => {
    if (m.classList.contains('message-out') || m.querySelector('.message-out')) return true;
    if (m.classList.contains('message-in') || m.querySelector('.message-in')) return false;
    const R = m.getBoundingClientRect();
    const b = [...m.querySelectorAll('div')].find(d => d.innerText && d.getBoundingClientRect().width > 0 && d.getBoundingClientRect().width < R.width * 0.8);
    if (b) { const r = b.getBoundingClientRect(); return (R.right - r.right) < (r.left - R.left); }
    return !!m.querySelector('[data-icon="tail-out"], [data-icon^="msg-check"], [data-icon^="msg-dblcheck"], [data-icon^="msg-time"]');
  };
  // Bulles seulement (pas la notice « chiffrés de bout en bout » ni les bandeaux système)
  rows = rows.filter(m => m.classList.contains('message-in') || m.classList.contains('message-out')
    || m.querySelector('[data-icon="tail-in"], [data-icon="tail-out"], [data-pre-plain-text]') || /\b\d{1,2}:\d{2}\s*$/.test(m.innerText || '') || !(m.innerText || '').trim());   // vide = pièce jointe pas encore affichée
  return { chat: title, total: rows.length, messages: rows.slice(-max).map(m => {
    const c = m.querySelector('[data-pre-plain-text]');
    let meta = c ? c.getAttribute('data-pre-plain-text').trim() : '';
    const hm = ((m.innerText || '').match(/\b(\d{1,2}:\d{2})\s*$/m) || [])[1] || '';
    if (!meta && hm) meta = `[${hm}, ${dayOf(m)}]`;
    if (m.querySelector('[data-icon="recalled"]')) return { me: isMe(m), meta, kind: 'supprimé', text: '[message supprimé par son auteur]' };
    // Texte : seulement les spans « racines » (sinon les listes à puces sont doublées)
    const spans = [...m.querySelectorAll('span.selectable-text')].filter(s => !s.parentElement.closest('span.selectable-text'));
    let text = spans.map(s => s.innerText).join('\n').trim();
    const links = [...m.querySelectorAll('a[href^="http"]')].map(a => a.href).filter((h, i, l) => l.indexOf(h) === i);
    const quoted = (m.querySelector('[data-testid="quoted-message"], [aria-label*="Message cité"], [aria-label*="Quoted"]') || {}).innerText || '';
    let kind = '';
    if (m.querySelector('audio, [data-icon*="audio"], [data-icon*="ptt"]')) kind = 'message vocal';
    else if (m.querySelector('[data-icon*="document"], [data-testid*="document"]')) kind = 'document';
    else if (m.querySelector('img[src^="blob:"], [data-testid*="image"]')) kind = 'photo';
    else if (m.querySelector('video, [data-icon*="video"]')) kind = 'vidéo';
    if (!text && kind === 'document') text = (m.innerText || '').split('\n').map(l => l.trim()).filter(l => l && !/^\d{1,2}:\d{2}$/.test(l)).slice(0, 2).join(' — ');
    if (!text && links.length) text = links.join(' ');
    return { me: isMe(m),
      meta, kind, text: text ? (kind ? `[${kind}] ${text}` : text) : `[${kind || 'pièce jointe'}]`,
      ...(links.length && text.indexOf(links[0]) < 0 ? { links } : {}), ...(quoted ? { reply_to: quoted.slice(0, 200) } : {}) };
  }) };
})"""

# Remonte dans la discussion pour charger les anciens messages (WhatsApp n'affiche que les derniers)
JS_SCROLL_UP = r"""(() => {
  const main = document.querySelector('#main');
  if (!main) return false;
  const sc = [...main.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(d).overflowY));
  if (!sc) return false;
  sc.scrollTop = 0;
  return true;
})()"""


async def _page():
    # Un seul onglet WhatsApp : avec deux, chacun reprend la main (« ouvert dans une autre fenêtre ») et coupe l'autre en plein envoi
    try:
        tabs = [t for t in cdp_json('/json/list') if t['type'] == 'page' and t['url'].startswith('https://web.whatsapp.com')]
        for t in sorted(tabs, key=lambda t: t['id'])[1:]:
            cdp_json(f"/json/close/{t['id']}")
    except Exception as e:
        log.warning('onglets WhatsApp en double : %s', e)
    return _UseHere('https://web.whatsapp.com', URL)


class _UseHere(Page):
    """Page WhatsApp qui clique tout seul sur « Utiliser ici » si WhatsApp s'est cru ouvert ailleurs."""
    async def __aenter__(self):
        await super().__aenter__()
        if await self.js("!![...document.querySelectorAll('button, div[role=button]')].find(b => /^(Utiliser ici|Use here)$/i.test((b.innerText || '').trim()))"):
            await self.js("[...document.querySelectorAll('button, div[role=button]')].find(b => /^(Utiliser ici|Use here)$/i.test((b.innerText || '').trim())).click()")
            for _ in range(30):
                await asyncio.sleep(1)
                if await self.js("!!document.querySelector('#pane-side')"):
                    break
        return self


def _shown_code(text: str) -> str | None:
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
    title_js = "((document.querySelector('#main header span[title], #main header span[dir=auto]') || {}).innerText || '')"
    want = chat.lower()

    async def opened() -> bool:   # la BONNE discussion est ouverte (pas celle d'avant, restée affichée)
        t = (await p.js(title_js) or '').lower()
        return bool(t) and (t == want or want in t) and await p.js("!!document.querySelector('#main footer [contenteditable=true]')")

    if await opened():
        return True
    box = await p.js(f"""(() => {{ const want = {json.dumps(want)};
      const span = [...document.querySelectorAll('#pane-side span[title]')].find(s => (s.getAttribute('title') || '').toLowerCase() === want)
        || [...document.querySelectorAll('#pane-side span[title]')].find(s => (s.getAttribute('title') || '').toLowerCase().includes(want));
      if (!span) return null;
      const row = span.closest('[role="listitem"], [role="row"]') || span;
      row.scrollIntoView({{ block: 'center' }});
      const r = row.getBoundingClientRect();
      return {{ x: r.left + r.width / 2, y: r.top + r.height / 2 }}; }})()""")
    if box:   # vrai clic de souris (un clic JS n'ouvre pas toujours la discussion)
        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
            await p.call('Input.dispatchMouseEvent', {'type': t, 'x': box['x'], 'y': box['y'],
                                                      'button': 'none' if t == 'mouseMoved' else 'left', 'clickCount': 1})
        for _ in range(10):
            await asyncio.sleep(0.5)
            if await opened():
                return True
    # Recherche (discussion hors écran)
    await p.js("(document.querySelector('#side [contenteditable=true]') || document.querySelector('#side input')).focus()")
    await _key(p, 'a', 'KeyA', 65, 2)
    await _key(p, 'Backspace', 'Backspace', 8)
    await p.call('Input.insertText', {'text': chat})
    await asyncio.sleep(2.5)
    await _key(p, 'Enter', 'Enter', 13)
    for _ in range(10):
        await asyncio.sleep(0.5)
        if await opened():
            return True
    return False


async def read(chat: str, n: int = 15) -> dict:
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            count_js = "document.querySelectorAll('#main [data-testid^=\"conv-msg-\"], #main div.message-in, #main div.message-out').length"
            last, stable = -1, 0
            for _ in range(16):       # la discussion se charge petit à petit : on attend que le nombre de bulles ne bouge plus
                await asyncio.sleep(0.5)
                cnt = await p.js(count_js) or 0
                stable = stable + 1 if cnt == last and cnt > 0 else 0
                last = cnt
                if stable >= 3:
                    break
            r = await p.js(f'({JS_MESSAGES})({int(n)})')
            flat = 0
            for _ in range(8):        # pas assez de messages chargés → on remonte (anciens messages)
                if not r or r.get('total', 0) >= n or not await p.js(JS_SCROLL_UP):
                    break
                await asyncio.sleep(1.5)
                before = r.get('total', 0)
                r = await p.js(f'({JS_MESSAGES})({int(n)})')
                flat = flat + 1 if r and r.get('total', 0) <= before else 0
                if flat >= 2:          # début de la discussion atteint
                    break
            # Bulles vides = pièces jointes pas encore dessinées (hors écran) → on les fait défiler à l'écran puis on relit
            for i in range(10):
                shown = await p.js(f"""(() => {{ const e = [...document.querySelectorAll('#main [data-testid^="conv-msg-"]')]
                  .slice(-{int(n)}).filter(m => !(m.innerText || '').trim())[{i}]; if (!e) return false;
                  e.scrollIntoView({{ block: 'center' }}); return true; }})()""")
                if not shown:
                    break
                await asyncio.sleep(0.6)
            if i:
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


MEDIA = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.3gp', '.mkv', '.webm', '.avi'}


async def send_file(chat: str, path: str, caption: str = '') -> dict:
    """Envoie un fichier du PC cloud (photo/vidéo → « Photos et vidéos », le reste → « Document ») avec une légende.
    Le sélecteur de fichiers de Chrome est intercepté (CDP) : aucune fenêtre ne s'ouvre."""
    f = Path(path)
    if not f.is_file():
        return {'ok': False, 'error': f'Fichier introuvable : {f.name}'}
    if f.stat().st_size > 2000 * 1024 * 1024:
        return {'ok': False, 'error': 'Fichier trop gros pour WhatsApp (2 Go max).'}
    media = f.suffix.lower() in MEDIA
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            title = await p.js("((document.querySelector('#main header span[title], #main header span[dir=\"auto\"]') || {}).innerText || '')")
            await asyncio.sleep(4)   # la discussion vient d'être (re)chargée : laisser WhatsApp finir de se synchroniser
            # Le clic sur l'entrée du menu crée un <input type=file> caché ; on le remplit directement (CDP), sans fenêtre
            label = '^(Photos et vidéos|Photos & videos)$' if media else '^(Document)$'
            for _ in range(3):
                if not await p.js("""(() => { const b = document.querySelector('#main footer [aria-label="Joindre"], #main footer [aria-label="Attach"]');
                    if (b) b.click(); return !!b; })()"""):
                    await asyncio.sleep(2)
                    continue
                await asyncio.sleep(1.2)
                if await p.js(f"""(() => {{ const re = new RegExp({json.dumps(label)}, 'i');
                    const el = [...document.querySelectorAll('[role=menuitem], li, [role=button]')].find(e => re.test((e.getAttribute('aria-label') || e.innerText || '').trim()));
                    if (el) el.click(); return !!el; }})()"""):
                    break
                await asyncio.sleep(1)
            else:
                return {'ok': False, 'error': 'Menu « Joindre → Photos et vidéos / Document » introuvable (page WhatsApp changée ?).'}
            pick = ("(i => /video/.test(i.accept))" if media else "(i => !/video/.test(i.accept) && i.accept !== 'image/*')")
            obj = None
            for _ in range(10):
                await asyncio.sleep(0.5)
                r = await p.call('Runtime.evaluate', {'expression': f"[...document.querySelectorAll('input[type=file]')].reverse().find({pick}) || null"})
                obj = r.get('result', {}).get('objectId')
                if obj:
                    break
            if not obj:
                return {'ok': False, 'error': 'Champ fichier WhatsApp introuvable (page changée ?).'}
            await p.call('DOM.setFileInputFiles', {'files': [str(f.resolve())], 'objectId': obj})
            # Aperçu : attendre le bouton Envoyer, taper la légende, envoyer
            send_js = """(() => { const b = [...document.querySelectorAll('[aria-label="Envoyer"], [aria-label="Send"], [data-icon="send"], [data-icon="wds-ic-send-filled"]')]
                .map(e => e.closest('[role=button],button') || e).find(e => !e.closest('#main footer'));
              if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()"""
            for _ in range(60):
                await asyncio.sleep(1)
                if await p.js("!![...document.querySelectorAll('[aria-label=\"Envoyer\"], [aria-label=\"Send\"], [data-icon=send], [data-icon=wds-ic-send-filled]')].find(e => !e.closest('#main footer'))"):
                    break
            else:
                return {'ok': False, 'error': "L'aperçu d'envoi ne s'est pas ouvert (fichier refusé par WhatsApp ?)."}
            if caption.strip():
                await asyncio.sleep(0.8)
                await p.js("""(() => { const a = document.activeElement; if (a && a.isContentEditable) return true;
                    const c = [...document.querySelectorAll('[contenteditable=true]')].find(e => !e.closest('#main footer') && !e.closest('#side'));
                    if (c) c.focus(); return !!c; })()""")
                for i, line in enumerate(caption.strip().split('\n')):
                    if i:
                        await _key(p, 'Enter', 'Enter', 13, 8)
                    if line:
                        await p.call('Input.insertText', {'text': line})
                await asyncio.sleep(0.5)
        # Nouvelle connexion à l'onglet pour cliquer : dans la même session CDP que la pose du fichier,
        # WhatsApp ignore le clic sur Envoyer (constaté le 2026-10-15)
        async with await _page() as p:
                if not await p.js(send_js):
                    return {'ok': False, 'error': 'Bouton Envoyer introuvable dans l\'aperçu.'}
                # Vrai clic souris (un .click() JS n'envoie pas) ; jusqu'à 3 essais puis Entrée.
                # Envoyé = l'aperçu se ferme (WhatsApp termine ensuite le chargement tout seul, même pour une vidéo)
                for attempt in range(4):
                    await asyncio.sleep(2)
                    box = await p.js(send_js)
                    if not box:
                        return {'ok': True, 'chat': title or chat, 'file': f.name}
                    if attempt < 3:
                        for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
                            await p.call('Input.dispatchMouseEvent', {'type': t, 'x': box['x'], 'y': box['y'], 'button': 'none' if t == 'mouseMoved' else 'left', 'clickCount': 1})
                    else:
                        await _key(p, 'Enter', 'Enter', 13)
                await asyncio.sleep(2)
                if not await p.js(send_js):
                    return {'ok': True, 'chat': title or chat, 'file': f.name}
    return {'ok': False, 'error': "Le fichier n'apparaît pas encore comme envoyé (vérifie sur le téléphone)."}


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
    if a == 'send_file':
        return await send_file(str(d.get('chat') or ''), str(d.get('path') or ''), str(d.get('caption') or ''))
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
