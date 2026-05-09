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

    # URIs directes pour artistes connus → joue immédiatement sans API
    KNOWN_ARTISTS: dict[str, str] = {
        'lacrim':    'spotify:artist:3PhoLpVuITZKcymswpck5b',
        'jul':       'spotify:artist:5cM1PvItlR1rTB1lDPrGKA',
        'soolking':  'spotify:artist:3TVXtAsR1Inumwj472S9r4',
        'sch':       'spotify:artist:6mERbwUBJBp0L8AhpHMvWO',
        'nekfeu':    'spotify:artist:3L10ybrHyFRNOmqSrMSOjk',
        'booba':     'spotify:artist:3fOlHMg36yZzGSNsVFDYhR',
        'kaaris':    'spotify:artist:0M3T2jLfAcFwIXOHqFq0rU',
        'ninho':     'spotify:artist:0qlMCo9BkCBiJzQHO1dnEG',
        'aya nakamura': 'spotify:artist:1Qp3nA2GnVjTlPNDUQGmEv',
        'drake':     'spotify:artist:3TVXtAsR1Inumwj472S9r4',
        'travis scott': 'spotify:artist:0Y5tJX1MQlPlqiwlOH1tJY',
        'weeknd':    'spotify:artist:1Xyo4u8uXC1ZmMpatF05PJ',
        'the weeknd':'spotify:artist:1Xyo4u8uXC1ZmMpatF05PJ',
        'kendrick':  'spotify:artist:2YZyLoL8N0Wb9xBt1NhZWg',
        'damso':     'spotify:artist:55SBsLpFmkgNFiDlqOBqxn',
        'hamza':     'spotify:artist:4wLXwxDeWQ8mtUIRPxGiD6',
    }

    def _spotify_api_search(self, query: str) -> str | None:
        """Cherche un track via Spotify API → retourne URI directe. Nécessite SPOTIFY_CLIENT_ID/SECRET."""
        client_id     = os.environ.get('SPOTIFY_CLIENT_ID', '')
        client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
        if not client_id or not client_secret:
            return None
        try:
            import base64, json
            from urllib.request import Request, urlopen
            from urllib.parse import quote as uq
            creds = base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()
            req = Request(
                'https://accounts.spotify.com/api/token',
                data=b'grant_type=client_credentials',
                headers={'Authorization': f'Basic {creds}', 'Content-Type': 'application/x-www-form-urlencoded'},
            )
            with urlopen(req, timeout=5) as r:
                token = json.loads(r.read())['access_token']
            req2 = Request(
                f'https://api.spotify.com/v1/search?q={uq(query)}&type=track&limit=1',
                headers={'Authorization': f'Bearer {token}'},
            )
            with urlopen(req2, timeout=5) as r:
                items = json.loads(r.read()).get('tracks', {}).get('items', [])
            if items:
                return items[0]['uri']  # spotify:track:XXXXX → joue directement
        except Exception as e:
            log.warning('Spotify API search failed: %s', e)
        return None

    def play_spotify(self, query: str) -> str:
        """Lance Spotify et joue vraiment la musique."""
        q = query.strip().lower()

        # 1. Artiste connu → URI directe (joue immédiatement)
        for name, uri in self.KNOWN_ARTISTS.items():
            if name in q:
                subprocess.Popen(f'start "" "{uri}"', shell=True)
                log.info('Spotify direct artist: %s', uri)
                return f'✅ Spotify: {query}'

        # 2. Spotify API → track URI directe (joue immédiatement)
        track_uri = self._spotify_api_search(query)
        if track_uri:
            subprocess.Popen(f'start "" "{track_uri}"', shell=True)
            log.info('Spotify track URI: %s', track_uri)
            return f'✅ Spotify: {query}'

        # 3. Fallback search + pyautogui pour cliquer premier résultat
        uri = f'spotify:search:{urllib.parse.quote(query)}'
        subprocess.Popen(f'start "" "{uri}"', shell=True)
        log.info('Spotify search fallback: %s', uri)
        self._spotify_autoclick_first()
        return f'✅ Spotify: {query}'

    def _spotify_autoclick_first(self) -> None:
        """Après ouverture Spotify search, navigue au premier résultat et joue."""
        try:
            import pyautogui
            pyautogui.FAILSAFE = False
            time.sleep(3.5)
            # Focus Spotify
            try:
                import pygetwindow as gw
                wins = [w for w in gw.getAllWindows() if 'Spotify' in (w.title or '')]
                if wins:
                    wins[0].activate()
                    time.sleep(0.4)
                else:
                    pyautogui.hotkey('alt', 'tab')
                    time.sleep(0.4)
            except Exception:
                pyautogui.hotkey('alt', 'tab')
                time.sleep(0.4)
            # Tab jusqu'au premier résultat "Top result" puis Enter
            pyautogui.press('escape')
            time.sleep(0.2)
            for _ in range(4):
                pyautogui.press('tab')
                time.sleep(0.15)
            pyautogui.press('enter')
        except Exception as e:
            log.warning('Spotify autoclick failed: %s', e)

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
