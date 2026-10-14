"""
NEXUS Panels — panneaux métier (réservations, documents clients, facture, liens, graphique, ménage du PC).

« Montre-moi les dernières réservations », « crée une facture pour Mohamed », « montre le passeport de Mohamed »,
« envoie-moi le lien des avis », « fais de la place sur le PC, crée un dossier avec les réservations, puis un graphique ».
Les données viennent du backend (/api/nexus/data/*, jeton du PC) ; chaque panneau est envoyé à l'interface en
{'type': 'panel', 'kind': ..., 'title': ..., 'data': ...}.
"""
import asyncio
import csv
import html
import json
import logging
import os
import re
import time
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

import aiohttp

log = logging.getLogger('nexus.panels')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
PC_TOKEN    = os.environ.get('PC_AGENT_TOKEN', '')

HOME      = Path.home()
DESKTOP   = HOME / 'OneDrive' / 'Bureau'
if not DESKTOP.exists():
    DESKTOP = HOME / 'Desktop'
WORKDIR   = DESKTOP / 'Nexus'
MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

SITE = os.environ.get('NEXUS_SITE_URL', 'https://fikconciergerie.com').rstrip('/')
LINKS = {
    'site':        ('Site Fik Conciergerie', SITE),
    'entreprises': ('Offres entreprises (B2B)', f'{SITE}/entreprises'),
    'avis':        ('Laisser un avis Google', 'https://g.page/r/CSluTI58e1CwEBM/review'),
    'maps':        ('Fik Conciergerie sur Google Maps', 'https://share.google/N4itFBIAR9Z1JX8Aw'),
    'app':         ('Application Dzaryx', 'https://kouider213.github.io/ibrahim/'),
}
LINK_WORDS = {
    'site': ('site', 'web', 'fikconciergerie'), 'entreprises': ('entreprise', 'b2b', 'societe', 'pro', 'corporate'),
    'avis': ('avis', 'review', 'note', 'google'), 'maps': ('maps', 'carte', 'adresse', 'itineraire', 'localisation'),
    'app': ('app', 'dzaryx', 'application'),
}


def _fold(s: str) -> str:
    """Minuscules sans accents, MÊME longueur que l'original (les positions des regex restent valables)."""
    return ''.join(unicodedata.normalize('NFD', c)[0] for c in s).lower()


_VERB_SHOW   = r'(?:montre|affiche|ouvre|ouvrir|voir|vois|donne|liste|sors|sortir|presente)\w*'
_VERB_MAKE   = r'(?:cree|creer|fais|fait|faire|genere|generer|prepare|preparer|edite|emets|emettre)\w*'
_BOOKINGS_RE = re.compile(rf'\b{_VERB_SHOW}(?:-moi|\s+moi)?\s+(?:(?:(?:le|la|les|mes|ton|mon|un|une|des|du|de)\s+)|l\')?(?:(?:\w+)\s+){{0,2}}?(?:reservations?|agenda|planning|locations?)\b(?:\s+(?:de|d\'|du|pour)\s+(?P<who>[^,.;!?]+))?')
_AGENDA_RE   = re.compile(r'^\s*(?:l\'|le\s+)?(?:agenda|planning)\s*$')
_DOC_RE      = re.compile(rf'\b{_VERB_SHOW}(?:-moi|\s+moi)?\s+(?:(?:(?:le|la|les|un|une|des)\s+)|l\')?(?P<kind>passeports?|permis|documents?|pieces?(?:\s+d\'identite)?|cni|carte\s+d\'identite)\s+(?:de|d\'|du)\s+(?P<who>[^,.;!?]+)')
_INVOICE_RE  = re.compile(rf'\b{_VERB_MAKE}(?:-moi|\s+moi)?\s+(?:(?:une?|la|ma|sa)\s+)?(?:facture|recu)\b(?:\s+(?:pour|de|du|a)\s+(?P<who>[^,.;!?]+?))?\s*(?:$|[,.;!?]|\s+(?:et|puis|ensuite|apres)\b)')
_LINK_RE     = re.compile(r'\benvoi\w*(?:-moi|\s+moi)?\s+(?:moi\s+)?(?:(?:un|une|le|la|les|mon|ma|mes|des|du|de)\s+)*(?:liens?|link|adresse|url)\b')
_CLEAN_RE    = re.compile(r'\b(?:fais|fait|faire|libere\w*|nettoie\w*|vide\w*|degage\w*)\s+(?:(?:de\s+la|de\s+l\'|de|un\s+peu\s+de)\s+(?:place|espace)|(?:le\s+)?pc|(?:l[ea]\s+)?disque|de\s+la\s+memoire)')
_FOLDER_RE   = re.compile(rf'\b{_VERB_MAKE}(?:-moi|\s+moi)?\s+(?:un\s+)?(?:nouveau\s+)?dossier\b(?:[^,.;!?]*?\b(?:reservations?|clients?)\b)?')
_CHART_RE    = re.compile(rf'\b(?:{_VERB_MAKE}|{_VERB_SHOW})(?:-moi|\s+moi)?\s+(?:(?:un|une|le|la|les|des|mon|ma)\s+)?(?:graphiques?|graphes?|diagrammes?|courbes?|statistiques?|stats)\b')
_AND_SPLIT   = re.compile(r'\b(?:ensuite|puis|apres ca|et apres)\b')


class Panels:
    def __init__(self, app) -> None:
        self.app = app
        self.served: dict[str, Path] = {}      # fichiers exposés à l'interface via /files/<clé> (aucun autre)
        self._allowed: list[Path] = [WORKDIR]  # dossiers que le bouton « Ouvrir » peut ouvrir
        self._last_folder: Path | None = None
        self._cache: list[dict] | None = None

    # ── Détection ────────────────────────────────────────────────────────────
    def plan(self, text: str) -> list[tuple[str, dict]]:
        """Étapes détectées dans la phrase, dans l'ordre où elles sont dites."""
        f = _fold(text)
        found: list[tuple[int, str, dict]] = []
        m = _DOC_RE.search(f)
        if m:
            found.append((m.start(), 'document', {'kind': m.group('kind'), 'who': text[m.start('who'):m.end('who')].strip()}))
        for key, rx in (('invoice', _INVOICE_RE), ('links', _LINK_RE), ('cleanup', _CLEAN_RE), ('folder', _FOLDER_RE), ('chart', _CHART_RE)):
            m = rx.search(f)
            if m:
                who = m.groupdict().get('who')
                found.append((m.start(), key, {'who': text[m.start('who'):m.end('who')].strip() if who else '', 'raw': f}))
        if not any(k in ('document', 'chart', 'folder') for _, k, _ in found):
            m = _BOOKINGS_RE.search(f)
            if m:
                who = m.groupdict().get('who')
                found.append((m.start(), 'bookings', {'who': text[m.start('who'):m.end('who')].strip() if who else ''}))
            elif _AGENDA_RE.search(f):
                found.append((0, 'bookings', {'who': ''}))
        found.sort(key=lambda x: x[0])
        return [(k, p) for _, k, p in found]

    # ── Point d'entrée ───────────────────────────────────────────────────────
    async def handle(self, text: str) -> str | None:
        steps = self.plan(text)
        if not steps:
            return None
        await self.app.gui_send({'type': 'thinking', 'active': True})
        done: list[str] = []
        try:
            for kind, p in steps:
                try:
                    done.append(await getattr(self, f'_do_{kind}')(p))
                except Exception as e:                                   # une étape qui échoue n'arrête pas les autres
                    log.error('panneau %s: %s', kind, e)
                    done.append(f'{kind} : {e}')
        finally:
            await self.app.gui_send({'type': 'thinking', 'active': False})
        return ' '.join(x for x in done if x)

    async def action(self, data: dict) -> None:
        """Boutons des panneaux (interface → Nexus)."""
        act = data.get('action')
        try:
            if act == 'cleanup_confirm':
                await self._cleanup_run()
            elif act == 'open_path':
                p = Path(str(data.get('path', ''))).resolve()
                if any(p == a or a in p.parents for a in (x.resolve() for x in self._allowed)) and p.exists():
                    os.startfile(str(p))
            elif act == 'send_telegram':
                text = str(data.get('text', ''))[:3000]
                if text:
                    await self._api('POST', '/notify', json={'text': text})
                    await self.app.gui_send({'type': 'status', 'text': 'ENVOYÉ SUR TELEGRAM'})
            elif act == 'refresh_bookings':
                await self._do_bookings({'who': str(data.get('who', ''))})
        except Exception as e:
            log.error('panel_action %s: %s', act, e)
            await self.app.gui_send({'type': 'status', 'text': f'ERREUR : {e}'[:90]})

    # ── Backend ──────────────────────────────────────────────────────────────
    async def _api(self, method: str, path: str, **kw):
        if not PC_TOKEN:
            raise RuntimeError('PC_AGENT_TOKEN manquant dans nexus/.env')
        async with aiohttp.ClientSession() as s:
            async with s.request(method, f'{BACKEND_URL}/api/nexus/data{path}', headers={'Authorization': f'Bearer {PC_TOKEN}'},
                                 timeout=aiohttp.ClientTimeout(total=45), **kw) as r:
                data = await r.json(content_type=None)
                if r.status >= 400:
                    raise RuntimeError((data or {}).get('error') or f'serveur HTTP {r.status}')
                return data

    async def bookings(self, who: str = '', limit: int = 200) -> list[dict]:
        data = await self._api('GET', '/bookings', params={'limit': str(limit), **({'q': who} if who else {})})
        return data.get('bookings', [])

    async def _panel(self, kind: str, title: str, data: dict) -> None:
        await self.app.gui_send({'type': 'panel', 'kind': kind, 'title': title, 'data': data})

    def _serve(self, path: Path) -> str:
        key = f'{int(time.time() * 1000)}_{path.name}'
        self.served[key] = path
        return '/files/' + key

    # ── Réservations / agenda ────────────────────────────────────────────────
    async def _do_bookings(self, p: dict) -> str:
        who = p.get('who', '')
        items = await self.bookings(who, 120)
        self._cache = items
        slim = [{k: (str(b.get(k))[:10] if k in ('start_date', 'end_date') and b.get(k) else b.get(k))
                 for k in ('id', 'client_name', 'car', 'start_date', 'end_date', 'status', 'final_price', 'paid_amount', 'payment_status')}
                for b in items]
        title = f'Réservations de {who}' if who else 'Dernières réservations'
        await self._panel('bookings', title, {'items': slim, 'who': who, 'today': date.today().isoformat()})
        if not items:
            return f'Aucune réservation{" pour " + who if who else ""}.'
        last = items[0]
        return f'{len(items)} réservations. La dernière : {last.get("client_name")}, {last.get("car") or "véhicule"}, du {str(last.get("start_date"))[:10]} au {str(last.get("end_date"))[:10]}.'

    # ── Documents clients ────────────────────────────────────────────────────
    async def _do_document(self, p: dict) -> str:
        who = p['who']
        kind = p['kind']
        dtype = 'passport' if kind.startswith('passeport') else 'license' if kind.startswith('permis') else ''
        data = await self._api('GET', '/documents', params={'name': who, **({'type': dtype} if dtype else {})})
        docs = data.get('documents', [])
        label = {'passport': 'Passeport', 'license': 'Permis'}.get(dtype, 'Documents')
        await self._panel('document', f'{label} — {who}', {'docs': docs, 'who': who})
        if not docs:
            return f'Je ne trouve aucun {label.lower()} pour {who}.'
        return f'{len(docs)} document{"s" if len(docs) > 1 else ""} pour {docs[0].get("client_name") or who}. Cette consultation est enregistrée.'

    # ── Facture ──────────────────────────────────────────────────────────────
    async def _do_invoice(self, p: dict) -> str:
        who = (p.get('who') or '').strip()
        res = await self._api('POST', '/invoice', json={'name': who} if who else {})
        url = res['url']
        folder = WORKDIR / 'Factures'
        folder.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r'[^A-Za-z0-9._-]+', '_', str(res.get('client_name') or 'client'))
        dest = folder / f'facture_{safe}_{date.today().isoformat()}.pdf'
        await asyncio.get_running_loop().run_in_executor(None, lambda: dest.write_bytes(urllib.request.urlopen(url, timeout=40).read()))
        self._allowed.append(folder)
        await self._panel('invoice', f'Facture — {res.get("client_name") or "client"}',
                          {'src': self._serve(dest), 'path': str(dest), 'url': url, 'client': res.get('client_name'), 'total': res.get('total')})
        return f'Facture créée pour {res.get("client_name") or "ce client"}, enregistrée dans le dossier Nexus Factures.'

    # ── Liens business ───────────────────────────────────────────────────────
    async def _do_links(self, p: dict) -> str:
        f = p.get('raw', '')
        picked = [k for k, words in LINK_WORDS.items() if any(re.search(rf'\b{w}', f) for w in words)] or list(LINKS)
        items = [{'label': LINKS[k][0], 'url': LINKS[k][1]} for k in picked]
        text = 'Liens Fik Conciergerie :\n' + '\n'.join(f'• {i["label"]} : {i["url"]}' for i in items)
        await self._api('POST', '/notify', json={'text': text})
        await self._panel('links', 'Liens envoyés sur Telegram', {'items': items})
        return f'Je t\'ai envoyé {len(items)} lien{"s" if len(items) > 1 else ""} sur Telegram.'

    # ── Dossier + export des réservations ────────────────────────────────────
    async def _do_folder(self, p: dict) -> str:
        items = self._cache if self._cache is not None else await self.bookings('', 300)
        folder = DESKTOP / f'Reservations_{date.today().isoformat()}'
        folder.mkdir(parents=True, exist_ok=True)
        self._last_folder = folder
        self._allowed.append(folder)
        cols = ['client_name', 'car', 'start_date', 'end_date', 'nb_days', 'status', 'final_price', 'paid_amount', 'payment_status', 'client_phone']
        csv_path = folder / 'reservations.csv'
        with csv_path.open('w', newline='', encoding='utf-8-sig') as fh:
            w = csv.writer(fh, delimiter=';')
            w.writerow(cols)
            for b in items:
                w.writerow([str(b.get(c) if b.get(c) is not None else '')[:10] if c.endswith('_date') else (b.get(c) if b.get(c) is not None else '') for c in cols])
        await self._panel('folder', 'Dossier créé', {'path': str(folder), 'files': [{'name': 'reservations.csv', 'info': f'{len(items)} réservations'}]})
        return f'Dossier créé sur le bureau avec les {len(items)} réservations.'

    # ── Graphique (SVG, sans dépendance) ─────────────────────────────────────
    async def _do_chart(self, p: dict) -> str:
        items = self._cache if self._cache is not None else await self.bookings('', 300)
        today = date.today()
        months: list[tuple[int, int]] = []
        y, m = today.year, today.month
        for _ in range(6):
            months.append((y, m))
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        months.reverse()
        count = {k: 0 for k in months}
        rev = {k: 0.0 for k in months}
        for b in items:
            if str(b.get('status')) not in ('CONFIRMED', 'ACTIVE', 'COMPLETED') or not b.get('start_date'):
                continue      # ni en attente, ni refusée, ni annulée : ce n'est pas du chiffre d'affaires
            try:
                key = (int(str(b['start_date'])[:4]), int(str(b['start_date'])[5:7]))
            except ValueError:
                continue
            if key in count:
                count[key] += 1
                rev[key] += float(b.get('final_price') or 0)
        svg = self._chart_svg('Réservations et chiffre d\'affaires par mois',
                              [f'{MONTHS_FR[m - 1]} {str(y)[2:]}' for y, m in months], [count[k] for k in months], [rev[k] for k in months])
        folder = self._last_folder or (WORKDIR / 'Graphiques')
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f'graphique_{today.isoformat()}.svg'
        path.write_text(svg, encoding='utf-8')
        self._allowed.append(folder)
        await self._panel('chart', 'Réservations par mois', {'src': self._serve(path), 'path': str(path), 'folder': str(folder)})
        total = sum(count.values())
        return f'Graphique créé : {total} réservations sur 6 mois, enregistré dans {folder.name}.'

    @staticmethod
    def _chart_svg(title: str, labels: list[str], counts: list[int], revenue: list[float]) -> str:
        W, H, L, R, T, B = 920, 480, 78, 30, 78, 74
        pw, ph = W - L - R, H - T - B
        top = max(revenue) if max(revenue, default=0) > 0 else 1
        step = pw / len(labels)
        bw = step * .52
        out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Segoe UI,Arial,sans-serif">',
               '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38d8f5"/><stop offset="1" stop-color="#4aa3ff"/></linearGradient></defs>',
               f'<rect width="{W}" height="{H}" rx="18" fill="#08122b"/>',
               f'<text x="{L}" y="44" fill="#e8f0ff" font-size="22" font-weight="600">{html.escape(title)}</text>']
        for i in range(5):
            y = T + ph - ph * i / 4
            out.append(f'<line x1="{L}" y1="{y:.1f}" x2="{W - R}" y2="{y:.1f}" stroke="#4aa3ff" stroke-opacity=".16"/>')
            out.append(f'<text x="{L - 10}" y="{y + 4:.1f}" fill="#8ea3c8" font-size="12" text-anchor="end">{top * i / 4:,.0f}</text>'.replace(',', ' '))
        for i, (lab, c, r) in enumerate(zip(labels, counts, revenue)):
            x = L + step * i + (step - bw) / 2
            h = ph * (r / top)
            out.append(f'<rect x="{x:.1f}" y="{T + ph - h:.1f}" width="{bw:.1f}" height="{max(h, 2):.1f}" rx="7" fill="url(#g)"/>')
            out.append(f'<text x="{x + bw / 2:.1f}" y="{T + ph - h - 8:.1f}" fill="#e8f0ff" font-size="13" text-anchor="middle">{r:,.0f} €</text>'.replace(',', ' '))
            out.append(f'<text x="{x + bw / 2:.1f}" y="{T + ph + 24}" fill="#8ea3c8" font-size="13" text-anchor="middle">{html.escape(lab)}</text>')
            out.append(f'<text x="{x + bw / 2:.1f}" y="{T + ph + 44}" fill="#38d8f5" font-size="12" text-anchor="middle">{c} rés.</text>')
        out.append('</svg>')
        return '\n'.join(out)

    # ── Ménage du PC ─────────────────────────────────────────────────────────
    @staticmethod
    def _scan_temp(days: int = 2, budget_s: float = 20.0) -> tuple[int, int]:
        temp = Path(os.environ.get('TEMP') or (HOME / 'AppData' / 'Local' / 'Temp'))
        cutoff, size, n, t0 = time.time() - days * 86400, 0, 0, time.time()
        for root, _dirs, files in os.walk(temp):
            if time.time() - t0 > budget_s:
                break
            for fn in files:
                try:
                    fp = os.path.join(root, fn)
                    if not os.path.islink(fp) and os.path.getmtime(fp) < cutoff:
                        size += os.path.getsize(fp)
                        n += 1
                except OSError:
                    pass
        return size, n

    @staticmethod
    def _big_downloads() -> list[dict]:
        dl, out = HOME / 'Downloads', []
        try:
            for f in dl.iterdir():
                if f.is_file() and f.stat().st_size > 150 * 1024 * 1024:
                    out.append({'name': f.name, 'mb': round(f.stat().st_size / 1e6), 'age': int((time.time() - f.stat().st_mtime) / 86400)})
        except OSError:
            pass
        return sorted(out, key=lambda x: -x['mb'])[:6]

    async def _do_cleanup(self, p: dict) -> str:
        import shutil
        loop = asyncio.get_running_loop()
        size, n = await loop.run_in_executor(None, self._scan_temp)
        big = await loop.run_in_executor(None, self._big_downloads)
        _t, used, free = shutil.disk_usage('C:')
        await self._panel('cleanup', 'Faire de la place sur le PC', {
            'temp_mb': round(size / 1e6), 'temp_files': n, 'big': big, 'free_gb': round(free / 1e9, 1), 'pct': round(used / _t * 100, 1)})
        extra = f' Et {len(big)} gros fichiers dans Téléchargements à vérifier.' if big else ''
        return f'Je peux libérer environ {round(size / 1e6)} méga-octets de fichiers temporaires. Confirme avec le bouton nettoyer.{extra}'

    async def _cleanup_run(self) -> None:
        import shutil
        loop = asyncio.get_running_loop()

        def purge() -> tuple[int, int]:
            temp = Path(os.environ.get('TEMP') or (HOME / 'AppData' / 'Local' / 'Temp'))
            cutoff, freed, n, t0 = time.time() - 2 * 86400, 0, 0, time.time()
            for root, _d, files in os.walk(temp):
                if time.time() - t0 > 60:
                    break
                for fn in files:
                    fp = os.path.join(root, fn)
                    try:
                        if not os.path.islink(fp) and os.path.getmtime(fp) < cutoff:
                            sz = os.path.getsize(fp)
                            os.remove(fp)
                            freed += sz
                            n += 1
                    except OSError:
                        pass                                            # fichier en cours d'utilisation : on le laisse
            return freed, n

        freed, n = await loop.run_in_executor(None, purge)
        _t, used, free = shutil.disk_usage('C:')
        await self._panel('cleanup', 'Ménage terminé', {'temp_mb': 0, 'temp_files': 0, 'big': await loop.run_in_executor(None, self._big_downloads),
                                                       'free_gb': round(free / 1e9, 1), 'pct': round(used / _t * 100, 1), 'done': f'{round(freed / 1e6)} Mo libérés ({n} fichiers)'})
        await self.app.gui_send({'type': 'widget', 'widget': 'disk', 'data': {'total': _t, 'used': used, 'free': free, 'pct': round(used / _t * 100, 1)}})
        await self.app.speak(f'C\'est fait, {round(freed / 1e6)} méga-octets libérés.')
