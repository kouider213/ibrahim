"""TikTok de FIK (fik_conciergerie) dans le Chrome du PC cloud — 24/11/2026, demande de Kouider.

Lecture ~8 min sans ouvrir les discussions. 26/11 : réponse à un message privé (`reply`) SEULEMENT après le « oui » de Kouider.
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
      // 26/11 : fenêtre « Utiliser la carte de contact » (Conditions) → « Plus tard » ; elle bloquait le clavier de la boîte de messages
      const later = [...document.querySelectorAll('[role=dialog] button, [data-testid*=term-modal] ')].find(x => /^(Plus tard|Later|Not now|Pas maintenant)$/i.test(x.innerText.trim()));
      if (later) later.click();
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


# ── Statistiques + inspiration pour l'équipe TikTok (24/11) ─────────────────────
INSIGHT_PAGES = ['https://www.tiktok.com/tiktokstudio/analytics', 'https://www.tiktok.com/tiktokstudio/analytics/content',
                 'https://www.tiktok.com/tiktokstudio/analytics/followers']
JS_TRENDS = r"""(async (region, vertical, page) => {
  const u = new URL('https://www.tiktok.com/creator_studio/inspiration/trending/video/v2?locale=fr&aid=1988&app_name=tiktok_creator_center&app_language=fr&device_platform=web_pc&channel=tiktok_web&PageSize=12&TrendingType=0&key=x');
  u.searchParams.set('Region', region); u.searchParams.set('Vertical', vertical); u.searchParams.set('PageNum', String(page));
  const j = await (await fetch(u, {credentials: 'include'})).json();
  return (j.TrendingVideos || []).map(x => ({ id: x.ItemId, desc: x.ItemName || '', plays: x.PlayCount || 0, likes: x.LikeCount || 0, author: x.UniqueId || '' }));
})"""


async def _capture(p: Page, url: str, needle: str, wait: float = 14) -> list[dict]:
    """Ouvre `url` et renvoie le JSON de chaque réponse dont l'adresse contient `needle`."""
    await p.call('Network.enable')
    p.seq += 1
    await p.ws.send_json({'id': p.seq, 'method': 'Page.navigate', 'params': {'url': url}})
    ids, end = [], asyncio.get_event_loop().time() + wait
    while asyncio.get_event_loop().time() < end:
        try:
            m = await asyncio.wait_for(p.ws.receive_json(), 2)
        except asyncio.TimeoutError:
            continue
        if m.get('method') == 'Network.loadingFinished' and m['params']['requestId'] in [i for i, _ in ids]:
            pass
        if m.get('method') == 'Network.responseReceived' and needle in m['params']['response']['url']:
            ids.append((m['params']['requestId'], m['params']['response']['url']))
    out = []
    for rid, _ in ids:
        try:
            r = await p.call('Network.getResponseBody', {'requestId': rid})
            out.append(json.loads(r.get('body') or '{}'))
        except Exception:
            pass
    await p.call('Network.disable')
    return out


async def insights() -> dict:
    merged: dict = {}
    searches = traffic = ''
    async with LOCK:
        async with Page('https://www.tiktok.com', URL) as p:
            for url in INSIGHT_PAGES:
                for body in await _capture(p, url, '/aweme/v2/data/insight/'):
                    for k, v in body.items():
                        if v is not None and k not in ('extra', 'log_pb', 'status_code', 'status_msg') and k not in merged:
                            merged[k] = v
                if url.endswith('/analytics'):
                    t = await p.js('document.body.innerText') or ''
                    i = t.find('Recherches effectuées')
                    searches = t[i:i + 900] if i >= 0 else ''
                    k = t.find('Sources de trafic')
                    traffic = t[k:k + 220] if k >= 0 else ''
            st = await p.js(JS_STATE) or {}
            if st.get('captcha') or '/login' in str(st.get('href')):
                return {'ok': False, 'error': 'puzzle anti-robot ou déconnexion TikTok', 'captcha': st.get('captcha')}
            trends = {}
            for region, vertical, pages in (('FR', 'Auto_Vehicle', 2), ('All', 'Auto_Vehicle', 1), ('FR', 'All', 1)):
                lst = []
                for pg in range(pages):
                    try:
                        lst += await p.js(f'({JS_TRENDS})({json.dumps(region)}, {json.dumps(vertical)}, {pg})') or []
                    except Exception as e:
                        log.info('tendances %s/%s : %s', region, vertical, e)
                trends[f'{region}/{vertical}'] = lst
    items = []
    for it in ((merged.get('top_items') or {}).get('value') or []):
        v = it.get('value') or it
        stt = v.get('statistics') or {}
        items.append({'id': v.get('aweme_id'), 'desc': (v.get('desc') or '')[:300], 'create_time': v.get('create_time'),
                      'duration': (v.get('video') or {}).get('duration'), 'plays': stt.get('play_count'), 'likes': stt.get('digg_count'),
                      'comments': stt.get('comment_count'), 'shares': stt.get('share_count'), 'saves': stt.get('collect_count')})
    keep = {k: merged.get(k) for k in ('follower_num', 'follower_active_history_hours', 'follower_active_history_days', 'follower_gender_percent',
                                       'follower_age_distribution', 'follower_location_percent', 'follower_num_history', 'net_follower_history',
                                       'pv_history', 'vv_history', 'like_history', 'share_history', 'user_search_terms', 'unique_viewer_num', 'video_page_percent')}
    return {'ok': True, 'insight': keep, 'videos': items, 'searches': searches, 'traffic': traffic, 'trends': trends, 'all_keys': sorted(merged.keys())}


# ── Réponse à un message privé (26/11, Kouider : « comme avec WhatsApp, pour répondre au client directement ») ──
# Toujours après SON « oui » (backend tiktok-web.ts). Ouvrir la discussion la marque « lue » sur TikTok.
FRAME = "[...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument } catch(e) { return null } }).find(d => d && /\\/messages/.test(d.location.href)) || (/\\/messages/.test(location.href) ? document : null)"
JS_OPEN = r"""(async (name) => {
  const d = %s;
  if (!d) return { error: 'boîte de messages TikTok introuvable' };
  const norm = s => (s || '').normalize('NFKC').trim().toLowerCase();
  const items = [...d.querySelectorAll('[data-e2e=dm-new-conversation-item]')];
  const it = items.find(e => norm((e.querySelector('[data-e2e=dm-new-conversation-nickname]') || {}).innerText) === norm(name));
  if (!it) return { error: 'discussion « ' + name + ' » introuvable dans les 30 premières', names: items.slice(0, 30).map(e => (e.querySelector('[data-e2e=dm-new-conversation-nickname]') || {}).innerText) };
  it.click();
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 400));
    const n = (d.querySelector('[data-e2e=dm-new-chat-nickname]') || {}).innerText;
    if (norm(n) === norm(name) && d.querySelector('[data-e2e=dm-new-chat-item]')) break;
  }
  await new Promise(r => setTimeout(r, 800));
  // 26/11 : chaque message garde la date du dernier séparateur affiché au-dessus (« 24 novembre 2026 11:29 », « Hier 14:02 »…)
  let when = '';
  const msgs = [...d.querySelectorAll('[data-e2e=dm-new-time-separator], [data-e2e=dm-new-chat-item]')].map(e => {
    if (e.getAttribute('data-e2e') === 'dm-new-time-separator') { when = (e.innerText || '').trim(); return null; }
    const a = e.querySelector('[data-e2e=chat-avatar]');
    const href = a ? (a.getAttribute('href') || (a.closest('a') || {}).href || '') : '';
    const t = ((e.querySelector('[data-e2e=dm-new-message-text]') || {}).innerText || (e.querySelector('[data-e2e=dm-new-shared-video]') ? '[vidéo partagée]' : '')).trim();
    return { me: /@fik_conciergerie/.test(href), text: t, when };
  }).filter(m => m && m.text && m.text !== 'fik_conciergerie');
  return { ok: true, chat: (d.querySelector('[data-e2e=dm-new-chat-nickname]') || {}).innerText, handle: (d.querySelector('[data-e2e=chat-uniqueid]') || {}).innerText, messages: msgs.slice(-20) };
})""" % FRAME


async def _open_chat(p: Page, name: str) -> dict:
    if not await p.js(f'!!({FRAME})'):
        await p.call('Page.navigate', {'url': URL})
        await asyncio.sleep(12)
    await _dismiss(p)
    await asyncio.sleep(1)
    st = await p.js(JS_STATE) or {}
    if '/login' in str(st.get('href')):
        return {'ok': False, 'error': 'TikTok déconnecté du PC cloud'}
    if st.get('captcha'):
        return {'ok': False, 'error': 'puzzle anti-robot TikTok à faire sur MON PC'}
    return await p.js(f'({JS_OPEN})({json.dumps(name)})') or {'ok': False, 'error': 'page TikTok muette'}


async def read_chat(name: str) -> dict:
    async with LOCK:
        async with Page('https://www.tiktok.com', URL) as p:
            r = await _open_chat(p, name)
            return r if r.get('ok') else {'ok': False, **r}


async def reply(name: str, text: str, dry: bool = False) -> dict:
    text = ' '.join(text.split())[:1500]
    if not text:
        return {'ok': False, 'error': 'texte vide'}
    async with LOCK:
        async with Page('https://www.tiktok.com', URL) as p:
            r = await _open_chat(p, name)
            if not r.get('ok'):
                return {'ok': False, **r}
            before = sum(1 for m in r['messages'] if m['me'])
            p.activate()
            await asyncio.sleep(0.5)
            ok = await p.js(f"""(() => {{ const d = {FRAME}; const e = d && d.querySelector('[data-e2e=message-input-area] .public-DraftEditor-content, .public-DraftEditor-content');
              if (!e) return false; e.focus(); const r = d.createRange(); r.selectNodeContents(e); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); return true; }})()""")
            if not ok:
                return {'ok': False, 'error': "zone d'écriture TikTok introuvable", 'shot': await _shot(p)}
            await _key(p, 'Backspace', 'Backspace', 8)
            await asyncio.sleep(0.4)
            left = (await p.js(f"(() => {{ const d = {FRAME}; return (d.querySelector('.public-DraftEditor-content') || {{}}).innerText || ''; }})()") or '').strip()
            if left:   # une fenêtre TikTok garde le clavier : on n'écrit rien par-dessus un vieux texte
                return {'ok': False, 'error': "la zone d'écriture TikTok n'a pas pu être vidée (fenêtre ouverte ?)", 'shot': await _shot(p)}
            await p.call('Input.insertText', {'text': text})
            await asyncio.sleep(1)
            typed = (await p.js(f"(() => {{ const d = {FRAME}; return (d.querySelector('.public-DraftEditor-content') || {{}}).innerText || ''; }})()") or '').strip()
            if ' '.join(typed.split())[:40] != text[:40]:
                return {'ok': False, 'error': "le message ne s'est pas écrit correctement", 'typed': typed[:200], 'shot': await _shot(p)}
            if dry:
                shot = await _shot(p)
                await p.js(f"(() => {{ const d = {FRAME}; const e = d.querySelector('.public-DraftEditor-content'); e.focus(); const r = d.createRange(); r.selectNodeContents(e); const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); }})()")
                await _key(p, 'Backspace', 'Backspace', 8)
                return {'ok': True, 'dry': True, 'chat': r.get('chat'), 'typed': typed, 'messages': r['messages'], 'shot': shot}
            for t in ('keyDown', 'keyUp'):
                ev = {'type': t, 'key': 'Enter', 'code': 'Enter', 'windowsVirtualKeyCode': 13}
                if t == 'keyDown':
                    ev['text'] = '\r'
                await p.call('Input.dispatchKeyEvent', ev)
            # envoyé = un message de plus de notre côté qui commence comme le texte
            for _ in range(15):
                await asyncio.sleep(1)
                mine = await p.js(f"""(() => {{ const d = {FRAME}; return [...d.querySelectorAll('[data-e2e=dm-new-chat-item]')].filter(e => {{ const a = e.querySelector('[data-e2e=chat-avatar]');
                  return a && /@fik_conciergerie/.test(a.getAttribute('href') || (a.closest('a') || {{}}).href || ''); }}).map(e => ((e.querySelector('[data-e2e=dm-new-message-text]') || {{}}).innerText || '').trim()); }})()""") or []
                if len(mine) > before and ' '.join(mine[-1].split())[:30] == text[:30]:
                    return {'ok': True, 'chat': r.get('chat')}
            return {'ok': False, 'error': "TikTok n'a pas confirmé l'envoi (vérifie sur MON PC)", 'shot': await _shot(p)}


async def action(d: dict) -> dict:
    if d.get('action') == 'read_chat':
        return await read_chat(str(d.get('name') or ''))
    if d.get('action') == 'reply':
        return await reply(str(d.get('name') or ''), str(d.get('text') or ''), bool(d.get('dry')))
    if d.get('action') == 'insights':
        return await insights()
    if d.get('action') == 'publish':
        return await publish(str(d.get('url') or ''), str(d.get('caption') or ''), bool(d.get('dry')))
    if d.get('action') == 'status':
        async with LOCK:
            async with Page('https://www.tiktok.com', URL) as p:
                return {'ok': True, **(await p.js(JS_STATE) or {})}
    return {'ok': False, 'error': 'action TikTok inconnue'}
