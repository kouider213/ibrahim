"""
NEXUS App Installer
Installe des applications via winget (Windows Package Manager).
Fallback: ouvre la page de téléchargement dans Chrome.
"""
import logging
import re
import subprocess
import webbrowser
from pathlib import Path

log = logging.getLogger('nexus.installer')

# winget IDs + download URLs
APP_REGISTRY: dict[str, dict] = {
    'runway':            {'winget': None,                                   'url': 'https://app.runwayml.com/'},
    'capcut':            {'winget': 'ByteDance.CapCut',                     'url': 'https://www.capcut.com/'},
    'vscode':            {'winget': 'Microsoft.VisualStudioCode',           'url': None},
    'vs code':           {'winget': 'Microsoft.VisualStudioCode',           'url': None},
    'visual studio code':{'winget': 'Microsoft.VisualStudioCode',           'url': None},
    'discord':           {'winget': 'Discord.Discord',                      'url': None},
    'zoom':              {'winget': 'Zoom.Zoom',                            'url': None},
    'obs':               {'winget': 'OBSProject.OBSStudio',                 'url': None},
    'obs studio':        {'winget': 'OBSProject.OBSStudio',                 'url': None},
    'vlc':               {'winget': 'VideoLAN.VLC',                         'url': None},
    'git':               {'winget': 'Git.Git',                              'url': None},
    'nodejs':            {'winget': 'OpenJS.NodeJS.LTS',                    'url': None},
    'node':              {'winget': 'OpenJS.NodeJS.LTS',                    'url': None},
    'python':            {'winget': 'Python.Python.3.12',                   'url': None},
    'chrome':            {'winget': 'Google.Chrome',                        'url': None},
    'google chrome':     {'winget': 'Google.Chrome',                        'url': None},
    'firefox':           {'winget': 'Mozilla.Firefox',                      'url': None},
    '7zip':              {'winget': '7zip.7zip',                            'url': None},
    'notepadpp':         {'winget': 'Notepad++.Notepad++',                  'url': None},
    'notepad++':         {'winget': 'Notepad++.Notepad++',                  'url': None},
    'telegram':          {'winget': 'Telegram.TelegramDesktop',             'url': None},
    'spotify':           {'winget': 'Spotify.Spotify',                      'url': None},
    'handbrake':         {'winget': 'HandBrake.HandBrake',                  'url': None},
    'davinci':           {'winget': 'BlackmagicDesign.DaVinciResolve',      'url': 'https://www.blackmagicdesign.com/fr/products/davinciresolve'},
    'davinci resolve':   {'winget': 'BlackmagicDesign.DaVinciResolve',      'url': 'https://www.blackmagicdesign.com/fr/products/davinciresolve'},
    'blender':           {'winget': 'BlenderFoundation.Blender',            'url': None},
    'postman':           {'winget': 'Postman.Postman',                      'url': None},
    'figma':             {'winget': 'Figma.Figma',                          'url': None},
    'audacity':          {'winget': 'Audacity.Audacity',                    'url': None},
    'winrar':            {'winget': 'RARLab.WinRAR',                        'url': None},
    'powertoys':         {'winget': 'Microsoft.PowerToys',                  'url': None},
    'windows terminal':  {'winget': 'Microsoft.WindowsTerminal',            'url': None},
    'wt':                {'winget': 'Microsoft.WindowsTerminal',            'url': None},
    'claude':            {'winget': None,                                   'url': 'https://claude.ai/download'},
    'copilot':           {'winget': None,                                   'url': 'https://github.com/features/copilot'},
}


def _normalize(name: str) -> str:
    return re.sub(r'[\s_-]+', ' ', name.lower().strip())


class AppInstaller:

    def search_winget(self, name: str) -> str:
        try:
            r = subprocess.run(
                ['winget', 'search', name],
                capture_output=True, text=True, timeout=25,
                encoding='utf-8', errors='replace',
            )
            lines = (r.stdout or '').strip().split('\n')[:12]
            return '\n'.join(lines) or '❌ Aucun résultat'
        except FileNotFoundError:
            return '❌ winget non disponible sur ce PC'
        except Exception as e:
            return f'❌ Erreur recherche: {e}'

    def install(self, name: str) -> str:
        key = _normalize(name)
        info = None
        for app_key, app_info in APP_REGISTRY.items():
            if key == _normalize(app_key) or _normalize(app_key) in key or key in _normalize(app_key):
                info = app_info
                break

        if info:
            if info.get('winget'):
                return self._winget_install(info['winget'], name)
            elif info.get('url'):
                return self._open_download(info['url'], name)

        # Fallback: winget install par nom direct
        return self._winget_install_by_name(name)

    def _winget_install(self, winget_id: str, display_name: str) -> str:
        log.info('winget install %s (%s)', display_name, winget_id)
        try:
            subprocess.Popen(
                ['winget', 'install', '--id', winget_id, '-e',
                 '--accept-source-agreements', '--accept-package-agreements'],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            return f'✅ Installation de {display_name} lancée dans le terminal — winget ID: {winget_id}'
        except FileNotFoundError:
            webbrowser.open(f'https://www.google.com/search?q=télécharger+{display_name.replace(" ","+")}')
            return f'⚠️ winget introuvable — Google ouvert pour {display_name}'
        except Exception as e:
            return f'❌ Erreur installation: {e}'

    def _winget_install_by_name(self, name: str) -> str:
        log.info('winget install "%s" par nom', name)
        try:
            subprocess.Popen(
                ['winget', 'install', name,
                 '--accept-source-agreements', '--accept-package-agreements'],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
            )
            return f'✅ Installation de {name} lancée — fenêtre terminal ouverte'
        except FileNotFoundError:
            webbrowser.open(f'https://www.google.com/search?q=télécharger+{name.replace(" ","+")}')
            return f'⚠️ winget indisponible — recherche Google ouverte pour {name}'
        except Exception as e:
            return f'❌ Erreur: {e}'

    def _open_download(self, url: str, name: str) -> str:
        webbrowser.open(url)
        return f'✅ Page de téléchargement {name} ouverte dans le navigateur'

    def try_handle(self, text: str) -> str | None:
        tl = text.lower().strip()
        m = re.search(r'\b(?:installe?|t[eé]l[eé]charge?|download|install)\s+(.+)', tl, re.I)
        if not m:
            return None
        app_name = m.group(1).strip()
        # Évite de capturer "installe" dans des phrases générales
        if len(app_name) < 2 or any(w in app_name for w in ['moi', 'le', 'la', 'les', 'un', 'une']):
            return None
        return self.install(app_name)
