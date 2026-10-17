"""
NEXUS Cleaner — ménage complet du PC Windows, sans risque pour les fichiers de Kouider.

Nettoyé directement (caches et fichiers jetables, recréés tout seuls par Windows / les applis) :
  fichiers temporaires (utilisateur + Windows), caches des navigateurs (Chrome, Edge, Brave, Opera, Firefox),
  caches d'applis (Discord, Spotify, Teams, CapCut, pip, npm), caches graphiques (DirectX, NVIDIA, AMD),
  rapports de plantage, téléchargements de Windows Update déjà installés.
Sur confirmation seulement : la corbeille. Jamais touché : Téléchargements, Bureau, Documents (gros fichiers juste listés).
Un fichier en cours d'utilisation est simplement laissé.
"""
import glob
import logging
import os
import subprocess
import time
from pathlib import Path

log = logging.getLogger('nexus.cleaner')

HOME = Path.home()
LOCAL = Path(os.environ.get('LOCALAPPDATA') or HOME / 'AppData' / 'Local')
ROAMING = Path(os.environ.get('APPDATA') or HOME / 'AppData' / 'Roaming')
WINDIR = Path(os.environ.get('WINDIR') or r'C:\Windows')
PROGDATA = Path(os.environ.get('PROGRAMDATA') or r'C:\ProgramData')

_BROWSERS = [LOCAL / 'Google/Chrome/User Data', LOCAL / 'Microsoft/Edge/User Data', LOCAL / 'BraveSoftware/Brave-Browser/User Data',
             ROAMING / 'Opera Software/Opera Stable', ROAMING / 'Opera Software/Opera GX Stable']
_BROWSER_CACHES = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker/CacheStorage', 'DawnCache', 'DawnGraphiteCache', 'GrShaderCache']

# clé, libellé, motifs de dossiers dont on vide le contenu, âge minimal des fichiers (jours)
CATEGORIES: list[tuple[str, str, list[str], float]] = [
    ('temp', 'Fichiers temporaires', [os.environ.get('TEMP') or str(LOCAL / 'Temp')], 1),
    ('wintemp', 'Temporaires de Windows', [str(WINDIR / 'Temp')], 1),
    ('browser', 'Caches des navigateurs',
     [str(b / p / c) for b in _BROWSERS for p in ('*', '') for c in _BROWSER_CACHES] + [str(LOCAL / 'Mozilla/Firefox/Profiles/*/cache2')], 0),
    ('apps', "Caches d'applications",
     [str(ROAMING / 'discord' / c) for c in ('Cache', 'Code Cache', 'GPUCache')] +
     [str(LOCAL / 'Spotify/Storage'), str(LOCAL / 'Spotify/Data'), str(ROAMING / 'Microsoft/Teams/Cache'), str(LOCAL / 'CapCut/User Data/Cache'),
      str(LOCAL / 'pip/Cache'), str(LOCAL / 'npm-cache/_cacache'), str(LOCAL / 'Microsoft/Windows/INetCache')], 0),
    ('gpu', 'Caches graphiques', [str(LOCAL / 'D3DSCache'), str(LOCAL / 'NVIDIA/DXCache'), str(LOCAL / 'NVIDIA/GLCache'), str(LOCAL / 'AMD/DxCache'),
                                  str(LOCAL / 'AMD/DxcCache')], 0),
    ('crash', 'Rapports de plantage', [str(LOCAL / 'CrashDumps'), str(PROGDATA / 'Microsoft/Windows/WER/ReportArchive'),
                                       str(PROGDATA / 'Microsoft/Windows/WER/ReportQueue'), str(LOCAL / 'Microsoft/Windows/WER')], 0),
    ('update', 'Windows Update (déjà installé)', [str(WINDIR / 'SoftwareDistribution/Download')], 3),
]
LABELS = {k: lbl for k, lbl, _, _ in CATEGORIES} | {'recycle': 'Corbeille'}


def _dirs(patterns: list[str]) -> list[Path]:
    out, seen = [], set()
    for pat in patterns:
        for d in glob.glob(pat):
            p = Path(d)
            if p.is_dir() and not p.is_symlink() and str(p).lower() not in seen:
                seen.add(str(p).lower()); out.append(p)
    return out


def _walk(cat: tuple, delete: bool, budget_s: float) -> tuple[int, int]:
    _k, _l, patterns, age = cat
    cutoff, size, n, t0 = time.time() - age * 86400, 0, 0, time.time()
    for base in _dirs(patterns):
        for root, dirs, files in os.walk(base, topdown=False):
            if time.time() - t0 > budget_s:
                return size, n
            for fn in files:
                fp = os.path.join(root, fn)
                try:
                    if os.path.islink(fp) or (age and os.path.getmtime(fp) > cutoff):
                        continue
                    sz = os.path.getsize(fp)
                    if delete:
                        os.remove(fp)
                    size += sz; n += 1
                except OSError:
                    pass                                    # en cours d'utilisation / pas le droit : on laisse
            if delete and Path(root) != base:
                try:
                    os.rmdir(root)                          # seulement s'il est vide
                except OSError:
                    pass
    return size, n


def _ps(cmd: str, timeout: int = 60) -> str:
    try:
        r = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', cmd], capture_output=True, text=True,
                           timeout=timeout, encoding='utf-8', errors='replace')
        return (r.stdout or '').strip()
    except Exception as e:
        log.info('powershell : %s', e)
        return ''


def recycle_size() -> int:
    if os.name != 'nt':
        return 0
    out = _ps("$s=(New-Object -ComObject Shell.Application).NameSpace(10); ($s.Items() | Measure-Object -Property Size -Sum).Sum")
    try:
        return int(float(out or 0))
    except ValueError:
        return 0


def empty_recycle() -> int:
    size = recycle_size()
    _ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 120)
    return max(0, size - recycle_size())


def scan(budget_s: float = 25) -> list[dict]:
    per = budget_s / len(CATEGORIES)
    out = []
    for cat in CATEGORIES:
        size, n = _walk(cat, False, per)
        out.append({'key': cat[0], 'label': cat[1], 'mb': round(size / 1e6), 'files': n})
    return out


def clean(keys: list[str] | None = None, budget_s: float = 120) -> list[dict]:
    """Vide les catégories demandées (toutes les catégories sûres par défaut). Renvoie ce qui a vraiment été libéré."""
    out = []
    for cat in CATEGORIES:
        if keys is None or cat[0] in keys:
            size, n = _walk(cat, True, budget_s / len(CATEGORIES))
            out.append({'key': cat[0], 'label': cat[1], 'mb': round(size / 1e6), 'files': n})
            log.info('ménage %s : %d Mo, %d fichiers', cat[0], size // 10**6, n)
    if keys and 'recycle' in keys:
        out.append({'key': 'recycle', 'label': 'Corbeille', 'mb': round(empty_recycle() / 1e6), 'files': 0})
    if os.name == 'nt' and (keys is None or 'dns' in (keys or [])):
        _ps('ipconfig /flushdns | Out-Null', 20)
    return out


def big_files(min_mb: int = 150) -> list[dict]:
    out = []
    for folder in (HOME / 'Downloads', HOME / 'Videos', HOME / 'Desktop', HOME / 'OneDrive' / 'Bureau'):
        try:
            for f in folder.iterdir():
                if f.is_file() and f.stat().st_size > min_mb * 1e6:
                    out.append({'name': f.name, 'folder': folder.name, 'mb': round(f.stat().st_size / 1e6),
                                'age': int((time.time() - f.stat().st_mtime) / 86400), 'path': str(f)})
        except OSError:
            pass
    return sorted(out, key=lambda x: -x['mb'])[:8]
