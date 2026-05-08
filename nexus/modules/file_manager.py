"""
NEXUS File Manager — Phase 4
Parcourir, ouvrir, envoyer fichiers depuis Telegram/GUI.
"""
import logging
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path

log = logging.getLogger('nexus.files')

USER_HOME = Path.home()

# ── Dossiers shortcuts ────────────────────────────────────────────────────────
FOLDER_SHORTCUTS: dict[str, Path] = {
    'bureau':           USER_HOME / 'OneDrive' / 'Bureau',
    'desktop':          USER_HOME / 'OneDrive' / 'Bureau',
    'documents':        USER_HOME / 'Documents',
    'téléchargements':  USER_HOME / 'Downloads',
    'downloads':        USER_HOME / 'Downloads',
    'images':           USER_HOME / 'Pictures',
    'musique':          USER_HOME / 'Music',
    'vidéos':           USER_HOME / 'Videos',
    'ibrahim':          USER_HOME / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim',
}

# ── Extensions lisibles humainement ──────────────────────────────────────────
EXT_LABELS: dict[str, str] = {
    '.pdf': '📄', '.docx': '📝', '.doc': '📝', '.xlsx': '📊', '.xls': '📊',
    '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.mp4': '🎬', '.mp3': '🎵',
    '.zip': '📦', '.rar': '📦', '.txt': '📃', '.py': '🐍', '.ts': '⚙️',
    '.exe': '⚡', '.lnk': '🔗',
}

_LIST_RE   = re.compile(r'\b(liste|montre|affiche|voir|lister|quels?\s+fichiers?)\b', re.I)
_OPEN_RE   = re.compile(r'\b(ouvre?|lance?|affiche?)\s+(?:le\s+fichier\s+)?(.+)', re.I)
_SEND_RE   = re.compile(r'\b(envoie?|envoyer|send)\s+(?:le\s+fichier\s+|le\s+)?(.+?)\s+(?:sur|via|à|à)\s+telegram\b', re.I)
_FIND_RE   = re.compile(r'\b(cherche?|trouve?|find)\s+(?:le\s+fichier\s+)?(.+)', re.I)
_RECENT_RE = re.compile(r'\b(récents?|derniers?\s+fichiers?|recent\s+files?)\b', re.I)
_DELETE_RE = re.compile(r'\b(supprime?|efface?|delete)\s+(?:le\s+fichier\s+)?(.+)', re.I)


def _fmt_size(n: int) -> str:
    if n < 1024:       return f'{n} B'
    if n < 1_048_576:  return f'{n//1024} KB'
    return f'{n//1_048_576} MB'


def _resolve_path(text: str) -> Path | None:
    """Resolve folder name or path from text."""
    t = text.strip().lower()
    for key, folder in FOLDER_SHORTCUTS.items():
        if key in t:
            return folder
    p = Path(text.strip())
    if p.exists():
        return p
    return None


class FileManager:

    def list_dir(self, path_text: str = 'bureau', max_items: int = 20) -> str:
        folder = _resolve_path(path_text) or (USER_HOME / 'OneDrive' / 'Bureau')
        if not folder.is_dir():
            return f'❌ Dossier introuvable: {folder}'
        try:
            entries = sorted(folder.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
            lines: list[str] = [f'📁 {folder.name}/']
            for e in entries[:max_items]:
                ico  = '📁' if e.is_dir() else EXT_LABELS.get(e.suffix.lower(), '📄')
                size = _fmt_size(e.stat().st_size) if e.is_file() else ''
                date = datetime.fromtimestamp(e.stat().st_mtime).strftime('%d/%m %H:%M')
                lines.append(f'  {ico} {e.name}  {size}  {date}')
            if len(entries) > max_items:
                lines.append(f'  … +{len(entries) - max_items} autres')
            return '\n'.join(lines)
        except PermissionError:
            return '❌ Accès refusé'

    def open_file(self, name: str) -> str:
        # Try current dir shortcuts first
        for key, folder in FOLDER_SHORTCUTS.items():
            if key in name.lower():
                subprocess.Popen(['explorer', str(folder)])
                return f'✅ Ouvert: {folder.name}'
        # Try exact path
        p = Path(name)
        if p.exists():
            os.startfile(str(p))
            return f'✅ Ouvert: {p.name}'
        # Search on Desktop
        desktop = USER_HOME / 'OneDrive' / 'Bureau'
        for f in desktop.rglob('*'):
            if name.lower() in f.name.lower():
                os.startfile(str(f))
                return f'✅ Ouvert: {f.name}'
        return f'❌ Fichier introuvable: {name}'

    def find_file(self, name: str, search_root: str = 'bureau') -> str:
        root = _resolve_path(search_root) or (USER_HOME / 'OneDrive' / 'Bureau')
        results: list[Path] = []
        try:
            for f in root.rglob(f'*{name}*'):
                results.append(f)
                if len(results) >= 10:
                    break
        except PermissionError:
            pass
        if not results:
            return f'❌ Aucun fichier "{name}" trouvé dans {root.name}'
        lines = [f'🔍 Résultats pour "{name}":']
        for f in results:
            ico = EXT_LABELS.get(f.suffix.lower(), '📄') if f.is_file() else '📁'
            lines.append(f'  {ico} {f.name}  ({f.parent.name}/)')
        return '\n'.join(lines)

    def get_recent_files(self, folder_text: str = 'bureau', n: int = 8) -> str:
        folder = _resolve_path(folder_text) or (USER_HOME / 'OneDrive' / 'Bureau')
        try:
            files = [f for f in folder.iterdir() if f.is_file()]
            files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
            if not files:
                return f'Aucun fichier dans {folder.name}'
            lines = [f'🕐 Derniers fichiers — {folder.name}:']
            for f in files[:n]:
                ico  = EXT_LABELS.get(f.suffix.lower(), '📄')
                date = datetime.fromtimestamp(f.stat().st_mtime).strftime('%d/%m %H:%M')
                lines.append(f'  {ico} {f.name}  {date}')
            return '\n'.join(lines)
        except PermissionError:
            return '❌ Accès refusé'

    def get_file_path_for_telegram(self, name: str) -> Path | None:
        """Find a file to send on Telegram — returns Path if found."""
        p = Path(name)
        if p.exists() and p.is_file():
            return p
        desktop = USER_HOME / 'OneDrive' / 'Bureau'
        for root in [desktop, USER_HOME / 'Documents', USER_HOME / 'Downloads']:
            for f in root.rglob(f'*{name}*'):
                if f.is_file():
                    return f
        return None

    def try_handle(self, text: str) -> str | None:
        t = text.strip()
        tl = t.lower()

        if _RECENT_RE.search(tl):
            # "derniers fichiers du bureau"
            folder = 'bureau'
            for key in FOLDER_SHORTCUTS:
                if key in tl:
                    folder = key
                    break
            return self.get_recent_files(folder)

        if _LIST_RE.search(tl):
            folder = 'bureau'
            for key in FOLDER_SHORTCUTS:
                if key in tl:
                    folder = key
                    break
            return self.list_dir(folder)

        m = _FIND_RE.search(tl)
        if m:
            return self.find_file(m.group(2).strip())

        m = _OPEN_RE.search(t)
        if m:
            return self.open_file(m.group(2).strip())

        return None
