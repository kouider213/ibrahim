"""
NEXUS HUD — widgets holographiques façon JARVIS (vidéo TechEnClair) : mails, contrôle à la main, apparence de la sphère.

« Montre mes mails » → widget mails + « Tu as 5 mails récents : le premier de … Lequel veux-tu que je t'ouvre ? »
« Ouvre le deuxième » / « ouvre le mail de Booking » → le mail s'ouvre dans le widget et Nexus en lit le début.
« Active le contrôle gestuel » → la webcam suit la main dans la page : pincer = attraper / cliquer, glisser = déplacer.
« Sphère bleue », « sphère verte », « ancien affichage » → apparence du cœur de Nexus.
Les mails viennent de la boîte pro via le backend (/api/nexus/data/emails, lecture seule, jeton du PC).
"""
import logging
import os
import re
import unicodedata
from email.utils import parseaddr

import aiohttp

log = logging.getLogger('nexus.hud')

BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
PC_TOKEN    = os.environ.get('PC_AGENT_TOKEN', '')


def _norm(t: str) -> str:
    t = unicodedata.normalize('NFD', t.lower())
    return ''.join(c for c in t if unicodedata.category(c) != 'Mn')


_MAILS = r"(mails?|e-?mails?|courriers?|courriels?|boite mail|boite de reception|messagerie)"
_SHOW_MAILS = re.compile(rf"\b(montre|affiche|ouvre|lis|liste|consulte|check|regarde|sors)\b.*\b{_MAILS}\b|\b(j.ai|est.ce que j.ai|ai.je|il y a)\b.*\b(nouveaux? |des )?{_MAILS}\b|^{_MAILS}\b")
_CLOSE_MAILS = re.compile(rf"\b(ferme|cache|enleve|retire|range)\b.*\b({_MAILS}|widget|liste)\b")
_BACK = re.compile(r"\b(retour|reviens|revenir)\b.*\b(liste|mails?)\b|^retour$")
_ORDINALS = {'premier': 0, 'premiere': 0, '1er': 0, 'deuxieme': 1, 'second': 1, 'seconde': 1, 'troisieme': 2, 'quatrieme': 3,
             'cinquieme': 4, 'sixieme': 5, 'septieme': 6, 'huitieme': 7, 'neuvieme': 8, 'dixieme': 9}
_NUM = re.compile(r"\b(?:numero|n°|mail|le|la)\s*(\d{1,2})\b")
_OPEN_ONE = re.compile(r"\b(ouvre|lis|montre|affiche)\b")
_FROM = re.compile(r"\b(?:de|du|des|d')\s*(.+)$")

_GESTURE = r"(controle gestuel|gestes?|mode main|controle (a|avec) la main|suivi de la main|la main)"
_GESTURE_ON = re.compile(rf"\b(active|allume|lance|mets|demarre)\b.*\b{_GESTURE}")
_GESTURE_OFF = re.compile(rf"\b(desactive|coupe|eteins|arrete|stoppe|enleve)\b.*\b{_GESTURE}")

_LOOK = re.compile(r"\b(sphere|noyau|coeur|apparence|affichage|interface|hud)\b")
_COLORS = {'verte': 'green', 'vert': 'green', 'bleue': 'blue', 'bleu': 'blue', 'violette': 'violet', 'violet': 'violet',
           'orange': 'orange', 'rouge': 'red', 'blanche': 'white', 'blanc': 'white', 'cyan': 'cyan'}
_CLASSIC = re.compile(r"\b(ancien|classique|anneaux|ancienne)\b")
_NEURAL = re.compile(r"\b(neuronale?|reseau|particules|nouvelle?|jarvis)\b")


def _who(sender: str) -> str:
    name, addr = parseaddr(sender or '')
    return (name or addr.split('@')[0] or 'inconnu').strip('" ')


class Hud:
    def __init__(self, app):
        self.app = app
        self.mails: list[dict] = []
        self.mails_open = False
        self.mail_opened: int | None = None

    async def _api(self, path: str, **params) -> dict:
        if not PC_TOKEN:
            raise RuntimeError('PC_AGENT_TOKEN manquant dans nexus/.env')
        async with aiohttp.ClientSession() as s:
            async with s.get(f'{BACKEND_URL}/api/nexus/data{path}', params=params or None,
                             headers={'Authorization': f'Bearer {PC_TOKEN}'}, timeout=aiohttp.ClientTimeout(total=30)) as r:
                data = await r.json(content_type=None)
                if r.status >= 400:
                    raise RuntimeError((data or {}).get('error') or f'serveur HTTP {r.status}')
                return data

    async def handle(self, text: str) -> str | None:
        t = _norm(text).strip(' .!?')

        # ── Contrôle à la main
        if _GESTURE_OFF.search(t):
            await self.app.gui_send({'type': 'gesture', 'on': False})
            return 'Contrôle gestuel désactivé.'
        if _GESTURE_ON.search(t):
            await self.app.gui_send({'type': 'gesture', 'on': True})
            return 'Contrôle gestuel activé. Lève la main devant la caméra : pince pour attraper, glisse pour déplacer.'

        # ── Apparence du cœur
        if _LOOK.search(t) and re.search(r"\b(mets|passe|change|affiche|en|style|mode|sphere)\b", t):
            if _CLASSIC.search(t):
                await self.app.gui_send({'type': 'look', 'style': 'classic'}); return 'Ancien affichage.'
            color = next((v for k, v in _COLORS.items() if re.search(rf"\b{k}\b", t)), None)
            if color or _NEURAL.search(t):
                await self.app.gui_send({'type': 'look', 'style': 'neural', **({'color': color} if color else {})})
                return 'Sphère neuronale' + (f' {next(k for k, v in _COLORS.items() if v == color)}.' if color else '.')

        # ── Mails
        if self.mails_open and _CLOSE_MAILS.search(t) and (re.search(_MAILS, t) or not (self.app.globe.cams_open or self.app.globe.flights_open)):
            self.mails_open, self.mail_opened = False, None
            await self.app.gui_send({'type': 'mails_close'})
            return 'Mails fermés.'
        if self.mails_open and self.mail_opened is not None and _BACK.search(t):
            self.mail_opened = None
            await self.app.gui_send({'type': 'mails', 'emails': self.mails})
            return 'Voici la liste.'
        if self.mails_open and self.mails:
            i = self._pick(t)
            if i is not None:
                return await self._open(i)
        if _SHOW_MAILS.search(t) and not re.search(r"\b(envoie|ecris|redige|reponds|repond|supprime|archive)\b", t):
            return await self._list()
        return None

    def _pick(self, t: str) -> int | None:
        if not (_OPEN_ONE.search(t) or re.match(r"^(le|la)\s", t)):
            return None
        if re.search(r"\b(dernier|derniere)\b", t):
            return len(self.mails) - 1
        for w, i in _ORDINALS.items():
            if re.search(rf"\b{w}\b", t):
                return i if i < len(self.mails) else None
        m = _NUM.search(t)
        if m and 1 <= int(m.group(1)) <= len(self.mails):
            return int(m.group(1)) - 1
        f = _FROM.search(t)
        if f:
            who = f.group(1).strip()
            for i, e in enumerate(self.mails):
                if who and (who in _norm(e.get('from', '')) or who in _norm(e.get('subject', ''))):
                    return i
        return None

    async def _list(self) -> str:
        await self.app.gui_send({'type': 'thinking', 'active': True})
        try:
            self.mails = (await self._api('/emails', max='6')).get('emails', [])
        except Exception as e:
            log.warning('mails : %s', e)
            return f'Je n\'arrive pas à lire les mails : {e}'
        finally:
            await self.app.gui_send({'type': 'thinking', 'active': False})
        self.mails_open, self.mail_opened = True, None
        await self.app.gui_send({'type': 'mails', 'emails': self.mails})
        if not self.mails:
            return 'Ta boîte de réception est vide.'
        names = ['le premier', 'le deuxième', 'le troisième', 'le quatrième', 'le cinquième', 'le sixième']
        parts = [f"{names[i]} de {_who(e.get('from', ''))}" for i, e in enumerate(self.mails[:3])]
        rest = len(self.mails) - 3
        unread = sum(1 for e in self.mails if e.get('unread'))
        return (f"Tu as {len(self.mails)} mails récents{f', dont {unread} non lus' if unread else ''} : {', '.join(parts)}"
                f"{f', et {rest} autres' if rest > 0 else ''}. Lequel veux-tu que je t'ouvre ?")

    async def _open(self, i: int) -> str:
        e = self.mails[i]
        try:
            m = await self._api(f"/emails/{e['id']}")
        except Exception as err:
            return f'Impossible d\'ouvrir ce mail : {err}'
        self.mail_opened = i
        await self.app.gui_send({'type': 'mail_open', 'index': i, 'mail': m})
        body = re.sub(r'https?://\S+', 'un lien', m.get('body') or '').strip()
        body = re.sub(r'\s+', ' ', body)[:320]
        return f"Mail de {_who(m.get('from', ''))} : {m.get('subject', '')}. {body}"
