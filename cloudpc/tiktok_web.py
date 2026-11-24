"""TikTok de FIK (fik_conciergerie) dans le Chrome du PC cloud — 24/11/2026, demande de Kouider.

LECTURE SEULE : Dzaryx ne répond jamais sur TikTok et n'ouvre aucune discussion (elles restent « non lues » sur son téléphone).
Toutes les ~8 min : liste des messages privés (Suite entreprise) + onglet Activité → Commentaires.
Chaque nouveau message client / commentaire → `cloud:tt_new` → backend tiktok-web.ts → fiche 🎵 TikTok dans DEMANDES + Telegram.
Puzzle anti-robot ou déconnexion → `cloud:tt_state` (le backend prévient Kouider ; on ne contourne jamais le puzzle).

24/11 : `action({'action': 'publish', url, caption})` = publier UNE pub vidéo que Kouider a validée (bouton « Publier sur TikTok »).
Seul geste d'écriture sur TikTok, toujours déclenché par son choix explicite. dry=True : tout remplir puis supprimer (test).
"""
import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

import aiohttp

from cdp import Page, cdp_json

log = logging.getLogger('cloudpc.tt')
URL = 'https://www.tiktok.com/messages?allow_label=true&lang=fr&scene=business'
SEEN = Path(os.environ.get('CLOUDPC_DATA', '/root/cloudpc-data')) / 'tt_seen.json'
EVERY = 8 * 60
LOCK = asyncio.Lock()   # lecture et publication partagent l'onglet TikTok
UPLOAD = 'https://www.tiktok.com/tiktokstudio/upload?from=webapp&lang=fr'
UP_DIR = SEEN.parent / 'tiktok-up'

JS_DMS = r"""(() => [...document.querySelectorAll('[data-e2e=dm-new-conversation-item]')].map(e => {
  const name = ((e.querySelector('[data-e2e=dm-new-conversation-nickname]') || {}).innerText || '').trim();
  const unread = parseInt(((e.querySelector('[data-e2e=dm-new-conversation-unread]') || {}).innerText || '0').trim(), 10) || 0;
  const lines = (e.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const time = lines.find(l => /^\d{1,2}:\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$|^hier$|^\d{1,2}-\d{1,2}$/i.test(l)) || '';
  const text = lines.filter(l => l !== name && l !== time && l !== String(unread)).join(' ');
  return { name, text, time, unread };
}).filter(c => c.name))()"""

JS_STATE = r"""(() => ({
  href: location.href,
  logged: !/\/login/.test(location.href) && !!document.querySelector('[data-e2e=inbox-icon], [data-e2e=dm-new-conversation-list]'),
  captcha: /Drag the slider|fit the puzzle|Faites glisser|Fais glisser|puzzle/i.test(document.body ? document.body.innerText : ''),
}))()"""

# Activité → Commentaires : [data-e2e=inbox-list-item] = pseudo (inbox-title) + « a commenté : … · 9-26 » (inbox-content) + lien vidéo
JS_COMMENTS = r"""(() => [...document.querySelectorAll('[data-e2e=inbox-list] [data-e2e=inbox-list-item]')].map(r => {
  const name = ((r.querySelector('[data-e2e=inbox-title]') || {}).innerText || '').trim();
  const raw = ((r.querySelector('[data-e2e=inbox-content]') || {}).innerText || '').trim();
  const m = raw.match(/^(?:a commenté|commented|a répondu à ton commentaire|a répondu|replied to your comment|replied)\s*:\s*([\s\S]*?)\s*·\s*([^·]+)$/i);
  if (!name || !m) return null;   // « a aimé », mentions… : pas des commentaires
  const a = [...r.querySelectorAll('a[href*="/video/"]')].pop();
  const video = a ? a.getAttribute('href').split('/video/')[1].split('?')[0] : '';
  return { name, text: m[1].trim(), time: m[2].trim(), video };
}).filter(x => x && x.text))()"""


def _load() -> dict:
    try:
        return json.loads(SEEN.read_text())
    except Exception:
        return {}


def _save(seen: dict) -> None:
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    keep = dict(sorted(seen.items(), key=lambda kv: kv[1])[-2000:])
    SEEN.write_text(json.dumps(keep, ensure_ascii=False))


def _when(t: str) -> str | None:
    """Date TikTok de la liste (« 16:46 », « 23/10/2026 ») → ISO, pour la reprise de l'historique."""
    now = datetime.now()
    try:
        if ':' in t:
            h, m = t.split(':')
            return now.replace(hour=int(h), minute=int(m), second=0, microsecond=0).isoformat()
        if t.count('/') == 2:
            d, mo, y = t.split('/')
            return datetime(int(y), int(mo), int(d), 12).isoformat()
        if len(t) <= 5 and t.count('-') == 1:   # commentaires : « 9-26 » = 26 septembre (année en cours, sinon l'an dernier)
            mo, d = t.split('-')
            dt = datetime(now.year, int(mo), int(d), 12)
            return (dt if dt <= now + timedelta(days=1) else dt.replace(year=now.year - 1)).isoformat()
        rel = __import__('re').match(r'(\d+)\s*(min|m|h|j|d)\b', t.lower().replace('il y a ', ''))
        if rel:
            n, u = int(rel.group(1)), rel.group(2)
            return (now - (timedelta(minutes=n) if u in ('min', 'm') else timedelta(hours=n) if u == 'h' else timedelta(days=n))).isoformat()
        if t.lower() == 'hier':
            return (now - timedelta(days=1)).replace(hour=12).isoformat()
    except ValueError:
        pass
    return None


async def _dismiss(p: Page) -> None:
    """Bannière cookies (shadow DOM) + fenêtre « Outils professionnels débloqués »."""
    await p.js(r"""(() => {
      const b = document.querySelector('tiktok-cookie-banner');
      const d = b && b.shadowRoot ? [...b.shadowRoot.querySelectorAll('button')].find(x => /Décliner|Decline/i.test(x.innerText)) : null;
      if (d) d.click();
    })()""")


async def scan(emit, first: bool) -> None:
    async with LOCK:
        await _scan(emit, first)


async def _scan(emit, first: bool) -> None:
    async with Page('https://www.tiktok.com', URL) as p:
        await p.call('Page.navigate', {'url': URL})
        await asyncio.sleep(12)
        await _dismiss(p)
        st = await p.js(JS_STATE) or {}
        if not st.get('logged'):
            await emit('cloud:tt_state', {'logged_in': False})
            log.warning('TikTok non connecté (%s)', st.get('href'))
            return
        if st.get('captcha'):
            await emit('cloud:tt_state', {'logged_in': True, 'captcha': True})
        seen = _load()
        dms = await p.js(JS_DMS) or []
        cutoff = datetime.now() - timedelta(days=45)
        for c in dms:
            key = f"dm|{c['name']}|{c['text'][:120]}"
            if key in seen:
                continue
            seen[key] = datetime.now().isoformat()
            if not c['unread']:
                continue   # pas de pastille = déjà lu / dernier message = notre réponse
            at = _when(c['time'])
            if first and (not at or datetime.fromisoformat(at) < cutoff):
                continue
            await emit('cloud:tt_new', {'kind': 'dm', 'name': c['name'], 'text': c['text'], 'time': c['time'],
                                        'unread': c['unread'], 'backfill': first, 'at': at if first else None})
        # Activité → Commentaires (sans ouvrir aucune vidéo)
        try:
            await p.js("document.querySelector('[data-e2e=inbox-icon]').click()")
            await asyncio.sleep(4)
            await p.js("document.querySelector('[data-e2e=comments]').click()")
            await asyncio.sleep(6)
            for c in await p.js(JS_COMMENTS) or []:
                key = f"cm|{c['name']}|{c['text'][:120]}"
                if key in seen:
                    continue
                seen[key] = datetime.now().isoformat()
                at = _when(c['time'])
                age = (datetime.now() - datetime.fromisoformat(at)).days if at else 0
                if age > 45:
                    continue
                # vieux commentaire (reprise / liste qui remonte) : dans DEMANDES mais pas de Telegram
                await emit('cloud:tt_new', {'kind': 'comment', 'name': c['name'], 'text': c['text'], 'time': c['time'],
                                            'video': c['video'], 'backfill': first or age > 2, 'at': at})
        except Exception as e:
            log.info('commentaires TikTok illisibles : %s', e)
        _save(seen)
        log.info('TikTok : %d discussions lues', len(dms))


async def watch(emit) -> None:
    await asyncio.sleep(60)
    while True:
        try:
            await scan(emit, first=not SEEN.exists())
        except Exception as e:
            log.warning('TikTok : %s', e)
        await asyncio.sleep(EVERY + random.randint(0, 120))


# ── Publication d'une pub validée par Kouider ─────────────────────────────────────

async def _key(p: Page, k: str, code: str, vk: int) -> None:
    for t in ('rawKeyDown', 'keyUp'):
        await p.call('Input.dispatchKeyEvent', {'type': t, 'key': k, 'code': code, 'windowsVirtualKeyCode': vk})


async def _shot(p: Page) -> str:
    import base64
    try:
        return base64.b64encode(await p.screenshot()).decode()
    except Exception:
        return ''


async def publish(url: str, caption: str, dry: bool = False) -> dict:
    UP_DIR.mkdir(parents=True, exist_ok=True)
    f = UP_DIR / f'pub-{int(time.time())}.mp4'
    async with aiohttp.ClientSession() as http:
        async with http.get(url, timeout=aiohttp.ClientTimeout(total=180)) as r:
            if r.status != 200:
                return {'ok': False, 'error': f'vidéo introuvable ({r.status})'}
            f.write_bytes(await r.read())
    try:
        async with LOCK:
            # Onglet NEUF, fermé à la fin : la page d'import gelait l'onglet partagé (24/11, essai à blanc)
            for t in cdp_json('/json/list'):
                if t['type'] == 'page' and '/tiktokstudio/upload' in t['url']:
                    cdp_json(f"/json/close/{t['id']}")
            cdp_json('/json/new?' + UPLOAD, 'PUT')
            await asyncio.sleep(2)
            async with Page('https://www.tiktok.com/tiktokstudio/upload', UPLOAD) as p:
                p.activate()
                tab = p.target
                await asyncio.sleep(10)
                await _dismiss(p)
                st = await p.js(JS_STATE) or {}
                if '/login' in str(st.get('href')):
                    return {'ok': False, 'error': 'TikTok déconnecté du PC cloud'}
                if st.get('captcha'):
                    return {'ok': False, 'error': 'puzzle anti-robot TikTok à faire sur MON PC'}
                await p.call('DOM.enable')
                doc = await p.call('DOM.getDocument', {'depth': -1, 'pierce': True})
                q = await p.call('DOM.querySelector', {'nodeId': doc['root']['nodeId'], 'selector': 'input[type=file]'})
                if not q.get('nodeId'):
                    return {'ok': False, 'error': "page d'import TikTok introuvable", 'shot': await _shot(p)}
                await p.call('DOM.setFileInputFiles', {'nodeId': q['nodeId'], 'files': [str(f)]})
                # import terminé = « Importé » affiché et bouton Publier actif
                for _ in range(100):
                    await asyncio.sleep(3)
                    ready = await p.js("""(() => { const b = document.querySelector('[data-e2e=post_video_button]');
                      return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' && /Importé|Uploaded/i.test(document.body.innerText)
                        && !!document.querySelector('.public-DraftEditor-content'); })()""")
                    if ready:
                        break
                else:
                    return {'ok': False, 'error': "l'import de la vidéo sur TikTok n'a pas fini (5 min)", 'shot': await _shot(p)}
                await p.js("[...document.querySelectorAll('button')].filter(b => /^(Annuler|J'ai compris)$/.test(b.innerText.trim())).forEach(b => b.click())")
                await asyncio.sleep(1)
                await p.js("""(() => { const e = document.querySelector('.public-DraftEditor-content'); e.scrollIntoView({block: 'center'}); e.focus();
                  const r = document.createRange(); r.selectNodeContents(e); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()""")
                await asyncio.sleep(0.4)
                await _key(p, 'Backspace', 'Backspace', 8)
                await asyncio.sleep(0.3)
                await p.call('Input.insertText', {'text': caption.strip()[:2000] + ' '})
                await asyncio.sleep(2)
                await _key(p, 'Escape', 'Escape', 27)
                await p.js('document.body.click()')
                await asyncio.sleep(1)
                typed = (await p.js("document.querySelector('.public-DraftEditor-content').innerText") or '').strip()
                if typed[:30] != caption.strip()[:30]:
                    return {'ok': False, 'error': 'la légende ne s\'est pas écrite correctement', 'shot': await _shot(p)}
                if dry:
                    shot = await _shot(p)
                    await p.js("document.querySelector('[data-e2e=discard_post_button]').click()")
                    await asyncio.sleep(1.5)
                    await p.js("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Supprimer' && !b.getAttribute('data-e2e')).pop(); if (b) b.click(); })()")
                    return {'ok': True, 'dry': True, 'caption': typed, 'shot': shot}
                await p.js("document.querySelector('[data-e2e=post_video_button]').click()")
                # TikTok peut demander une confirmation (« Publier maintenant », vérification du contenu…)
                for _ in range(40):
                    await asyncio.sleep(3)
                    r = await p.js(r"""(() => {
                      const t = document.body.innerText, href = location.href;
                      const done = !/\/upload/.test(href) || /publiée|est en cours de publication|Vidéo publiée|Your video (is being|has been) (posted|uploaded)/i.test(t);
                      if (!done) { const b = [...document.querySelectorAll('[role=dialog] button, .TUXModal button')].find(b => /^(Publier maintenant|Publier|Post now|Continuer)$/i.test(b.innerText.trim())); if (b) b.click(); }
                      return { done, href, captcha: /Drag the slider|fit the puzzle|Fais glisser/i.test(t) };
                    })()""") or {}
                    if r.get('done'):
                        return {'ok': True, 'href': r.get('href')}
                    if r.get('captcha'):
                        return {'ok': False, 'error': 'puzzle anti-robot TikTok à faire sur MON PC, puis redis « publie la pub »', 'shot': await _shot(p)}
                return {'ok': False, 'error': 'pas de confirmation de TikTok après 2 min', 'shot': await _shot(p)}
    finally:
        try:
            for t in cdp_json('/json/list'):
                if t['type'] == 'page' and '/tiktokstudio/' in t['url']:
                    cdp_json(f"/json/close/{t['id']}")
        except Exception:
            pass
        try:
            f.unlink()
        except OSError:
            pass


async def action(d: dict) -> dict:
    if d.get('action') == 'publish':
        return await publish(str(d.get('url') or ''), str(d.get('caption') or ''), bool(d.get('dry')))
    if d.get('action') == 'status':
        async with LOCK:
            async with Page('https://www.tiktok.com', URL) as p:
                return {'ok': True, **(await p.js(JS_STATE) or {})}
    return {'ok': False, 'error': 'action TikTok inconnue'}
