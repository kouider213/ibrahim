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


# ── Rangement ─────────────────────────────────────────────────────────────────
_FOLDER_WORDS = r'(bureau|desktop|documents|t[eé]l[eé]chargements|downloads|images|musique|vid[eé]os)'
# Le dossier (ou « mes fichiers ») est obligatoire : « range la voiture » ne doit rien déclencher
_ORGANIZE_RE = re.compile(
    rf'\b(range|ranger|trie|trier|organise|organiser|classe|classer|nettoie|nettoyer)\s+'
    rf'(?:(?:le|la|les|mon|ma|mes)\s+)?(?:fichiers?(?:\s+(?:du|de\s+la|des|de)\s+)?(?:(?:le|la|les|mon|ma|mes)\s+)?)?'
    rf'(?:{_FOLDER_WORDS}|(?<=fichiers)|(?<=fichier))', re.I)
_BY_DATE_RE  = re.compile(r'\bpar\s+(date|mois)\b', re.I)
_UNDO_RE     = re.compile(r'\b(annule|d[eé]fais)\s+(?:le\s+|la\s+|ce\s+)?(rangement|tri|d[eé]placement|renommage)\b', re.I)
_MKDIR_RE    = re.compile(
    rf'\bcr[eé]e[rz]?\s+(?:un\s+)?(?:nouveau\s+)?dossier\s+(?:appel[eé]\s+|nomm[eé]\s+)?(.+?)'
    rf'(?:\s+(?:dans|sur)\s+(?:le\s+|les\s+|mes\s+)?{_FOLDER_WORDS})?\s*$', re.I)
_RENAME_RE   = re.compile(r'\brenomme[rz]?\s+(?:le\s+fichier\s+|le\s+dossier\s+)?(.+?)\s+en\s+(.+)$', re.I)
_MOVE_RE     = re.compile(
    r'\b(?:d[eé]place[rz]?|bouge[rz]?)\s+(?:le\s+fichier\s+|le\s+dossier\s+)?(?!la\s+souris)(.+?)\s+'
    r'(?:dans|vers)\s+(?:le\s+dossier\s+|les\s+|mes\s+|le\s+)?(.+)$', re.I)

DEFAULT_FOLDER = USER_HOME / 'OneDrive' / 'Bureau'
UNDO_FILE      = USER_HOME / '.nexus_rangement_undo.json'

CATEGORIES: dict[str, set[str]] = {
    'Images':     {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.svg', '.ico', '.tiff'},
    'Vidéos':     {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.m4v'},
    'Musique':    {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'},
    'Documents':  {'.pdf', '.doc', '.docx', '.txt', '.odt', '.rtf', '.md'},
    'Tableurs':   {'.xls', '.xlsx', '.csv', '.ods'},
    'Présentations': {'.ppt', '.pptx', '.odp'},
    'Archives':   {'.zip', '.rar', '.7z', '.tar', '.gz'},
    'Programmes': {'.exe', '.msi', '.bat', '.cmd'},
    'Code':       {'.py', '.js', '.ts', '.tsx', '.html', '.css', '.json', '.sql', '.java', '.c', '.cpp'},
}
# Raccourcis et fichiers système : jamais déplacés (casserait le Bureau)
_PROTECTED_EXT   = {'.lnk', '.url', '.ini', '.sys', '.tmp'}
_PROTECTED_NAMES = {'desktop.ini', 'thumbs.db'}


def _category(ext: str) -> str:
    ext = ext.lower()
    for name, exts in CATEGORIES.items():
        if ext in exts:
            return name
    return 'Autres'


def _is_protected(f: Path) -> bool:
    return (f.name.startswith('.') or f.name.startswith('~$')
            or f.name.lower() in _PROTECTED_NAMES or f.suffix.lower() in _PROTECTED_EXT)


def _safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '_', name.strip()).strip(' .')


def _unique_path(p: Path) -> Path:
    if not p.exists():
        return p
    i = 1
    while True:
        cand = p.with_name(f'{p.stem} ({i}){p.suffix}')
        if not cand.exists():
            return cand
        i += 1


def _find_one(folder: Path, name: str) -> tuple[Path | None, str | None]:
    """Trouve un fichier/dossier par nom exact, sinon par nom partiel unique."""
    exact = folder / name
    if exact.exists():
        return exact, None
    nl = name.lower()
    matches = [p for p in folder.iterdir() if p.name.lower() == nl or p.stem.lower() == nl]
    if not matches:
        matches = [p for p in folder.iterdir() if nl in p.name.lower()]
    if not matches:
        return None, f'❌ « {name} » introuvable dans {folder.name}'
    if len(matches) > 1:
        noms = ', '.join(p.name for p in matches[:5])
        return None, f'Plusieurs fichiers correspondent à « {name} » : {noms}. Précise le nom.'
    return matches[0], None


def _save_undo(moves: list[tuple[str, str]], created_dirs: list[str] | None = None) -> None:
    import json
    try:
        UNDO_FILE.write_text(json.dumps({'moves': moves, 'created_dirs': created_dirs or []},
                                        ensure_ascii=False), encoding='utf-8')
    except OSError as e:
        log.warning('Undo non sauvegardé: %s', e)


def _load_undo() -> tuple[list[tuple[str, str]], list[str]]:
    import json
    try:
        data = json.loads(UNDO_FILE.read_text(encoding='utf-8'))
        return [tuple(m) for m in data['moves']], list(data.get('created_dirs', []))
    except (OSError, ValueError, KeyError, TypeError):
        return [], []


def _fmt_size(n: int) -> str:
    if n < 1024:       return f'{n} B'
    if n < 1_048_576:  return f'{n//1024} KB'
    return f'{n//1_048_576} MB'


def _strip_accents(s: str) -> str:
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def _resolve_path(text: str) -> Path | None:
    """Resolve folder name or path from text."""
    t = _strip_accents(text.strip().lower())
    for key, folder in FOLDER_SHORTCUTS.items():
        if _strip_accents(key) in t:
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

    # ── Sauvegarde organisée (photos/docs reçus de Dzaryx) ───────────────────

    # Dossier racine pour tous les fichiers reçus de Dzaryx
    DZARYX_ROOT = USER_HOME / 'OneDrive' / 'Bureau' / 'Dzaryx'

    def save_organized_file(
        self,
        data_b64: str,
        filename:  str,
        folder:    str,
        caption:   str = '',
        open_explorer: bool = True,
    ) -> str:
        """
        Sauvegarde un fichier dans un dossier organisé sous ~/OneDrive/Bureau/Dzaryx/.
        Crée le dossier (et tous les parents) si nécessaire.
        Retourne le chemin absolu du fichier sauvegardé.
        """
        import base64

        # Nettoyer le chemin reçu de Dzaryx (caractères interdits Windows)
        safe_folder = re.sub(r'[<>:"|?*]', '_', folder.strip('/\\'))
        target_dir  = self.DZARYX_ROOT / safe_folder
        target_dir.mkdir(parents=True, exist_ok=True)

        # Nom de fichier avec timestamp pour éviter les doublons
        ts    = datetime.now().strftime('%Y%m%d_%H%M%S')
        stem  = Path(filename).stem[:40]
        ext   = Path(filename).suffix or '.jpg'
        safe_name = re.sub(r'[<>:"|?*\\/ ]', '_', f'{ts}_{stem}{ext}')
        dest  = target_dir / safe_name

        dest.write_bytes(base64.b64decode(data_b64))
        log.info('Fichier sauvegardé: %s', dest)

        # Ouvrir l'explorateur sur le dossier et sélectionner le fichier
        if open_explorer:
            try:
                subprocess.Popen(['explorer', f'/select,{dest}'])
            except Exception:
                pass

        return str(dest)

    # ── Rangement (tri par type/date, créer, renommer, déplacer, annuler) ────

    def organize_by_type(self, folder_text: str = 'bureau') -> str:
        folder = _resolve_path(folder_text) or DEFAULT_FOLDER
        return self._organize(folder, lambda f: _category(f.suffix), 'type')

    def organize_by_date(self, folder_text: str = 'bureau') -> str:
        folder = _resolve_path(folder_text) or DEFAULT_FOLDER
        return self._organize(
            folder, lambda f: datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y-%m'), 'date')

    def _organize(self, folder: Path, bucket, label: str) -> str:
        if not folder.is_dir():
            return f'❌ Dossier introuvable: {folder}'
        moves: list[tuple[str, str]] = []
        created: list[str] = []
        skipped = 0
        counts: dict[str, int] = {}
        for f in list(folder.iterdir()):
            if not f.is_file() or _is_protected(f):
                continue
            target_dir = folder / bucket(f)
            try:
                if not target_dir.exists():
                    target_dir.mkdir()
                    created.append(str(target_dir))
                dest = _unique_path(target_dir / f.name)
                f.rename(dest)
                moves.append((str(f), str(dest)))
                counts[target_dir.name] = counts.get(target_dir.name, 0) + 1
            except OSError as e:  # fichier ouvert, droits…
                log.warning('Rangement: %s ignoré (%s)', f.name, e)
                skipped += 1
        if not moves:
            return f'Rien à ranger dans {folder.name}.'
        _save_undo(moves, created)
        detail = ', '.join(f'{n} dans {d}' for d, n in sorted(counts.items(), key=lambda x: -x[1]))
        msg = f'✅ {len(moves)} fichiers de {folder.name} rangés par {label} : {detail}.'
        if skipped:
            msg += f' {skipped} ignorés (ouverts ou protégés).'
        return msg + ' Dis « annule le rangement » pour revenir en arrière.'

    def create_folder(self, name: str, folder_text: str = 'bureau') -> str:
        parent = _resolve_path(folder_text) or DEFAULT_FOLDER
        safe = _safe_name(name)
        if not safe:
            return '❌ Nom de dossier vide'
        target = parent / safe
        if target.exists():
            return f'Le dossier {safe} existe déjà dans {parent.name}.'
        target.mkdir(parents=True)
        return f'✅ Dossier {safe} créé dans {parent.name}.'

    def rename(self, old: str, new: str, folder_text: str = 'bureau') -> str:
        folder = _resolve_path(folder_text) or DEFAULT_FOLDER
        src, err = _find_one(folder, old)
        if err:
            return err
        new_name = _safe_name(new)
        if not Path(new_name).suffix and src.is_file():
            new_name += src.suffix  # « renomme facture en facture_mars » garde le .pdf
        dest = src.with_name(new_name)
        if dest.exists():
            return f'❌ {dest.name} existe déjà.'
        src.rename(dest)
        _save_undo([(str(src), str(dest))])
        return f'✅ {src.name} renommé en {dest.name}.'

    def move(self, name: str, dest_text: str, folder_text: str = 'bureau') -> str:
        folder = _resolve_path(folder_text) or DEFAULT_FOLDER
        src, err = _find_one(folder, name)
        if err:
            return err
        dest_dir = _resolve_path(dest_text)
        if dest_dir is None:
            dest_dir = folder / _safe_name(dest_text)
            if not dest_dir.is_dir():
                return f'❌ Dossier de destination introuvable: {dest_text}'
        dest = _unique_path(dest_dir / src.name)
        src.rename(dest)
        _save_undo([(str(src), str(dest))])
        return f'✅ {src.name} déplacé dans {dest_dir.name}.'

    def undo_last(self) -> str:
        moves, created = _load_undo()
        if not moves:
            return "Rien à annuler."
        restored = 0
        for src, dest in reversed(moves):
            try:
                if Path(dest).exists() and not Path(src).exists():
                    Path(dest).rename(src)
                    restored += 1
            except OSError as e:
                log.warning('Annulation: %s (%s)', dest, e)
        # Supprime les sous-dossiers créés par le rangement (seulement s'ils sont vides)
        for d in created:
            try:
                Path(d).rmdir()
            except OSError:
                pass
        UNDO_FILE.unlink(missing_ok=True)
        return f'✅ Annulé : {restored} fichier(s) remis à leur place.'

    def try_organize(self, text: str) -> str | None:
        """Commandes de rangement en langage naturel. None si non concerné."""
        t = text.strip()
        tl = t.lower()

        if _UNDO_RE.search(tl):
            return self.undo_last()

        m = _ORGANIZE_RE.search(tl)
        if m:
            target = m.group(2) or 'bureau'
            if _BY_DATE_RE.search(tl):
                return self.organize_by_date(target)
            return self.organize_by_type(target)

        m = _MKDIR_RE.search(t)
        if m:
            return self.create_folder(m.group(1).strip(' "«»\''), m.group(2) or 'bureau')

        m = _RENAME_RE.search(t)
        if m:
            return self.rename(m.group(1).strip(' "«»\''), m.group(2).strip(' "«»\''))

        m = _MOVE_RE.search(t)
        if m:
            return self.move(m.group(1).strip(' "«»\''), m.group(2).strip(' "«»\''))

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
