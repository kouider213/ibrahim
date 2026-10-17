"""
NEXUS PC Control — Windows automation
Direct local commands handled here (no Dzaryx round-trip).
"""
import difflib
import logging
import os
import re
import subprocess
import unicodedata
import webbrowser
from pathlib import Path

log = logging.getLogger('nexus.pc')

USER_HOME = Path.home()

APP_MAP: dict[str, str] = {
    'spotify':            'spotify',
    'chrome':             r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'google chrome':      r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'firefox':            r'C:\Program Files\Mozilla Firefox\firefox.exe',
    'edge':               'msedge',
    'vscode':             'code',
    'vs code':            'code',
    'visual studio code': 'code',
    'terminal':           'wt.exe',
    'windows terminal':   'wt.exe',
    'cmd':                'cmd.exe',
    'invite de commandes':'cmd.exe',
    'powershell':         'powershell.exe',
    'notepad':            'notepad.exe',
    'bloc-notes':         'notepad.exe',
    'calculatrice':       'calc.exe',
    'calculator':         'calc.exe',
    'explorateur':        'explorer.exe',
    'word':               'winword',
    'excel':              'excel',
    'vlc':                'vlc',
    'discord':            'discord',
    'telegram':           'telegram',
    'zoom':               'zoom',
    'obs':                'obs64',
    'task manager':       'taskmgr',
    'gestionnaire tâches':'taskmgr',
    'paint':              'mspaint',
    'paint 3d':           'ms-paint:',
    'paint3d':            'ms-paint:',
    'snipping tool':      'SnippingTool',
    'capture':            'SnippingTool',
    'claude code':        'claude',
    'claude':             'claude',
    'codex':              'codex',
    'git bash':           r'C:\Program Files\Git\bin\bash.exe',
    'git':                r'C:\Program Files\Git\bin\bash.exe',
    'figma':              'figma',
    'postman':            'postman',
    'blender':            'blender',
    'audacity':           'audacity',
}

def _desktop() -> Path:
    for p in (USER_HOME / 'OneDrive' / 'Bureau', USER_HOME / 'OneDrive' / 'Desktop', USER_HOME / 'Desktop', USER_HOME / 'Bureau'):
        if p.is_dir():
            return p
    return USER_HOME / 'Desktop'


DESKTOP = _desktop()

FOLDER_MAP: dict[str, str] = {
    'bureau':          str(DESKTOP),
    'desktop':         str(DESKTOP),
    'documents':       str(USER_HOME / 'Documents'),
    'téléchargements': str(USER_HOME / 'Downloads'),
    'downloads':       str(USER_HOME / 'Downloads'),
    'images':          str(USER_HOME / 'Pictures'),
    'photos':          str(USER_HOME / 'Pictures'),
    'vidéos':          str(USER_HOME / 'Videos'),
    'videos':          str(USER_HOME / 'Videos'),
    'onedrive':        str(USER_HOME / 'OneDrive'),
    'nexus':           str(DESKTOP / 'Nexus'),
    'dzaryx':          str(DESKTOP / 'Dzaryx'),
    'musique':         str(USER_HOME / 'Music'),
    'ibrahim':         str(USER_HOME / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim'),
}

_OPEN_RE       = re.compile(r'\b(ouvre?|lance|démarre?|start|open)\b', re.I)
_SCREENSHOT_RE = re.compile(r'\b(screenshot|capture|écran|photo\s*écran)\b', re.I)
_MUSIC_RE      = re.compile(r'^\s*(?:mets|met|joue|lance|play)\b.*\b(?:musique|chanson|son|playlist|album|morceau|titre|spotify)\b|^\s*(?:joue|play)\s', re.I)
_SEARCH_RE     = re.compile(r'^\s*(?:cherche|recherche|search|google)\w*\b(?=.*\b(?:sur\s+google|sur\s+internet|sur\s+le\s+web|en\s+ligne)\b)|^\s*google\s', re.I)
_FOLDER_WORD   = re.compile(r'\b(?:dossier|répertoire|repertoire|fichier)s?\b', re.I)
_SKIP_DIRS     = {'node_modules', '.git', '__pycache__', 'appdata', '$recycle.bin', 'windows', 'program files', '.venv', 'venv'}


def _fold(t: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', t.lower()) if unicodedata.category(c) != 'Mn')


def find_folders(name: str, limit: int = 6, max_depth: int = 4) -> list[Path]:
    """Dossiers dont le nom ressemble à `name` (Bureau, Documents, Téléchargements, Images, Vidéos, OneDrive…)."""
    want = _fold(name).strip(' .,!?\'"')
    if not want:
        return []
    roots = [DESKTOP, USER_HOME / 'Documents', USER_HOME / 'Downloads', USER_HOME / 'Pictures', USER_HOME / 'Videos',
             USER_HOME / 'Music', USER_HOME / 'OneDrive', USER_HOME]
    scored: list[tuple[float, int, Path]] = []
    seen: set[str] = set()
    for root in roots:
        if not root.is_dir():
            continue
        base_depth = len(root.parts)
        for cur, dirs, _files in os.walk(root):
            depth = len(Path(cur).parts) - base_depth
            dirs[:] = [d for d in dirs if _fold(d) not in _SKIP_DIRS and not d.startswith('.')] if depth < max_depth else []
            if root == USER_HOME and depth >= 1:
                dirs[:] = []
            for d in dirs:
                p = Path(cur) / d
                if str(p).lower() in seen:
                    continue
                seen.add(str(p).lower())
                dn = _fold(d)
                if dn == want:
                    score = 1.0
                elif want in dn or dn in want and len(dn) > 3:
                    score = .85 - abs(len(dn) - len(want)) / 200
                else:
                    score = difflib.SequenceMatcher(None, want, dn).ratio() * .8
                if score >= .62:
                    scored.append((score, depth, p))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [p for _, _, p in scored[:limit]]
_SLEEP_RE      = re.compile(r'\b(dors?|veille|sleep|suspend|mise\s*en\s*veille)\b', re.I)
_VOLUME_RE     = re.compile(r'\bvolume\s+(\d+)\b', re.I)


class PCControl:
    def try_handle(self, text: str) -> str | None:
        """
        Try to handle locally.
        Returns result string if handled, None if Dzaryx should process it.
        """
        t = text.lower().strip()

        if _SCREENSHOT_RE.search(t):
            return self.take_screenshot()

        if _SLEEP_RE.search(t):
            return self.sleep_pc()

        m = _VOLUME_RE.search(t)
        if m:
            return self.set_volume(int(m.group(1)))

        if _MUSIC_RE.search(t):
            query = _MUSIC_RE.sub('', text).strip(' \t\n-–—:')
            return self.play_music(query or 'top hits')

        if _SEARCH_RE.search(t):
            query = _SEARCH_RE.sub('', text).strip()
            query = re.sub(r'^(sur\s+google|sur\s+internet|sur\s+le\s+web)', '', query, flags=re.I).strip()
            if query:
                return self.web_search(query)

        if _OPEN_RE.search(t):
            if _FOLDER_WORD.search(t):
                m = re.search(r'\b(?:dossier|r[ée]pertoire)s?\s+(?:(?:de|des|du|d\'|le|la|les|mes|mon|ma)\s*)*(.+)$', t)
                name = m.group(1).strip(' .!?') if m else ''
                for key, path in FOLDER_MAP.items():
                    if name == key or name in (key + 's',):
                        return self.open_folder(key)
                if name:
                    found = find_folders(name)
                    if found:
                        return self.open_folder(str(found[0])) + (f' ({len(found) - 1} autres dossiers ressemblants)' if len(found) > 1 else '')
                return None                     # introuvable ici → l'agent PC cherche plus loin
            for key in sorted(APP_MAP, key=len, reverse=True):
                if re.search(rf'(?<![\w-]){re.escape(key)}(?![\w-])', t):
                    return self.open_app(key)
            for key in FOLDER_MAP:
                if re.search(rf'\b{re.escape(key)}\b', t):
                    return self.open_folder(key)

        return None  # Let Dzaryx handle

    # ── Actions ──────────────────────────────────────────────────────────────

    def open_app(self, name: str) -> str:
        cmd = APP_MAP.get(name.lower().strip(), name)
        try:
            if Path(cmd).exists():
                subprocess.Popen([cmd], shell=False)
            else:
                subprocess.Popen(cmd, shell=True)
            return f'✅ {name.title()} lancé'
        except Exception as e:
            return f'Impossible de lancer {name}: {e}'

    def open_folder(self, path: str) -> str:
        resolved = FOLDER_MAP.get(path.lower().strip(), path)
        if not Path(resolved).is_dir():
            return f'Le dossier {Path(resolved).name} n\'existe pas sur ce PC.'
        try:
            os.startfile(resolved) if os.name == 'nt' else subprocess.Popen(['xdg-open', resolved])
            return f'✅ Dossier {Path(resolved).name} ouvert'
        except Exception as e:
            return f'Erreur dossier: {e}'

    def web_search(self, query: str) -> str:
        webbrowser.open(f'https://www.google.com/search?q={query.replace(" ", "+")}')
        return f'✅ Google: {query}'

    def play_music(self, query: str) -> str:
        try:
            subprocess.run(f'start spotify:search:{query}', shell=True, timeout=3)
            return f'✅ Spotify: {query}'
        except Exception:
            webbrowser.open(f'https://open.spotify.com/search/{query.replace(" ", "%20")}')
            return f'✅ Spotify web: {query}'

    def take_screenshot(self) -> str:
        import time
        ts   = time.strftime('%Y%m%d_%H%M%S')
        dest = str(USER_HOME / 'OneDrive' / 'Bureau' / f'screenshot_{ts}.png')

        # 1. mss — rapide, pas de dépendance Pillow
        try:
            import mss
            import mss.tools
            with mss.mss() as sct:
                monitor = sct.monitors[0]  # tout l'écran
                shot = sct.grab(monitor)
                mss.tools.to_png(shot.rgb, shot.size, output=dest)
            subprocess.Popen(['explorer', '/select,', dest])
            return dest  # retourne le chemin pour envoi Telegram

        except Exception:
            pass

        # 2. PowerShell — fallback universel Windows
        try:
            ps = (
                "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
                "$bmp=New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,"
                "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height);"
                "$g=[System.Drawing.Graphics]::FromImage($bmp);"
                "$g.CopyFromScreen(0,0,0,0,$bmp.Size);"
                f"$bmp.Save('{dest}');"
                "$g.Dispose();$bmp.Dispose()"
            )
            subprocess.run(['powershell', '-c', ps], timeout=12, capture_output=True)
            if Path(dest).exists():
                subprocess.Popen(['explorer', '/select,', dest])
                return dest
        except Exception:
            pass

        # 3. Dernier recours
        subprocess.Popen('snippingtool', shell=True)
        return '✅ Outil capture ouvert (sauvegarde manuelle)'

    def sleep_pc(self) -> str:
        subprocess.run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', shell=True)
        return '✅ PC en veille'

    def set_volume(self, level: int) -> str:
        level = max(0, min(100, level))
        # nircmd approach (silent fail if not installed), fallback PowerShell
        nircmd = r'C:\Program Files\NirSoft\nircmd.exe'
        if Path(nircmd).exists():
            subprocess.run([nircmd, 'setsysvolume', str(int(level / 100 * 65535))], timeout=3)
        else:
            ps = f'$vol={level}/100;(New-Object -ComObject WScript.Shell).SendKeys([char]173)'
            subprocess.run(['powershell', '-c', ps], timeout=5)
        return f'✅ Volume {level}%'

    def run_command(self, cmd: str) -> str:
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True,
                text=True, timeout=15, encoding='utf-8', errors='replace',
            )
            return ((result.stdout or result.stderr or 'OK').strip())[:500]
        except subprocess.TimeoutExpired:
            return 'Timeout'
        except Exception as e:
            return f'Erreur: {e}'
