"""TikTok de FIK (fik_conciergerie) dans le Chrome du PC cloud — 24/11/2026, demande de Kouider.

LECTURE SEULE : Dzaryx ne répond jamais sur TikTok et n'ouvre aucune discussion (elles restent « non lues » sur son téléphone).
Toutes les ~8 min : liste des messages privés (Suite entreprise) + onglet Activité → Commentaires.
Chaque nouveau message client / commentaire → `cloud:tt_new` → backend tiktok-web.ts → fiche 🎵 TikTok dans DEMANDES + Telegram.
Puzzle anti-robot ou déconnexion → `cloud:tt_state` (le backend prévient Kouider ; on ne contourne jamais le puzzle).
"""
import asyncio
import json
import logging
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

from cdp import Page

log = logging.getLogger('cloudpc.tt')
URL = 'https://www.tiktok.com/messages?allow_label=true&lang=fr&scene=business'
SEEN = Path(os.environ.get('CLOUDPC_DATA', '/root/cloudpc-data')) / 'tt_seen.json'
EVERY = 8 * 60

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
