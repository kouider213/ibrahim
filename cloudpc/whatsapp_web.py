"""WhatsApp Business de Kouider dans le Chrome du PC cloud (web.whatsapp.com, appareil connecté) — 2026-10-15.

Dzaryx LIT les messages des clients et RÉPOND seulement après l'accord de Kouider (le backend demande la
confirmation avant d'appeler `send`). Pas d'envoi en masse, pas de premier contact : uniquement des réponses à des
conversations existantes, tapées dans la vraie page comme un humain (limite le risque de blocage du numéro).

- `watch()` : toutes les 20 s, liste les discussions NON LUES (sans les ouvrir : elles restent non lues sur le téléphone)
  et prévient le backend (`cloud:wa_new`) pour chaque nouveau message.
- `action(d)` : status | link_code | unread | read | photos | documents | send | send_file | save_contact — appelé par l'outil `whatsapp_web` du backend.
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
        # La page met parfois > 2 s à afficher le champ du numéro (25/10 : « null.focus ») → on attend jusqu'à 15 s
        for _ in range(15):
            if await _click_text(p, '^(Se connecter|Connecter plutôt) avec un numéro'):
                break
            await asyncio.sleep(1)
        for _ in range(15):
            await asyncio.sleep(1)
            if await p.js("!!document.querySelector('[data-testid=phone-number-input]')"):
                break
        else:
            return {'ok': False, 'error': "Champ du numéro introuvable sur la page WhatsApp."}
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


# Photos reçues dans une discussion (2026-10-22, Kouider : « montre-moi les photos ») : WhatsApp garde déjà l'image
# pleine taille (blob 1500×2000…) dans la bulle, albums compris → on la redessine en JPEG sur un canvas (même origine).
JS_PHOTOS = r"""(async (max) => {
  const seen = new Set();
  const imgs = [...document.querySelectorAll('#main img[src^="blob:"]')].filter(i => i.naturalWidth >= 200 && !seen.has(i.src) && seen.add(i.src)).slice(-max);
  const out = [];
  for (const img of imgs) {
    const m = img.closest('[data-testid^="conv-msg-"], div.message-in, div.message-out') || img.parentElement;
    const R = m.getBoundingClientRect(), r = img.getBoundingClientRect();
    const me = m.classList.contains('message-out') || !!m.querySelector('.message-out') || (!m.querySelector('.message-in') && (R.right - r.right) < (r.left - R.left));
    const cap = [...m.querySelectorAll('span.selectable-text')].filter(s => !s.parentElement.closest('span.selectable-text')).map(s => s.innerText).join(' ').trim();
    const time = ((m.innerText || '').match(/\b(\d{1,2}:\d{2})\s*$/m) || [])[1] || '';
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    out.push({ me, caption: cap.slice(0, 300), time, w: c.width, h: c.height, b64: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
  }
  return out;
})"""

COUNT_PHOTOS = "document.querySelectorAll('#main img[src^=\"blob:\"]').length"


async def photos(chat: str, n: int = 6) -> dict:
    """Les n dernières photos de la discussion (des deux côtés), en JPEG base64 + qui l'a envoyée + heure + légende."""
    n = max(1, min(int(n), 10))
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            title = await p.js("((document.querySelector('#main header span[title], #main header span[dir=\"auto\"]') || {}).innerText || '')")
            last, stable = -1, 0
            for _ in range(20):       # les photos se chargent après la discussion : attendre que leur nombre ne bouge plus
                await asyncio.sleep(0.5)
                cnt = await p.js(COUNT_PHOTOS) or 0
                stable = stable + 1 if cnt == last else 0
                last = cnt
                if stable >= 4:
                    break
            for _ in range(3):        # pas assez de photos à l'écran → on remonte dans la discussion
                if last >= n or not await p.js(JS_SCROLL_UP):
                    break
                await asyncio.sleep(2)
                cnt = await p.js(COUNT_PHOTOS) or 0
                if cnt <= last:
                    break
                last = cnt
            # Photos pas encore téléchargées (miniature floue + bouton ↓) → clic pour les charger
            if await p.js("""(() => { const d = [...document.querySelectorAll('#main [data-icon*="download"]')]; d.forEach(e => (e.closest('[role=button],button') || e).click()); return d.length; })()"""):
                await asyncio.sleep(4)
            out = await p.js(f'({JS_PHOTOS})({n})') or []
    return {'ok': True, 'chat': title or chat, 'photos': out}


VOICE_MARK = r"""((n) => {
  const main = document.querySelector('#main'); if (!main) return [];
  const R = main.getBoundingClientRect(), mid = R.left + R.width / 2;
  const RE = /^(T\u00e9l\u00e9charger le message vocal|Lire le message vocal|Download voice message|Play voice message)/i;
  const rows = [];
  for (const b of main.querySelectorAll('[aria-label]')) {
    if (!RE.test(b.getAttribute('aria-label') || '')) continue;
    const row = b.closest('[data-testid^="conv-msg-"]') || b.closest('[role=row]');
    if (row && !rows.includes(row) && b.getBoundingClientRect().left < mid) rows.push(row);   // à gauche = envoyé par le client
  }
  document.querySelectorAll('[data-dz-voice]').forEach(e => e.removeAttribute('data-dz-voice'));
  return rows.slice(-n).map((r, i) => { r.setAttribute('data-dz-voice', i);
    const c = r.querySelector('[data-pre-plain-text]'); const hm = ((r.innerText || '').match(/\b(\d{1,2}:\d{2})\s*$/m) || [])[1] || '';
    return c ? c.getAttribute('data-pre-plain-text').trim() : hm; });
})"""

# Le son d'un vocal : WhatsApp le joue avec un élément audio hors de la page ; on intercepte play() pour récupérer
# le blob déchiffré (son coupé, lecture arrêtée tout de suite). Le client voit le micro bleu « écouté ».
VOICE_PLAY = r"""((i) => {
  if (!window.__dzHook) { const o = HTMLMediaElement.prototype.play; window.__dzEls = [];
    HTMLMediaElement.prototype.play = function () { try { this.muted = true; window.__dzEls.push(this); } catch (e) {} return o.apply(this, arguments); };
    window.__dzHook = 1; }
  const row = document.querySelector(`[data-dz-voice="${i}"]`); if (!row) return 'gone';
  const dl = [...row.querySelectorAll('[aria-label]')].find(b => /^(T\u00e9l\u00e9charger le message vocal|Download voice message)/i.test(b.getAttribute('aria-label')));
  if (dl) { (dl.closest('button,[role=button]') || dl).click(); return 'downloading'; }
  const pl = [...row.querySelectorAll('[aria-label]')].find(b => /^(Lire le message vocal|Play voice message)/i.test(b.getAttribute('aria-label')));
  if (!pl) return 'wait';
  window.__dzEls = []; (pl.closest('button,[role=button]') || pl).click(); return 'played';
})"""

VOICE_GRAB = r"""(async () => { const e = (window.__dzEls || []).slice(-1)[0]; if (!e) return null;
  try { e.pause(); e.currentTime = 0; } catch (x) {}
  const r = await fetch(e.currentSrc || e.src); const buf = new Uint8Array(await r.arrayBuffer());
  let s = ''; for (let k = 0; k < buf.length; k += 32768) s += String.fromCharCode.apply(null, buf.subarray(k, k + 32768));
  return { mime: (r.headers.get('content-type') || 'audio/ogg').split(';')[0], b64: btoa(s) }; })()"""


async def voice_notes(chat: str, n: int = 1) -> dict:
    """Les n derniers messages VOCAUX du client dans la discussion : son (ogg base64) + heure, pour transcription."""
    n = max(1, min(int(n), 5))
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            metas = []
            for _ in range(12):        # les bulles se chargent après l'ouverture
                await asyncio.sleep(0.6)
                metas = await p.js(f'({VOICE_MARK})({n})') or []
                if metas:
                    break
            out = []
            for i, meta in enumerate(metas):
                got = None
                for _ in range(20):
                    st = await p.js(f'({VOICE_PLAY})({i})')
                    if st == 'played':
                        await asyncio.sleep(1.2)
                        got = await p.js(VOICE_GRAB)
                        break
                    if st == 'gone':
                        break
                    await asyncio.sleep(1)
                if got and got.get('b64'):
                    out.append({'meta': meta, **got})
    return {'ok': True, 'voices': out}


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

DOWNLOADS = Path(os.environ.get('CLOUDPC_DATA', '/root/cloudpc-data')) / 'downloads'


async def _mouse(p: Page, box: dict) -> None:
    for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
        await p.call('Input.dispatchMouseEvent', {'type': t, 'x': box['x'], 'y': box['y'],
                                                  'button': 'none' if t == 'mouseMoved' else 'left', 'clickCount': 1})


async def documents(chat: str, n: int = 3) -> dict:
    """Télécharge les n derniers documents (PDF, Word…) de la discussion dans les Téléchargements du PC cloud.
    WhatsApp ne dessine que les bulles visibles : on remonte la discussion écran par écran depuis le bas.
    Clic sur la bulle → aperçu WhatsApp → « Télécharger » (ou téléchargement direct pour les non-PDF)."""
    n = max(1, min(int(n), 6))
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    got: list[dict] = []
    done: set[str] = set()
    async with LOCK:
        async with await _page() as p:
            if not await _open_chat(p, chat):
                return {'ok': False, 'error': f'Discussion « {chat} » introuvable.'}
            title = await p.js("((document.querySelector('#main header span[title], #main header span[dir=\"auto\"]') || {}).innerText || '')")
            bubbles_js = "document.querySelectorAll('#main [data-testid^=\"conv-msg-\"], #main div.message-in, #main div.message-out').length"
            last, stable = -1, 0
            for _ in range(20):       # la discussion se charge petit à petit (send?phone= recharge l'appli) : bulles stables
                await asyncio.sleep(0.5)
                cnt = await p.js(bubbles_js) or 0
                stable = stable + 1 if cnt == last and cnt > 0 else 0
                last = cnt
                if stable >= 3:
                    break
            scroller = """[...document.querySelectorAll('#main div')].find(d => d.scrollHeight > d.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(d).overflowY))"""
            await p.js(f"(s => s && (s.scrollTop = s.scrollHeight))({scroller})")
            for _step in range(15):
                await asyncio.sleep(1.2)
                docs = await p.js(r"""(() => { const mid = (document.querySelector('#main') || document.body).getBoundingClientRect();
                  return [...document.querySelectorAll('#main [role=button]')].filter(e => e.querySelector('[data-icon^="document-"]')).map(e => {
                    const r = e.getBoundingClientRect(), b = e.closest('[data-testid^="conv-msg-"], .message-in, .message-out') || e;
                    return { key: (b.getAttribute('data-testid') || '') + '|' + (e.innerText || ''), label: (e.innerText || '').split('\n').slice(0, 3).join(' · '),
                             me: b.classList.contains('message-out') || (r.left + r.width / 2) > (mid.left + mid.width / 2) }; }).reverse(); })()""") or []
                for d in docs:
                    if len(got) >= n or d['key'] in done:
                        continue
                    done.add(d['key'])
                    box = await p.js(f"""(() => {{ const e = [...document.querySelectorAll('#main [role=button]')].filter(e => e.querySelector('[data-icon^="document-"]'))
                      .find(e => ((e.closest('[data-testid^="conv-msg-"], .message-in, .message-out') || e).getAttribute('data-testid') || '') + '|' + (e.innerText || '') === {json.dumps(d['key'])});
                      if (!e) return null; e.scrollIntoView({{ block: 'center' }}); const r = e.getBoundingClientRect(); return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()""")
                    if not box:
                        continue
                    before = {f.name for f in DOWNLOADS.iterdir()}
                    await asyncio.sleep(0.6)
                    await _mouse(p, box)
                    new = None
                    for _ in range(30):
                        await asyncio.sleep(1)
                        fresh = [f for f in DOWNLOADS.iterdir() if f.name not in before and not f.name.endswith(('.crdownload', '.part', '.tmp'))]
                        if fresh:
                            new = fresh[0]
                            break
                        dl = await p.js("""(() => { const e = [...document.querySelectorAll('[aria-label="Télécharger"], [aria-label="Download"]')].find(e => e.getBoundingClientRect().width > 0);
                          if (!e) return null; const b = e.closest('button, [role=button]') || e; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()""")
                        if dl:
                            await _mouse(p, dl)
                            await asyncio.sleep(1.5)
                    await _key(p, 'Escape', 'Escape', 27)   # ferme l'aperçu
                    await asyncio.sleep(0.8)
                    if new:
                        for _ in range(20):              # taille stable = téléchargement fini
                            a = new.stat().st_size
                            await asyncio.sleep(0.7)
                            if a and a == new.stat().st_size:
                                break
                        got.append({'file': new.name, 'label': d['label'], 'me': bool(d['me']), 'size': new.stat().st_size})
                if len(got) >= n:
                    break
                top = await p.js(f"(s => {{ if (!s) return true; const t = s.scrollTop; s.scrollTop = Math.max(0, t - s.clientHeight * 0.8); return t <= 0; }})({scroller})")
                if top:
                    break
    return {'ok': True, 'chat': title or chat, 'documents': got, 'found': len(done)}


# Indicatif → nom du pays dans la liste de WhatsApp Web (français)
COUNTRIES = {'33': 'France', '213': 'Algérie', '32': 'Belgique', '212': 'Maroc', '216': 'Tunisie', '34': 'Espagne',
             '44': 'Royaume-Uni', '49': 'Allemagne', '39': 'Italie', '31': 'Pays-Bas', '41': 'Suisse', '1': 'Canada', '971': 'Émirats'}


async def save_contact(phone: str, first: str, last: str = '', dry: bool = False) -> dict:
    """Ajoute un contact au carnet de WhatsApp (synchronisé sur le téléphone) : Nouvelle discussion → Nouveau contact.
    phone = numéro international (+33…, +213…). dry=True : remplit le formulaire puis annule (test)."""
    digits = ''.join(ch for ch in phone if ch.isdigit())
    code = next((c for c in sorted(COUNTRIES, key=len, reverse=True) if digits.startswith(c)), None)
    if not code or len(digits) < 9:
        return {'ok': False, 'error': f'Numéro international attendu (+33…, +213…) : {phone}'}
    national = digits[len(code):]
    async with LOCK:
        async with await _page() as p:
            async def back():
                await _key(p, 'Escape', 'Escape', 27)
                for _ in range(2):
                    await asyncio.sleep(0.8)
                    await p.js("(document.querySelector('#side [aria-label=\"Retour\"], [aria-label=\"Retour\"]') || {click(){}}).click()")
            await p.js("""(document.querySelector('[aria-label="Nouvelle discussion"], [aria-label="New chat"]') || {click(){}}).click()""")
            await asyncio.sleep(1.5)
            if not await p.js("""(() => { const el = [...document.querySelectorAll('[role=button], [role=listitem], div[tabindex]')]
                .find(e => /^(Nouveau contact|New contact)$/.test((e.innerText || '').trim().split('\\n')[0])); if (el) el.click(); return !!el; })()"""):
                await back()
                return {'ok': False, 'error': 'Bouton « Nouveau contact » introuvable (page WhatsApp changée ?).'}
            await asyncio.sleep(2)
            # Pays : clic sur « BE +32 », recherche du pays, clic sur la ligne « France +33 »
            await p.js("""(() => { const b = [...document.querySelectorAll('button, [role=button]')].find(b => /^[A-Z]{2} \\+\\d+$/.test((b.innerText || '').trim())); if (b) b.click(); })()""")
            await asyncio.sleep(1.2)
            # la recherche de pays (zone de texte) a déjà le focus à l'ouverture de la liste
            await p.call('Input.insertText', {'text': COUNTRIES[code]})
            await asyncio.sleep(1.5)
            box = await p.js(f"""(() => {{ const end = {json.dumps('+' + code)};
              const el = [...document.querySelectorAll('[role=listbox] div[tabindex]')].filter(e => e.getBoundingClientRect().width > 0)
                .find(e => (e.innerText || '').trim().replace(/\\s+/g, ' ').endsWith(end));
              if (!el) return null; el.scrollIntoView({{ block: 'center' }}); const r = el.getBoundingClientRect();
              return {{ x: r.x + r.width / 2, y: r.y + r.height / 2 }}; }})()""")
            picked = bool(box)
            if box:   # vrai clic de souris (un clic JS ne choisit pas le pays)
                for t in ('mouseMoved', 'mousePressed', 'mouseReleased'):
                    await p.call('Input.dispatchMouseEvent', {'type': t, 'x': box['x'], 'y': box['y'],
                                                              'button': 'none' if t == 'mouseMoved' else 'left', 'clickCount': 1})
            await asyncio.sleep(1)
            country = await p.js("""(([...document.querySelectorAll('button, [role=button]')].find(b => /^[A-Z]{2} \\+\\d+$/.test((b.innerText || '').trim())) || {}).innerText || '').trim()""")
            if not picked or not country.endswith('+' + code):
                await back()
                return {'ok': False, 'error': f'Pays +{code} pas sélectionné (affiché : {country or "?"}).'}
            for label, text in (('Prénom', first), ('Nom', last), ):
                if text.strip():
                    await p.js(f"document.querySelector('[aria-label={json.dumps(label)}]').focus()")
                    await p.call('Input.insertText', {'text': text.strip()})
            await p.js("document.querySelector('input[aria-label=\"Numéro de téléphone\"]').focus()")
            await p.call('Input.insertText', {'text': national})
            await asyncio.sleep(2.5)
            await p.js("""(() => { const c = document.querySelector('input[type=checkbox][aria-label*="Synchroniser"]'); if (c && !c.checked) c.click(); })()""")
            await asyncio.sleep(0.8)
            state = await p.js("""(() => ({
              sync: !!(document.querySelector('input[type=checkbox][aria-label*="Synchroniser"]') || {}).checked,
              notes: document.body.innerText.split('\\n').filter(t => /valide|déjà|already|n.est pas sur WhatsApp|not on WhatsApp|est sur WhatsApp|is on WhatsApp/i.test(t)).slice(0, 4),
              save: [...document.querySelectorAll('button, [role=button]')].filter(b => b.getBoundingClientRect().width > 0)
                .map(b => ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).trim()).filter(t => /enregistrer|save/i.test(t)),
            }))()""")
            if dry:
                await back()
                return {'ok': True, 'dry': True, 'country': country, 'national': national, **state}
            clicked = await p.js("""(() => { const b = [...document.querySelectorAll('button, [role=button]')].filter(b => b.getBoundingClientRect().width > 0)
                .find(b => [b.getAttribute('aria-label') || '', b.innerText || ''].some(t => /^(enregistrer( le contact)?|save( contact)?)$/i.test(t.trim())));
              if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true; })()""")
            if not clicked:
                await back()
                return {'ok': False, 'error': 'Bouton Enregistrer indisponible : ' + ' / '.join(state.get('notes') or ['numéro refusé ?'])}
            await asyncio.sleep(3)
            still = await p.js("!!document.querySelector('input[aria-label=\"Numéro de téléphone\"]')")
            if still:
                notes = await p.js("document.body.innerText.split('\\n').filter(t => /valide|déjà|already|erreur|error/i.test(t)).slice(0, 3)")
                await back()
                return {'ok': False, 'error': 'Contact pas enregistré : ' + (' / '.join(notes or []) or 'raison inconnue')}
            await back()
            return {'ok': True, 'name': f'{first} {last}'.strip(), 'phone': '+' + digits, 'synced': state.get('sync')}


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
    if a == 'photos':
        return await photos(str(d.get('chat') or ''), int(d.get('n') or 6))
    if a == 'send_file':
        return await send_file(str(d.get('chat') or ''), str(d.get('path') or ''), str(d.get('caption') or ''))
    if a == 'voice_notes':
        return await voice_notes(str(d.get('chat') or ''), int(d.get('n') or 1))
    if a == 'documents':
        return await documents(str(d.get('chat') or ''), int(d.get('n') or 3))
    if a == 'save_contact':
        return await save_contact(str(d.get('phone') or ''), str(d.get('first') or ''), str(d.get('last') or ''), bool(d.get('dry')))
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
