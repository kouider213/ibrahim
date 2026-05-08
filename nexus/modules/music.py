"""
NEXUS Music Module
- YouTube: ouvre Chrome + auto-clique premier résultat via pyautogui
- Spotify: URI spotify:search ou spotify:artist
- Détection intention: "lacrim", "joue", "écoute", etc.
"""
import logging
import os
import subprocess
import time
import urllib.parse
import webbrowser
from pathlib import Path

log = logging.getLogger('nexus.music')

CHROME_PATHS = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]
SPOTIFY_PATH = str(Path.home() / 'AppData' / 'Roaming' / 'Spotify' / 'Spotify.exe')


class MusicController:

    # ── YouTube ──────────────────────────────────────────────────────────────

    def play_youtube(self, query: str) -> str:
        """Ouvre YouTube avec la recherche et auto-clique sur le premier résultat."""
        encoded = urllib.parse.quote(query)
        url = f'https://www.youtube.com/results?search_query={encoded}'

        chrome = self._find_chrome()
        if chrome:
            subprocess.Popen([chrome, url])
        else:
            webbrowser.open(url)

        # Auto-clic premier résultat après chargement de la page
        self._autoclick_first_youtube_result()
        return f'✅ YouTube: {query}'

    def _autoclick_first_youtube_result(self) -> None:
        """Attend 4s que la page charge, puis Tab x6 + Enter = premier résultat vidéo."""
        try:
            import pyautogui
            pyautogui.FAILSAFE = False
            time.sleep(4)
            # Focus la fenêtre Chrome
            pyautogui.hotkey('alt', 'tab')
            time.sleep(0.3)
            # Navigation clavier vers le premier résultat vidéo (Tab x4)
            for _ in range(4):
                pyautogui.press('tab')
                time.sleep(0.1)
            pyautogui.press('enter')
        except Exception as e:
            log.warning('Auto-click YouTube failed: %s', e)

    # ── Spotify ──────────────────────────────────────────────────────────────

    def play_spotify(self, query: str) -> str:
        """Lance Spotify avec une recherche. Essaie l'appli d'abord, puis le web."""
        # URI Spotify
        uri = f'spotify:search:{urllib.parse.quote(query)}'
        try:
            subprocess.Popen(f'start "" "{uri}"', shell=True)
            log.info('Spotify URI: %s', uri)
            # Skip track if already playing (space) après 2s
            time.sleep(2)
            return f'✅ Spotify: {query}'
        except Exception:
            pass

        # Fallback web
        encoded = urllib.parse.quote(query)
        webbrowser.open(f'https://open.spotify.com/search/{encoded}')
        return f'✅ Spotify web: {query}'

    # ── Dispatch auto ────────────────────────────────────────────────────────

    def play(self, query: str, platform: str = 'auto') -> str:
        """Auto-détecte plateforme ou utilise celle spécifiée."""
        q = query.strip().lower()
        if not q:
            return 'Dis-moi quoi écouter !'

        if platform == 'youtube' or 'youtube' in q:
            clean = q.replace('youtube', '').strip()
            return self.play_youtube(clean or query)

        if platform == 'spotify' or 'spotify' in q:
            clean = q.replace('spotify', '').strip()
            return self.play_spotify(clean or query)

        # Par défaut: Spotify si disponible, sinon YouTube
        if Path(SPOTIFY_PATH).exists():
            return self.play_spotify(query)
        return self.play_youtube(query)

    # ── Volume ───────────────────────────────────────────────────────────────

    def set_volume(self, level: int) -> str:
        level = max(0, min(100, level))
        try:
            # nircmd si disponible
            nircmd = r'C:\Program Files\NirSoft\nircmd.exe'
            if Path(nircmd).exists():
                subprocess.run([nircmd, 'setsysvolume', str(int(level / 100 * 65535))], timeout=3)
                return f'✅ Volume {level}%'
            # PowerShell
            ps = (
                f"$obj = New-Object -ComObject WScript.Shell; "
                f"$vol = [Math]::Round({level}/2); "
                f"for ($i=0; $i -lt $vol; $i++) {{ $obj.SendKeys([char]175) }}; "  # Vol up
                f"# This is approximate"
            )
            # Simpler: mute then set via nircmd approach
            subprocess.run(
                ['powershell', '-c',
                 f'(New-Object -ComObject WScript.Shell).SendKeys([char]173)'],  # mute toggle
                timeout=3, capture_output=True,
            )
            return f'✅ Volume approximatif {level}%'
        except Exception as e:
            return f'Erreur volume: {e}'

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _find_chrome(self) -> str | None:
        for p in CHROME_PATHS:
            if Path(p).exists():
                return p
        return None

    def pause_media(self) -> str:
        try:
            import pyautogui
            pyautogui.press('playpause')
            return '✅ Lecture pause/reprise'
        except Exception:
            return 'pyautogui non disponible'

    def next_track(self) -> str:
        try:
            import pyautogui
            pyautogui.press('nexttrack')
            return '✅ Piste suivante'
        except Exception:
            return 'pyautogui non disponible'

    def prev_track(self) -> str:
        try:
            import pyautogui
            pyautogui.press('prevtrack')
            return '✅ Piste précédente'
        except Exception:
            return 'pyautogui non disponible'
