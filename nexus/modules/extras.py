"""
NEXUS Extras — commandes locales sans IA (3e passe JARVIS / TechEnClair v10.3)
Minuteurs, notes rapides, liste de courses, to-do, volume/luminosité, arrêt programmé,
corbeille, verrouillage, mot de passe, pile ou face / dé, heure dans une ville, mode boulot.

Phrases volontairement précises : « ajoute une note pour le client Karim » doit partir
vers Dzaryx (add_client_note), pas ici. Les données restent sur le PC (nexus/data/extras.json).
"""
import json
import logging
import os
import random
import re
import secrets
import string
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Callable

log = logging.getLogger('nexus.extras')

_DATA_FILE = Path(__file__).resolve().parent.parent / 'data' / 'extras.json'

_NUM_WORDS = {
    'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5, 'six': 6, 'sept': 7,
    'huit': 8, 'neuf': 9, 'dix': 10, 'onze': 11, 'douze': 12, 'quinze': 15, 'vingt': 20,
    'trente': 30, 'quarante': 40, 'quarante-cinq': 45, 'cinquante': 50, 'soixante': 60,
}

# ── Minuteurs ────────────────────────────────────────────────────────────────
_TIMER_RE = re.compile(
    r"^(?:mets?|lance|active|d[eé]marre|programme)?\s*(?:un\s+)?(?:minuteur|minuterie|timer|chrono)\b"
    r"|^(?:pr[eé]viens|rappelle)[\s-]moi\s+dans\b|^alarme\s+dans\b|^r[eé]veille[\s-]moi\s+dans\b", re.I)
_TIMER_LIST_RE = re.compile(r"^(?:il\s+reste\s+combien|combien\s+(?:de\s+temps\s+)?(?:il\s+)?reste)(?:\s+(?:au|sur\s+le)\s+minuteur)?$"
                            r"|^(?:mes\s+)?minuteurs?(?:\s+en\s+cours)?$", re.I)
_TIMER_CANCEL_RE = re.compile(r"^(?:annule|arr[eê]te|stoppe|supprime)\s+(?:le\s+|les\s+|tous\s+les\s+)?(?:minuteurs?|timers?|chronos?)$", re.I)
_DURATION_RE = re.compile(
    r"(\d+(?:[.,]\d+)?|" + '|'.join(sorted(_NUM_WORDS, key=len, reverse=True)) + r")\s*"
    r"(h|heures?|min|minutes?|mn|s|sec|secondes?)\b", re.I)
_HALF_RE = re.compile(r"\b(?:une\s+)?demi[\s-]heure\b", re.I)
_QUARTER_RE = re.compile(r"\bun\s+quart\s+d'heure\b", re.I)

# ── Notes / courses / to-do ─────────────────────────────────────────────────
_NOTE_ADD_RE = re.compile(r"^(?:prends?\s+note|note)\s*(?:que|:)?\s+(.+)$", re.I)
_NOTE_LIST_RE = re.compile(r"^(?:lis|lit|donne|montre|affiche)[\s-]?(?:moi\s+)?mes\s+notes$|^mes\s+notes$", re.I)
_NOTE_CLEAR_RE = re.compile(r"^(?:efface|supprime|vide)\s+(?:toutes\s+)?mes\s+notes$", re.I)

_LIST_NAMES = r"(?:la\s+|ma\s+)?(?:liste\s+de\s+courses|liste\s+des\s+courses|courses|to[\s-]?do(?:\s+list)?|liste\s+de\s+t[aâ]ches|liste\s+des\s+choses\s+[aà]\s+faire)"
_LIST_ADD_RE = re.compile(r"^(?:ajoute|rajoute|mets?)\s+(.+?)\s+(?:[aà]|dans|sur)\s+" + _LIST_NAMES + r"$", re.I)
_LIST_DEL_RE = re.compile(r"^(?:enl[eè]ve|retire|supprime|coche|barre)\s+(.+?)\s+(?:de|du|dans|sur)\s+" + _LIST_NAMES + r"$", re.I)
_LIST_SHOW_RE = re.compile(r"^(?:lis|lit|donne|montre|affiche|qu'est[\s-]ce\s+qu'il\s+y\s+a\s+(?:sur|dans))[\s-]?(?:moi\s+)?" + _LIST_NAMES + r"$"
                           r"|^" + _LIST_NAMES + r"$", re.I)
_LIST_CLEAR_RE = re.compile(r"^(?:vide|efface)\s+" + _LIST_NAMES + r"$", re.I)

# ── Système ─────────────────────────────────────────────────────────────────
_VOL_UP_RE = re.compile(r"^(?:monte|augmente|hausse)\s+(?:le\s+)?(?:son|volume)(?:\s+de\s+(\d+))?$|^plus\s+fort$", re.I)
_VOL_DOWN_RE = re.compile(r"^(?:baisse|diminue)\s+(?:le\s+)?(?:son|volume)(?:\s+de\s+(\d+))?$|^moins\s+fort$", re.I)
_VOL_SET_RE = re.compile(r"^(?:mets?\s+)?(?:le\s+)?(?:son|volume)\s+(?:[aà]\s+)?(\d{1,3})\s*(?:%|pour\s*cent)?$", re.I)
_MUTE_RE = re.compile(r"^(?:coupe\s+le\s+son|mets?\s+(?:le\s+pc\s+)?en\s+muet|mute|silence)$", re.I)
_UNMUTE_RE = re.compile(r"^(?:remets?\s+le\s+son|r[eé]active\s+le\s+son|unmute|enl[eè]ve\s+le\s+muet)$", re.I)
_BRIGHT_RE = re.compile(r"^(?:mets?\s+)?(?:la\s+)?luminosit[eé]\s+(?:[aà]\s+)?(\d{1,3})\s*%?$", re.I)
_BRIGHT_UP_RE = re.compile(r"^(?:monte|augmente)\s+(?:la\s+)?luminosit[eé]$", re.I)
_BRIGHT_DOWN_RE = re.compile(r"^(?:baisse|diminue)\s+(?:la\s+)?luminosit[eé]$", re.I)
_SHUTDOWN_RE = re.compile(r"^(?:[eé]teins|arr[eê]te|ferme)\s+(?:le\s+)?(?:pc|ordi(?:nateur)?)(?:\s+dans\s+(.+))?$", re.I)
_REBOOT_RE = re.compile(r"^(?:red[eé]marre|reboot)\s+(?:le\s+)?(?:pc|ordi(?:nateur)?)$", re.I)
_ABORT_RE = re.compile(r"^annule\s+(?:l'arr[eê]t|l'extinction|le\s+red[eé]marrage)$", re.I)
_LOCK_RE = re.compile(r"^(?:verrouille|bloque)\s+(?:le\s+)?(?:pc|ordi(?:nateur)?|session|[eé]cran)$", re.I)
_TRASH_RE = re.compile(r"^vide\s+(?:la\s+)?corbeille$", re.I)

# ── Petits outils ───────────────────────────────────────────────────────────
_PASSWORD_RE = re.compile(r"^(?:g[eé]n[eè]re|cr[eé]e|invente|donne[\s-]moi)\s+(?:un\s+)?mot\s+de\s+passe(?:\s+(?:de\s+)?(\d+)\s+caract[eè]res)?$", re.I)
_COIN_RE = re.compile(r"^(?:pile\s+ou\s+face|lance\s+une\s+pi[eè]ce)$", re.I)
_DICE_RE = re.compile(r"^lance\s+(?:un|le|(\d+))\s+d[eé]s?$", re.I)
_CITY_TIME_RE = re.compile(r"^(?:quelle\s+heure\s+(?:est[\s-]il|il\s+est)|il\s+est\s+quelle\s+heure)\s+(?:[aà]|en|au|aux)\s+(.+)$", re.I)
_WORK_RE = re.compile(r"^(?:mode\s+(?:boulot|travail|bureau)|pr[eé]pare\s+(?:mon\s+)?(?:poste|espace)\s+de\s+travail|on\s+bosse)$", re.I)

_CITIES = {
    'oran': 'Africa/Algiers', 'alger': 'Africa/Algiers', 'algérie': 'Africa/Algiers', 'algerie': 'Africa/Algiers',
    'bruxelles': 'Europe/Brussels', 'belgique': 'Europe/Brussels', 'paris': 'Europe/Paris', 'france': 'Europe/Paris',
    'londres': 'Europe/London', 'madrid': 'Europe/Madrid', 'barcelone': 'Europe/Madrid', 'rome': 'Europe/Rome',
    'berlin': 'Europe/Berlin', 'amsterdam': 'Europe/Amsterdam', 'istanbul': 'Europe/Istanbul',
    'casablanca': 'Africa/Casablanca', 'maroc': 'Africa/Casablanca', 'tunis': 'Africa/Tunis', 'tunisie': 'Africa/Tunis',
    'le caire': 'Africa/Cairo', 'dubaï': 'Asia/Dubai', 'dubai': 'Asia/Dubai', 'la mecque': 'Asia/Riyadh',
    'riyad': 'Asia/Riyadh', 'doha': 'Asia/Qatar', 'new york': 'America/New_York', 'montréal': 'America/Toronto',
    'montreal': 'America/Toronto', 'los angeles': 'America/Los_Angeles', 'tokyo': 'Asia/Tokyo',
    'pékin': 'Asia/Shanghai', 'pekin': 'Asia/Shanghai', 'moscou': 'Europe/Moscow',
}

_DONE_PHRASES = [
    "Le minuteur{label} est terminé.",
    "C'est l'heure : minuteur{label} écoulé.",
    "Fin du compte à rebours{label}.",
]


def _norm(text: str) -> str:
    t = text.strip().replace('’', "'")
    t = re.sub(r"^(?:nexus|dzaryx|hey|eh)[\s,]+", '', t, flags=re.I)
    t = re.sub(r"[\s,]*(?:nexus|stp|s'il\s+te\s+pla[iî]t)$", '', t, flags=re.I)
    return re.sub(r"[?!.]+$", '', t).strip()


def parse_duration(text: str) -> int | None:
    """« 10 minutes », « 1 heure 30 », « deux minutes trente », « une demi-heure » → secondes."""
    t = text.lower()
    total = 0
    if _HALF_RE.search(t):
        total += 1800
        t = _HALF_RE.sub(' ', t)
    if _QUARTER_RE.search(t):
        total += 900
        t = _QUARTER_RE.sub(' ', t)
    for num, unit in _DURATION_RE.findall(t):
        n = _NUM_WORDS.get(num.lower())
        if n is None:
            n = float(num.replace(',', '.'))
        u = unit.lower()
        total += int(n * (3600 if u.startswith('h') else 60 if u.startswith('m') else 1))
    # « 1 heure 30 » / « 2 minutes 30 » : nombre nu final = unité inférieure
    m = re.search(r"(heures?|h|minutes?|min)\s+(\d{1,2})\s*$", t)
    if m:
        total += int(m.group(2)) * (60 if m.group(1).startswith('h') else 1)
    return total or None


def _fmt_duration(sec: int) -> str:
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f"{h} heure{'s' if h > 1 else ''}")
    if m:
        parts.append(f"{m} minute{'s' if m > 1 else ''}")
    if s and not h:
        parts.append(f"{s} seconde{'s' if s > 1 else ''}")
    return ' '.join(parts) or '0 seconde'


def _ps(script: str, timeout: int = 10) -> subprocess.CompletedProcess:
    return subprocess.run(['powershell', '-NoProfile', '-Command', script],
                          capture_output=True, text=True, timeout=timeout)


class Extras:
    def __init__(self, notify: Callable[[str], None] | None = None) -> None:
        # notify(texte) est appelé depuis un thread quand un minuteur sonne
        self.notify = notify or (lambda msg: log.info(msg))
        self._timers: dict[int, tuple[threading.Timer, float, str]] = {}
        self._next_id = 1
        self._lock = threading.Lock()

    # ── Point d'entrée ───────────────────────────────────────────────────────
    def try_handle(self, text: str) -> str | None:
        t = _norm(text)
        if not t:
            return None
        for handler in (self._timer, self._notes, self._lists, self._system, self._tools):
            try:
                r = handler(t)
            except Exception as e:  # une commande locale ne doit jamais faire planter Nexus
                log.error('extras %s: %s', handler.__name__, e)
                return f"Je n'ai pas réussi : {e}"
            if r:
                return r
        return None

    # ── Stockage ─────────────────────────────────────────────────────────────
    def _load(self) -> dict:
        try:
            return json.loads(_DATA_FILE.read_text(encoding='utf-8'))
        except Exception:
            return {'notes': [], 'courses': [], 'todo': []}

    def _save(self, data: dict) -> None:
        _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        _DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')

    # ── Minuteurs ────────────────────────────────────────────────────────────
    def _timer(self, t: str) -> str | None:
        if _TIMER_CANCEL_RE.match(t):
            with self._lock:
                n = len(self._timers)
                for timer, _, _ in self._timers.values():
                    timer.cancel()
                self._timers.clear()
            return f"{n} minuteur{'s' if n > 1 else ''} annulé{'s' if n > 1 else ''}." if n else "Aucun minuteur en cours."
        if _TIMER_LIST_RE.match(t):
            with self._lock:
                items = sorted(self._timers.values(), key=lambda x: x[1])
            if not items:
                return "Aucun minuteur en cours."
            now = time.time()
            return ' ; '.join(f"{label or 'minuteur'} : encore {_fmt_duration(end - now)}" for _, end, label in items) + '.'
        if not _TIMER_RE.search(t):
            return None
        sec = parse_duration(t)
        if not sec:
            return "Dis-moi la durée, par exemple : « minuteur de 10 minutes »."
        m = re.search(r"\bpour\s+(.+)$", t, re.I)
        label = m.group(1).strip() if m and not _DURATION_RE.search(m.group(1)) else ''
        with self._lock:
            tid = self._next_id
            self._next_id += 1
            timer = threading.Timer(sec, self._ring, args=(tid, label))
            timer.daemon = True
            self._timers[tid] = (timer, time.time() + sec, label)
            timer.start()
        return f"Minuteur de {_fmt_duration(sec)}{' pour ' + label if label else ''} lancé."

    def _ring(self, tid: int, label: str) -> None:
        with self._lock:
            self._timers.pop(tid, None)
        try:
            import winsound
            for _ in range(3):
                winsound.Beep(880, 300)
                time.sleep(0.15)
        except Exception:
            pass
        self.notify('⏰ ' + random.choice(_DONE_PHRASES).format(label=f' pour {label}' if label else ''))

    # ── Notes ────────────────────────────────────────────────────────────────
    def _notes(self, t: str) -> str | None:
        if _NOTE_LIST_RE.match(t):
            notes = self._load().get('notes', [])
            if not notes:
                return "Tu n'as aucune note."
            return f"{len(notes)} note{'s' if len(notes) > 1 else ''} : " + ' ; '.join(
                f"{n['date']} : {n['text']}" for n in notes[-10:]) + '.'
        if _NOTE_CLEAR_RE.match(t):
            data = self._load()
            n = len(data.get('notes', []))
            data['notes'] = []
            self._save(data)
            return f"{n} note{'s' if n > 1 else ''} effacée{'s' if n > 1 else ''}."
        m = _NOTE_ADD_RE.match(t)
        # « note pour le client X » / « note client » → Dzaryx (fiche client)
        if m and not re.search(r"\bclient", m.group(1), re.I):
            data = self._load()
            data.setdefault('notes', []).append({'date': datetime.now().strftime('%d/%m %H:%M'), 'text': m.group(1).strip()})
            self._save(data)
            return "C'est noté."
        return None

    # ── Courses / to-do ──────────────────────────────────────────────────────
    @staticmethod
    def _which(t: str) -> str:
        return 'courses' if 'course' in t.lower() else 'todo'

    def _lists(self, t: str) -> str | None:
        for regex, action in ((_LIST_CLEAR_RE, 'clear'), (_LIST_ADD_RE, 'add'), (_LIST_DEL_RE, 'del'), (_LIST_SHOW_RE, 'show')):
            m = regex.match(t)
            if not m:
                continue
            key = self._which(t)
            name = 'liste de courses' if key == 'courses' else 'to-do'
            data = self._load()
            items: list[str] = data.setdefault(key, [])
            if action == 'clear':
                items.clear()
                self._save(data)
                return f"{name.capitalize()} vidée."
            if action == 'show':
                return f"{name.capitalize()} vide." if not items else f"{name.capitalize()} : " + ', '.join(items) + '.'
            new = [x.strip() for x in re.split(r",|\bet\b", m.group(1)) if x.strip()]
            if action == 'add':
                items.extend(x for x in new if x.lower() not in (i.lower() for i in items))
                self._save(data)
                return f"Ajouté à ta {name} : {', '.join(new)}."
            removed = [i for i in items if any(x.lower() in i.lower() for x in new)]
            data[key] = [i for i in items if i not in removed]
            self._save(data)
            return f"Retiré : {', '.join(removed)}." if removed else f"Je ne trouve pas ça dans ta {name}."
        return None

    # ── Système ──────────────────────────────────────────────────────────────
    def _system(self, t: str) -> str | None:
        m = _VOL_SET_RE.match(t)
        if m:
            return self.set_volume(int(m.group(1)))
        m = _VOL_UP_RE.match(t) or _VOL_DOWN_RE.match(t)
        if m:
            step = int(m.group(1)) if m.lastindex and m.group(1) else 10
            cur = self.get_volume()
            if cur is None:
                key = 175 if _VOL_UP_RE.match(t) else 174   # VK_VOLUME_UP / DOWN = 2 % par appui
                _ps(f"$w=New-Object -ComObject WScript.Shell; 1..{max(1, step // 2)} | % {{ $w.SendKeys([char]{key}) }}")
                return 'Volume monté.' if key == 175 else 'Volume baissé.'
            return self.set_volume(cur + step if _VOL_UP_RE.match(t) else cur - step)
        if _MUTE_RE.match(t):
            return self.set_mute(True)
        if _UNMUTE_RE.match(t):
            return self.set_mute(False)
        m = _BRIGHT_RE.match(t)
        if m:
            return self.set_brightness(int(m.group(1)))
        if _BRIGHT_UP_RE.match(t) or _BRIGHT_DOWN_RE.match(t):
            cur = self.get_brightness()
            if cur is None:
                return "Je ne peux pas régler la luminosité de cet écran (écran externe ?)."
            return self.set_brightness(cur + (20 if _BRIGHT_UP_RE.match(t) else -20))
        m = _SHUTDOWN_RE.match(t)
        if m:
            # Jamais d'arrêt immédiat : 60 s minimum pour pouvoir dire « annule l'arrêt »
            delay = max(60, parse_duration(m.group(1)) or 0) if m.group(1) else 60
            subprocess.run(['shutdown', '/s', '/t', str(delay)], capture_output=True)
            return f"Le PC s'éteint dans {_fmt_duration(delay)}. Dis « annule l'arrêt » pour l'empêcher."
        if _REBOOT_RE.match(t):
            subprocess.run(['shutdown', '/r', '/t', '60'], capture_output=True)
            return "Le PC redémarre dans 1 minute. Dis « annule le redémarrage » pour l'empêcher."
        if _ABORT_RE.match(t):
            r = subprocess.run(['shutdown', '/a'], capture_output=True)
            return 'Arrêt annulé.' if r.returncode == 0 else "Aucun arrêt n'était prévu."
        if _LOCK_RE.match(t):
            subprocess.run(['rundll32.exe', 'user32.dll,LockWorkStation'])
            return 'PC verrouillé.'
        if _TRASH_RE.match(t):
            _ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', timeout=60)
            return 'Corbeille vidée.'
        if _WORK_RE.match(t):
            return self.work_mode()
        return None

    @staticmethod
    def _endpoint():
        from pycaw.pycaw import AudioUtilities
        return AudioUtilities.GetSpeakers().EndpointVolume

    def get_volume(self) -> int | None:
        try:
            return round(self._endpoint().GetMasterVolumeLevelScalar() * 100)
        except Exception:
            return None

    def set_volume(self, level: int) -> str:
        level = max(0, min(100, level))
        try:
            ep = self._endpoint()
            ep.SetMute(0, None)
            ep.SetMasterVolumeLevelScalar(level / 100, None)
            return f'Volume à {level} %.'
        except Exception as e:
            log.warning('pycaw indisponible (%s) — touches volume', e)
            # 0 puis +2 % par appui : approximatif mais sans dépendance
            _ps(f"$w=New-Object -ComObject WScript.Shell; 1..50 | % {{ $w.SendKeys([char]174) }}; 1..{level // 2} | % {{ $w.SendKeys([char]175) }}", timeout=20)
            return f'Volume à environ {level} %.'

    def set_mute(self, mute: bool) -> str:
        try:
            self._endpoint().SetMute(1 if mute else 0, None)
        except Exception:
            _ps("(New-Object -ComObject WScript.Shell).SendKeys([char]173)")   # bascule muet
        return 'Son coupé.' if mute else 'Son remis.'

    @staticmethod
    def get_brightness() -> int | None:
        r = _ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness')
        try:
            return int(r.stdout.strip().splitlines()[0])
        except Exception:
            return None

    @staticmethod
    def set_brightness(level: int) -> str:
        level = max(5, min(100, level))
        r = _ps('(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop)'
                f' | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{Timeout=1;Brightness={level}}}')
        if r.returncode != 0:
            return "Je ne peux pas régler la luminosité de cet écran (écran externe ?)."
        return f'Luminosité à {level} %.'

    @staticmethod
    def work_mode() -> str:
        """Ouvre l'espace de travail. Liste réglable : NEXUS_WORK_APPS="chrome;code;explorer Documents"."""
        apps = os.getenv('NEXUS_WORK_APPS', 'chrome;explorer shell:Downloads;explorer shell:Personal').split(';')
        opened = []
        for cmd in filter(None, (a.strip() for a in apps)):
            try:
                subprocess.Popen(f'start "" {cmd}', shell=True)
                opened.append(cmd.split()[0])
            except Exception as e:
                log.warning('mode boulot %s: %s', cmd, e)
        playlist = os.getenv('NEXUS_WORK_PLAYLIST', '')   # ex. spotify:playlist:37i9dQZF1DX8NTLI2TtZa6
        if playlist:
            subprocess.Popen(f'start "" "{playlist}"', shell=True)
            opened.append('musique')
        return f"Espace de travail prêt : {', '.join(opened)}." if opened else "Aucune application configurée (NEXUS_WORK_APPS)."

    # ── Petits outils ────────────────────────────────────────────────────────
    def _tools(self, t: str) -> str | None:
        m = _PASSWORD_RE.match(t)
        if m:
            n = max(8, min(64, int(m.group(1) or 16)))
            alphabet = string.ascii_letters + string.digits + '!@#$%&*-_?'
            pwd = ''.join(secrets.choice(alphabet) for _ in range(n))
            try:
                import pyperclip
                pyperclip.copy(pwd)
                return f"Mot de passe de {n} caractères copié dans le presse-papiers (je ne le dis pas à voix haute)."
            except Exception:
                return f"Mot de passe : {pwd}"
        if _COIN_RE.match(t):
            return random.choice(['Pile.', 'Face.'])
        m = _DICE_RE.match(t)
        if m:
            n = max(1, min(10, int(m.group(1) or 1)))
            rolls = [random.randint(1, 6) for _ in range(n)]
            return f"{rolls[0]}." if n == 1 else f"{', '.join(map(str, rolls))} — total {sum(rolls)}."
        m = _CITY_TIME_RE.match(t)
        if m:
            city = m.group(1).strip().lower()
            tz = _CITIES.get(city)
            if not tz:
                return None   # ville inconnue → Dzaryx
            from zoneinfo import ZoneInfo
            now = datetime.now(ZoneInfo(tz))
            return f"À {m.group(1).strip().title()}, il est {now.hour}h{now.minute:02d}."
        return None
