"""
NEXUS OS Agent v1
Capabilities: File Explorer · Window Manager · Process Manager · App Launcher · Screen Understanding
Security: path whitelist, process kill whitelist, app launch whitelist.
"""
import asyncio
import base64
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

try:
    from .nexus_logger import nexus_log, jobs_log, security_log, log_security_event
except ImportError:
    nexus_log = jobs_log = security_log = logging.getLogger('nexus.os_agent')
    def log_security_event(*a, **k): pass

log = logging.getLogger('nexus.os_agent')

# ── Security ──────────────────────────────────────────────────────────────────

_HOME = Path(os.environ.get('USERPROFILE', r'C:\Users\douba'))

_ALLOWED_ROOTS = [
    _HOME / 'Desktop',
    _HOME / 'Documents',
    _HOME / 'Downloads',
    _HOME / 'Pictures',
    _HOME / 'Videos',
    _HOME / 'Music',
    _HOME / 'OneDrive' / 'Bureau',
    _HOME / 'AppData' / 'Local' / 'Temp',
]

_KILL_WHITELIST = {
    'chrome', 'msedge', 'firefox', 'brave', 'opera',
    'spotify', 'discord', 'telegram', 'code',
    'capcut', 'notepad', 'wordpad', 'vlc', 'wmplayer',
    'runwayml', 'runway',
}

_CLOSE_WHITELIST = _KILL_WHITELIST

_APP_REGISTRY: dict[str, list[str]] = {
    'chrome':   [r'C:\Program Files\Google\Chrome\Application\chrome.exe'],
    'vscode':   [r'C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe'],
    'telegram': [r'C:\Users\douba\AppData\Roaming\Telegram Desktop\Telegram.exe'],
    'spotify':  [r'C:\Users\douba\AppData\Roaming\Spotify\Spotify.exe'],
    'terminal': ['wt'],
    'notepad':  ['notepad'],
    'explorer': ['explorer'],
    'dzaryx':   ['explorer', r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim'],
    'capcut':   ['powershell', '-Command', 'Start-Process "shell:AppsFolder\\7468.309454D4F49E_wbnn1bbqfj7rb!App"'],
}

# Windows process name (no .exe) used for focus/verify operations
_APP_PROCESS_NAMES: dict[str, str] = {
    'vscode':   'Code',
    'chrome':   'chrome',
    'telegram': 'Telegram',
    'spotify':  'Spotify',
    'terminal': 'WindowsTerminal',
    'notepad':  'notepad',
}

# Extra candidates tried in order when the primary _APP_REGISTRY path is missing.
# First existing path wins. For entries without an absolute primary (e.g. 'wt', 'notepad'),
# this list is never consulted (they resolve via PATH directly).
_APP_CANDIDATES: dict[str, list[str]] = {
    'vscode': [
        r'C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe',
        r'C:\Program Files\Microsoft VS Code\Code.exe',
        r'C:\Program Files (x86)\Microsoft VS Code\Code.exe',
        r'C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\bin\code.cmd',
    ],
    'chrome': [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
        r'C:\Users\douba\AppData\Local\Google\Chrome\Application\chrome.exe',
    ],
    'telegram': [
        r'C:\Users\douba\AppData\Roaming\Telegram Desktop\Telegram.exe',
        r'C:\Program Files\Telegram Desktop\Telegram.exe',
    ],
}


def _is_allowed(path: Path) -> bool:
    try:
        resolved = path.resolve()
    except Exception:
        return False
    for root in _ALLOWED_ROOTS:
        try:
            resolved.relative_to(root.resolve())
            return True
        except ValueError:
            pass
    return False


def _jid() -> str:
    return f'os_{int(time.time() * 1000)}_{uuid.uuid4().hex[:5]}'


def _ps(cmd: str, timeout: int = 10) -> tuple[str, str, int]:
    r = subprocess.run(
        ['powershell', '-NonInteractive', '-NoProfile', '-Command', cmd],
        capture_output=True, text=True, timeout=timeout,
        encoding='utf-8', errors='replace',
    )
    return r.stdout.strip(), r.stderr.strip(), r.returncode


# ── File Explorer ─────────────────────────────────────────────────────────────

async def file_list(data: dict) -> dict:
    raw  = data.get('path') or str(_HOME / 'Desktop')
    jid  = _jid()
    loop = asyncio.get_event_loop()
    try:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            path = _HOME / path
        if not _is_allowed(path):
            log_security_event('file_list_denied', f'path={raw}')
            return {'ok': False, 'job_id': jid, 'error': f'Path not in allowed roots: {raw}'}
        if not path.exists():
            return {'ok': False, 'job_id': jid, 'error': f'Path does not exist: {path}'}
        if not path.is_dir():
            return {'ok': False, 'job_id': jid, 'error': f'Not a directory: {path}'}

        def _scan():
            entries = []
            for item in sorted(path.iterdir()):
                try:
                    st = item.stat()
                    entries.append({
                        'name':     item.name,
                        'type':     'dir' if item.is_dir() else 'file',
                        'size':     st.st_size if item.is_file() else None,
                        'modified': datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M'),
                        'ext':      item.suffix.lower() if item.is_file() else None,
                    })
                except PermissionError:
                    entries.append({'name': item.name, 'type': 'unknown', 'error': 'permission denied'})
            return entries

        entries = await loop.run_in_executor(None, _scan)
        jobs_log.info('file_list', extra={'data': {'job_id': jid, 'path': str(path), 'count': len(entries)}})
        return {'ok': True, 'job_id': jid, 'path': str(path), 'count': len(entries), 'entries': entries}
    except Exception as e:
        log.error('file_list ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def file_search(data: dict) -> dict:
    query    = data.get('query', '').strip()
    raw_root = data.get('root') or str(_HOME / 'OneDrive' / 'Bureau')
    max_res  = min(int(data.get('max_results', 50)), 200)
    jid      = _jid()

    if not query:
        return {'ok': False, 'job_id': jid, 'error': 'query required'}

    loop = asyncio.get_event_loop()
    try:
        root = Path(raw_root).expanduser()
        if not _is_allowed(root):
            log_security_event('file_search_denied', f'root={raw_root}')
            return {'ok': False, 'job_id': jid, 'error': f'Root not in allowed paths: {raw_root}'}

        pat = re.compile(re.escape(query), re.IGNORECASE)

        def _scan():
            hits = []
            for item in root.rglob('*'):
                if pat.search(item.name):
                    hits.append({
                        'path': str(item),
                        'name': item.name,
                        'type': 'dir' if item.is_dir() else 'file',
                    })
                    if len(hits) >= max_res:
                        break
            return hits

        results = await loop.run_in_executor(None, _scan)
        return {'ok': True, 'job_id': jid, 'query': query, 'root': str(root), 'count': len(results), 'results': results}
    except Exception as e:
        log.error('file_search ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def file_read(data: dict) -> dict:
    raw = data.get('path', '').strip()
    jid = _jid()
    if not raw:
        return {'ok': False, 'job_id': jid, 'error': 'path required'}
    loop = asyncio.get_event_loop()
    try:
        path = Path(raw).expanduser()
        if not _is_allowed(path):
            log_security_event('file_read_denied', f'path={raw}')
            return {'ok': False, 'job_id': jid, 'error': 'Path not in allowed roots'}
        if not path.is_file():
            return {'ok': False, 'job_id': jid, 'error': f'Not a file: {path}'}

        def _read():
            size = path.stat().st_size
            with open(path, 'rb') as f:
                raw_bytes = f.read(50_000)
            try:
                content = raw_bytes.decode('utf-8')
            except UnicodeDecodeError:
                content = raw_bytes.decode('latin-1', errors='replace')
            return size, content

        size, content = await loop.run_in_executor(None, _read)
        return {'ok': True, 'job_id': jid, 'path': str(path), 'size': size, 'truncated': size > 50_000, 'content': content}
    except Exception as e:
        log.error('file_read ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def file_send(data: dict, sio) -> dict:
    raw     = data.get('path', '').strip()
    caption = data.get('caption') or f'📎 NEXUS — {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
    jid     = _jid()
    if not raw:
        return {'ok': False, 'job_id': jid, 'error': 'path required'}
    loop = asyncio.get_event_loop()
    try:
        path = Path(raw).expanduser()
        if not _is_allowed(path):
            log_security_event('file_send_denied', f'path={raw}')
            return {'ok': False, 'job_id': jid, 'error': 'Path not in allowed roots'}
        if not path.is_file():
            return {'ok': False, 'job_id': jid, 'error': f'Not a file: {path}'}
        size = path.stat().st_size
        if size > 20 * 1024 * 1024:
            return {'ok': False, 'job_id': jid, 'error': f'File too large: {size // 1024}KB (max 20MB)'}

        file_bytes = await loop.run_in_executor(None, path.read_bytes)
        b64 = base64.b64encode(file_bytes).decode()
        is_image = path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')

        if is_image:
            await sio.emit('nexus:telegram_photo', {'image': b64, 'caption': caption}, namespace='/nexus')
        else:
            await sio.emit('nexus:telegram_file', {'data': b64, 'filename': path.name, 'caption': caption}, namespace='/nexus')

        jobs_log.info('file_send', extra={'data': {'job_id': jid, 'path': str(path), 'size': size}})
        return {'ok': True, 'job_id': jid, 'path': str(path), 'size_bytes': size, 'sent_as': 'photo' if is_image else 'document', 'sent_to_telegram': True}
    except Exception as e:
        log.error('file_send ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def file_open(data: dict) -> dict:
    """Open a folder in Explorer or a file with its default app."""
    raw = data.get('path', '').strip()
    jid = _jid()
    if not raw:
        return {'ok': False, 'job_id': jid, 'error': 'path required'}
    try:
        path = Path(raw).expanduser()
        if not _is_allowed(path):
            log_security_event('file_open_denied', f'path={raw}')
            return {'ok': False, 'job_id': jid, 'error': 'Path not in allowed roots'}
        if not path.exists():
            return {'ok': False, 'job_id': jid, 'error': f'Path does not exist: {path}'}
        os.startfile(str(path))
        return {'ok': True, 'job_id': jid, 'path': str(path)}
    except Exception as e:
        log.error('file_open ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


# ── Window Manager ────────────────────────────────────────────────────────────

async def window_list(_data: dict) -> dict:
    jid  = _jid()
    loop = asyncio.get_event_loop()
    try:
        stdout, stderr, rc = await loop.run_in_executor(None, lambda: _ps(
            "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | "
            "Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress",
            8,
        ))
        if rc != 0:
            return {'ok': False, 'job_id': jid, 'error': stderr or f'exit {rc}'}
        raw = json.loads(stdout) if stdout else []
        if isinstance(raw, dict):
            raw = [raw]
        windows = [{'pid': w.get('Id'), 'process': w.get('ProcessName'), 'title': w.get('MainWindowTitle')} for w in raw]
        return {'ok': True, 'job_id': jid, 'count': len(windows), 'windows': windows}
    except Exception as e:
        log.error('window_list ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def window_focus(data: dict) -> dict:
    title = data.get('title', '').strip()
    jid   = _jid()
    if not title:
        return {'ok': False, 'job_id': jid, 'error': 'title required'}
    loop = asyncio.get_event_loop()
    try:
        stdout, _, rc = await loop.run_in_executor(None, lambda: _ps(
            f"Add-Type -AssemblyName Microsoft.VisualBasic; "
            f"$p = Get-Process | Where-Object {{$_.MainWindowTitle -like '*{title}*'}} | Select-Object -First 1; "
            f"if ($p) {{ [Microsoft.VisualBasic.Interaction]::AppActivate($p.Id); Write-Output \"ok:$($p.MainWindowTitle)\" }} "
            f"else {{ Write-Output 'not_found' }}",
            8,
        ))
        if 'ok:' in stdout:
            return {'ok': True, 'job_id': jid, 'focused_title': stdout.replace('ok:', '')}
        return {'ok': False, 'job_id': jid, 'error': f'No window matching: {title}'}
    except Exception as e:
        log.error('window_focus ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def window_close(data: dict) -> dict:
    title = data.get('title', '').strip()
    jid   = _jid()
    if not title:
        return {'ok': False, 'job_id': jid, 'error': 'title required'}
    loop = asyncio.get_event_loop()
    try:
        stdout, _, rc = await loop.run_in_executor(None, lambda: _ps(
            f"Get-Process | Where-Object {{$_.MainWindowTitle -like '*{title}*'}} | "
            f"Select-Object -First 1 | Select-Object Id,ProcessName | ConvertTo-Json -Compress",
            6,
        ))
        if not stdout or rc != 0:
            return {'ok': False, 'job_id': jid, 'error': f'No window matching: {title}'}
        proc     = json.loads(stdout)
        proc_name = proc.get('ProcessName', '').lower()
        if proc_name not in _CLOSE_WHITELIST:
            log_security_event('window_close_denied', f'process={proc_name}')
            return {'ok': False, 'job_id': jid, 'error': f'Process "{proc_name}" not in close whitelist'}
        _, stderr, rc = await loop.run_in_executor(None, lambda: _ps(f"Stop-Process -Id {proc['Id']} -ErrorAction Stop", 5))
        if rc != 0:
            return {'ok': False, 'job_id': jid, 'error': stderr or f'Stop-Process exit {rc}'}
        security_log.info('window_close', extra={'data': {'job_id': jid, 'process': proc_name, 'pid': proc['Id']}})
        return {'ok': True, 'job_id': jid, 'closed': proc_name, 'pid': proc['Id']}
    except Exception as e:
        log.error('window_close ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def window_screenshot(data: dict, sio) -> dict:
    """Screenshot full screen (focused on active window context) → Telegram."""
    caption  = data.get('caption') or f'🖼️ Écran actif — {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
    jid      = _jid()
    tmp      = tempfile.mktemp(suffix='.png', prefix='nexus_win_')
    loop     = asyncio.get_event_loop()
    try:
        _, stderr, rc = await loop.run_in_executor(None, lambda: _ps(
            f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
            f"$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
            f"$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); "
            f"$g=[System.Drawing.Graphics]::FromImage($bmp); "
            f"$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); "
            f"$bmp.Save('{tmp}'); $bmp.Dispose(); $g.Dispose()",
            20,
        ))
        if rc != 0 or not os.path.exists(tmp):
            return {'ok': False, 'job_id': jid, 'error': f'Screenshot failed: {stderr}'}
        img = await loop.run_in_executor(None, lambda: open(tmp, 'rb').read())
        try:
            os.unlink(tmp)
        except Exception:
            pass
        b64 = base64.b64encode(img).decode()
        await sio.emit('nexus:telegram_photo', {'image': b64, 'caption': caption}, namespace='/nexus')
        return {'ok': True, 'job_id': jid, 'size_bytes': len(img), 'sent_to_telegram': True}
    except Exception as e:
        log.error('window_screenshot ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


# ── Process Manager ───────────────────────────────────────────────────────────

async def process_list(data: dict) -> dict:
    jid     = _jid()
    top_n   = min(int(data.get('top', 30)), 100)
    sort_by = data.get('sort', 'ram')
    loop    = asyncio.get_event_loop()
    try:
        import psutil

        def _collect():
            procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status']):
                try:
                    mi = p.info['memory_info']
                    procs.append({
                        'pid':     p.info['pid'],
                        'name':    p.info['name'],
                        'cpu_pct': round(p.info['cpu_percent'] or 0, 1),
                        'ram_mb':  round(mi.rss / 1_048_576, 1) if mi else 0,
                        'status':  p.info['status'],
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            key = 'ram_mb' if sort_by == 'ram' else 'cpu_pct'
            procs.sort(key=lambda x: x[key], reverse=True)
            return procs[:top_n]

        procs = await loop.run_in_executor(None, _collect)
        return {'ok': True, 'job_id': jid, 'count': len(procs), 'sorted_by': sort_by, 'processes': procs}
    except ImportError:
        return {'ok': False, 'job_id': jid, 'error': 'psutil not installed — pip install psutil'}
    except Exception as e:
        log.error('process_list ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


async def process_kill(data: dict) -> dict:
    target = data.get('name') or data.get('pid')
    jid    = _jid()
    if not target:
        return {'ok': False, 'job_id': jid, 'error': 'name or pid required'}
    try:
        import psutil
        proc = None
        if isinstance(target, int) or (isinstance(target, str) and str(target).isdigit()):
            proc = psutil.Process(int(target))
        else:
            name_key = str(target).lower().replace('.exe', '')
            for p in psutil.process_iter(['pid', 'name']):
                if p.info['name'].lower().replace('.exe', '') == name_key:
                    proc = p
                    break
        if proc is None:
            return {'ok': False, 'job_id': jid, 'error': f'Process not found: {target}'}
        proc_name = proc.name().lower().replace('.exe', '')
        if proc_name not in _KILL_WHITELIST:
            log_security_event('process_kill_denied', f'process={proc_name}')
            return {'ok': False, 'job_id': jid, 'error': f'"{proc_name}" not in kill whitelist'}
        pid = proc.pid
        proc.terminate()
        security_log.info('process_kill', extra={'data': {'job_id': jid, 'name': proc_name, 'pid': pid}})
        return {'ok': True, 'job_id': jid, 'killed': proc_name, 'pid': pid}
    except psutil.NoSuchProcess:
        return {'ok': False, 'job_id': jid, 'error': 'Process no longer exists'}
    except Exception as e:
        log.error('process_kill ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


# ── Window Focus ──────────────────────────────────────────────────────────────

def _focus_window_ps(proc_name: str, timeout: int = 6) -> tuple[bool, str]:
    """Bring the main window of proc_name to foreground via AppActivate (WScript.Shell).
    Returns (success, detail_message)."""
    # AppActivate by process ID is the most reliable method on Windows.
    # We find the PID of the first process with a visible main window, then activate it.
    ps_cmd = (
        f'$p = Get-Process -Name "{proc_name}" -EA SilentlyContinue '
        f'| Where-Object {{$_.MainWindowHandle -ne 0}} '
        f'| Select-Object -First 1; '
        f'if ($p) {{ '
        f'  $sh = New-Object -ComObject WScript.Shell; '
        f'  $ok = $sh.AppActivate($p.Id); '
        f'  Write-Output "pid=$($p.Id) ok=$ok" '
        f'}} else {{ Write-Output "no_window" }}'
    )
    out, err, rc = _ps(ps_cmd, timeout)
    if 'no_window' in out:
        return False, f'no visible window for process {proc_name}'
    if 'ok=True' in out or 'ok=true' in out:
        return True, out.strip()
    return False, f'AppActivate returned False or error: {out} | {err}'


async def focus_app(data: dict) -> dict:
    """Bring an app window to foreground. payload: {app: 'vscode'|'chrome'|...}"""
    app_key  = data.get('app', '').strip().lower()
    jid      = _jid()
    proc_name = _APP_PROCESS_NAMES.get(app_key)
    if not proc_name:
        return {
            'ok': False, 'job_id': jid,
            'error': f'Unknown app: {app_key}',
            'available': list(_APP_PROCESS_NAMES.keys()),
        }

    log.info('[NEXUS_FOCUS] app=%s proc=%s', app_key, proc_name)
    loop = asyncio.get_event_loop()
    ok, detail = await loop.run_in_executor(None, lambda: _focus_window_ps(proc_name))

    log.info('[NEXUS_FOCUS] app=%s success=%s detail=%s', app_key, ok, detail)
    return {
        'ok':     ok,
        'job_id': jid,
        'app':    app_key,
        'proc':   proc_name,
        'detail': detail,
        'focused': ok,
    }


# ── Application Launcher ──────────────────────────────────────────────────────

async def app_launch(data: dict) -> dict:
    app_key = data.get('app', '').strip().lower()
    jid     = _jid()
    if not app_key:
        return {'ok': False, 'job_id': jid, 'error': 'app required', 'available': list(_APP_REGISTRY.keys())}
    if app_key not in _APP_REGISTRY:
        return {'ok': False, 'job_id': jid, 'error': f'Unknown app: {app_key}', 'available': list(_APP_REGISTRY.keys())}

    cmd  = list(_APP_REGISTRY[app_key])  # mutable copy
    loop = asyncio.get_event_loop()
    exe  = cmd[0]

    log.info('[NEXUS_APP_LAUNCH] attempt app=%s primary=%s', app_key, exe)

    # ── Path resolution: primary → candidates → where.exe ────────────────────
    if os.path.isabs(exe) and not os.path.exists(exe):
        candidates = _APP_CANDIDATES.get(app_key, [])
        resolved: str | None = None

        # 1. Try candidate paths in order
        for cand in candidates:
            log.info('[NEXUS_APP_LAUNCH] trying candidate=%s', cand)
            if os.path.exists(cand):
                resolved = cand
                log.info('[NEXUS_APP_LAUNCH] found at candidate path=%s', cand)
                break

        # 2. where.exe fallback using base name without extension
        if not resolved:
            base_no_ext = os.path.splitext(os.path.basename(exe))[0].lower()
            log.info('[NEXUS_APP_LAUNCH] candidates exhausted — trying where.exe for %s', base_no_ext)
            wo, _, _ = await loop.run_in_executor(
                None,
                lambda: _ps(f'where.exe {base_no_ext} 2>$null | Select-Object -First 1', 5),
            )
            if wo and os.path.exists(wo.splitlines()[0].strip()):
                resolved = wo.splitlines()[0].strip()
                log.info('[NEXUS_APP_LAUNCH] found via where.exe path=%s', resolved)

        if not resolved:
            tried = [exe] + candidates
            err = (
                f'{app_key} introuvable. Chemins testés: {", ".join(tried[:3])}. '
                f'Installe {app_key} ou ajoute-le au PATH Windows.'
            )
            log.warning('[NEXUS_APP_LAUNCH] not_found app=%s tried=%d paths', app_key, len(tried))
            return {'ok': False, 'job_id': jid, 'error': err, 'paths_tried': tried}

        cmd = [resolved] + cmd[1:]

    # ── Launch ────────────────────────────────────────────────────────────────
    final_exe = cmd[0]
    use_shell  = final_exe.lower().endswith('.cmd')
    try:
        subprocess.Popen(
            cmd if not use_shell else ' '.join(f'"{c}"' if ' ' in c else c for c in cmd),
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
            shell=use_shell,
        )
        log.info('[NEXUS_APP_LAUNCH] success app=%s exe=%s shell=%s', app_key, final_exe, use_shell)
        jobs_log.info('app_launch', extra={'data': {'job_id': jid, 'app': app_key, 'cmd': final_exe}})
    except FileNotFoundError:
        log.warning('[NEXUS_APP_LAUNCH] FileNotFoundError exe=%s', final_exe)
        return {'ok': False, 'job_id': jid, 'error': f'Executable not found: {final_exe}'}
    except Exception as e:
        log.error('[NEXUS_APP_LAUNCH] exception app=%s err=%s', app_key, e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}

    # ── Post-launch: wait then focus window ───────────────────────────────────
    proc_name = _APP_PROCESS_NAMES.get(app_key)
    focused   = False
    verified  = False
    if proc_name:
        # Wait for process to start and create a window (up to 5 attempts × 800 ms)
        loop = asyncio.get_event_loop()
        for attempt in range(1, 6):
            await asyncio.sleep(0.8)
            ok, detail = await loop.run_in_executor(None, lambda: _focus_window_ps(proc_name))
            log.info('[NEXUS_VSCODE] attempt=%d proc=%s focused=%s detail=%s', attempt, proc_name, ok, detail)
            if ok:
                focused  = True
                verified = True
                log.info('[NEXUS_VSCODE] launched=true focused=true verified=true path=%s', final_exe)
                break
        if not focused:
            log.warning('[NEXUS_VSCODE] launched=true focused=false verified=false proc=%s', proc_name)

    return {
        'ok':      True,
        'job_id':  jid,
        'app':     app_key,
        'launched': True,
        'focused':  focused,
        'verified': verified,
        'path':    final_exe,
    }


# ── Terminal Manager ─────────────────────────────────────────────────────────

# Project registry (key → absolute path)
_PROJECT_PATHS: dict[str, str] = {
    'dzaryx':        r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim',
    'ibrahim':       r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim',
    'nexus':         r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus',
    'backend':       r'C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend',
    'bot-avion':     r'C:\Users\douba\OneDrive\Bureau\BOT AVION',
    'cekolib':       r'C:\Users\douba\OneDrive\Bureau\cekolib',
    'dzking':        r'C:\Users\douba\OneDrive\Bureau\dzking',
    'fik':           r'C:\Users\douba\OneDrive\Bureau\fik',
    'jarvis':        r'C:\Users\douba\OneDrive\Bureau\jarvis',
    'loc':           r'C:\Users\douba\OneDrive\Bureau\loc',
    'rental-system': r'C:\Users\douba\OneDrive\Bureau\rental-system',
}

# Project name aliases → canonical key
_PROJECT_ALIASES: list[tuple[str, str]] = [
    ('dzaryx',  'dzaryx'), ('ibrahim', 'dzaryx'), ('projet', 'dzaryx'),
    ('backend', 'backend'), ('nexus', 'nexus'),
    ('bot avion', 'bot-avion'), ('bot-avion', 'bot-avion'), ('avion', 'bot-avion'),
    ('cekolib', 'cekolib'), ('dzking', 'dzking'), ('fik', 'fik'),
    ('jarvis', 'jarvis'), ('loc', 'loc'),
    ('rental', 'rental-system'), ('rental-system', 'rental-system'),
]

# Allowed root dirs for cwd validation
_ALLOWED_CWD_ROOTS: tuple[str, ...] = (
    r'C:\Users\douba\OneDrive\Bureau',
    r'C:\Users\douba\AppData\Local\Temp',
)

# Commands that are ALWAYS blocked regardless of other checks
_DANGEROUS_CMD_RE = re.compile(
    r'\b(shutdown|restart-computer|format\s|del\s+/s|rmdir\s+/s\s|rd\s+/s\s|'
    r'reg\s+delete|bcdedit|diskpart|net\s+user|netsh\s+firewall|taskkill\s+/f\s+/im\s+\*|'
    r'Remove-Item\s+.*-Recurse.*-Force|cipher\s+/w|mklink\s+/d|'
    r'icacls.*\bDeny\b|takeown\s+/f\s+/r)\b',
    re.IGNORECASE,
)

# Allowed developer commands (whitelist)
_DEV_SAFE_CMD_RE = re.compile(
    r'^('
    # git
    r'git\s+(status|pull|push(\s+origin)?|log(\s|$)|diff(\s|$)|branch(\s|$)|'
    r'checkout\s|add\s|commit\s|stash(\s|$)|fetch(\s|$)|merge\s|show(\s|$)|'
    r'remote(\s|$)|clean\s+-fd|reset\s+HEAD|tag(\s|$))'
    r'|npm\s+(run\s+\S+|install(\s+|$)|build(\s|$)|test(\s|$)|start(\s|$)|'
    r'ci(\s|$)|list(\s|$)|outdated(\s|$)|update(\s|$)|init(\s|$))'
    r'|npx\s+\S+'
    r'|node\s+\S+'
    r'|python(\s+\S+|\s+-m\s+\S+|3?\s+\S+)'
    r'|py\s+\S+'
    r'|pip\s+(install\s+\S+|list(\s|$)|show\s+\S+|freeze(\s|$))'
    r'|claude(\s+.+)?'            # claude CLI with any args
    r'|dir(\s|/|$)'
    r'|ls(\s|$)'
    r'|type\s+\S+'
    r'|echo\s+'
    r'|pwd$'
    r'|ipconfig(\s|/|$)'
    r'|ping\s+\S+'
    r'|netstat(\s|/|$)'
    r'|tasklist(\s|/|$)'
    r'|systeminfo$'
    r'|whoami$|hostname$'
    r'|where\s+\S+|which\s+\S+'
    r'|tsc(\s|$)'
    r'|eslint(\s|$)'
    r')',
    re.IGNORECASE,
)

# Session environment state (mutable, module-level)
_env_state: dict = {
    'activeProject':        None,
    'activeWorkingDir':     None,
    'activeTerminalPid':    None,
    'activeClaudeCodePid':  None,
    'lastCommand':          None,
    'lastCommandStatus':    None,
    'lastCommandOutput':    None,
    'lastCommandElapsedMs': None,
    'lastUpdatedAt':        None,
}


def _resolve_project(token: str) -> tuple[str, str] | None:
    """Return (project_key, absolute_path) or None."""
    lower = token.lower().strip()
    for alias, key in _PROJECT_ALIASES:
        if lower == alias or lower.endswith(alias) or alias in lower:
            path = _PROJECT_PATHS.get(key)
            if path:
                return key, path
    return None


def _validate_cwd(cwd: str | None) -> tuple[bool, str]:
    if not cwd:
        return True, ''
    norm = os.path.normpath(cwd)
    for root in _ALLOWED_CWD_ROOTS:
        if norm.startswith(os.path.normpath(root)):
            return True, ''
    return False, f'cwd "{cwd}" hors des répertoires autorisés'


def _validate_dev_cmd(cmd: str) -> tuple[bool, str]:
    if _DANGEROUS_CMD_RE.search(cmd):
        return False, f'Commande dangereuse bloquée: "{cmd[:60]}"'
    if _DEV_SAFE_CMD_RE.match(cmd.strip()):
        return True, ''
    return False, f'Commande non autorisée: "{cmd[:60]}"'


async def terminal_run(data: dict, sio=None) -> dict:
    """Run a dev command in a project dir and return stdout/stderr.
    If sio is provided, streams stdout/stderr lines via nexus:terminal_chunk events.
    """
    cmd         = (data.get('command') or '').strip()
    project_key = (data.get('project') or '').strip().lower()
    cwd         = data.get('cwd') or _PROJECT_PATHS.get(project_key)
    timeout_s   = min(int(data.get('timeout_s', 30)), 60)
    jid         = _jid()

    # Resolve project alias if cwd still missing
    if not cwd and project_key:
        resolved = _resolve_project(project_key)
        if resolved:
            _, cwd = resolved

    if not cmd:
        return {'ok': False, 'job_id': jid, 'error': 'command requis'}

    cwd_ok, cwd_err = _validate_cwd(cwd)
    if not cwd_ok:
        log.warning('[NEXUS_TERMINAL] blocked cwd=%s', cwd)
        return {'ok': False, 'job_id': jid, 'error': cwd_err}

    cmd_ok, cmd_err = _validate_dev_cmd(cmd)
    if not cmd_ok:
        log.warning('[NEXUS_TERMINAL] blocked cmd=%s', cmd[:80])
        return {'ok': False, 'job_id': jid, 'error': cmd_err}

    log.info('[NEXUS_TERMINAL] run cmd="%s" cwd=%s timeout=%ds streaming=%s',
             cmd[:80], cwd, timeout_s, sio is not None)
    t0 = time.monotonic()

    async def _emit_chunk(chunk: str, stream: str) -> None:
        if sio and chunk:
            try:
                await sio.emit('nexus:terminal_chunk', {
                    'job_id': jid, 'chunk': chunk, 'stream': stream,
                }, namespace='/nexus')
            except Exception as e:
                log.warning('[NEXUS_TERMINAL] chunk emit error: %s', e)

    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=cwd or None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_chunks: list[str] = []
        stderr_chunks: list[str] = []

        async def _read_stream(stream, store: list, stream_name: str) -> None:
            assert stream is not None
            async for raw_line in stream:
                line = raw_line.decode('utf-8', errors='replace')
                store.append(line)
                await _emit_chunk(line, stream_name)

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _read_stream(proc.stdout, stdout_chunks, 'stdout'),
                    _read_stream(proc.stderr, stderr_chunks, 'stderr'),
                ),
                timeout=float(timeout_s),
            )
            await proc.wait()
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            elapsed = round((time.monotonic() - t0) * 1000)
            _env_state.update({
                'lastCommand': cmd, 'lastCommandStatus': 'timeout',
                'lastCommandOutput': f'[timeout after {timeout_s}s]',
                'lastCommandElapsedMs': elapsed,
            })
            await _emit_chunk(f'[NEXUS] timeout après {timeout_s}s\n', 'stderr')
            return {'ok': False, 'job_id': jid, 'error': f'timeout après {timeout_s}s',
                    'command': cmd, 'cwd': cwd, 'elapsed_ms': elapsed}

        elapsed = round((time.monotonic() - t0) * 1000)
        rc      = proc.returncode
        stdout  = ''.join(stdout_chunks).strip()
        stderr  = ''.join(stderr_chunks).strip()
        ok      = rc == 0

        # Keep last 4000 chars of stdout, 1000 of stderr
        stdout_preview = stdout[-4000:] if len(stdout) > 4000 else stdout
        stderr_preview = stderr[-1000:] if len(stderr) > 1000 else stderr
        output_preview = (stdout_preview or stderr_preview or '')[:500]

        _env_state.update({
            'activeWorkingDir':     cwd,
            'lastCommand':          cmd,
            'lastCommandStatus':    'ok' if ok else 'error',
            'lastCommandOutput':    output_preview,
            'lastCommandElapsedMs': elapsed,
        })

        log.info('[NEXUS_TERMINAL] done cmd="%s" rc=%d elapsed=%dms stdout_len=%d',
                 cmd[:60], rc, elapsed, len(stdout))
        return {
            'ok':          ok,
            'job_id':      jid,
            'command':     cmd,
            'cwd':         cwd,
            'exit_code':   rc,
            'stdout':      stdout_preview,
            'stderr':      stderr_preview,
            'elapsed_ms':  elapsed,
        }

    except Exception as e:
        elapsed = round((time.monotonic() - t0) * 1000)
        log.error('[NEXUS_TERMINAL] error cmd="%s" err=%s', cmd[:60], e)
        return {'ok': False, 'job_id': jid, 'error': str(e), 'command': cmd, 'elapsed_ms': elapsed}


async def claude_code_start(data: dict) -> dict:
    """Run Claude Code CLI in a project dir with a prompt."""
    project_key = (data.get('project') or 'dzaryx').strip().lower()
    prompt      = (data.get('prompt') or '').strip()
    timeout_s   = min(int(data.get('timeout_s', 90)), 180)
    jid         = _jid()

    # Resolve project
    cwd = _PROJECT_PATHS.get(project_key)
    if not cwd:
        resolved = _resolve_project(project_key)
        if resolved:
            project_key, cwd = resolved
    if not cwd:
        return {'ok': False, 'job_id': jid, 'error': f'Projet inconnu: {project_key}',
                'available': list(_PROJECT_PATHS.keys())}

    # Claude CLI path
    claude_cmd = r'C:\Users\douba\AppData\Roaming\npm\claude.cmd'
    if not os.path.exists(claude_cmd):
        claude_cmd = 'claude'  # fallback to PATH

    if not prompt:
        # Just open VS Code in the project (non-blocking)
        log.info('[NEXUS_CLAUDE] open vscode project=%s cwd=%s', project_key, cwd)
        import subprocess as _sp
        _sp.Popen([r'C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe', cwd],
                  creationflags=_sp.DETACHED_PROCESS)
        _env_state.update({'activeProject': project_key, 'activeWorkingDir': cwd})
        return {'ok': True, 'job_id': jid, 'project': project_key, 'cwd': cwd,
                'launched': 'vscode', 'prompt': None}

    # Run claude --print with piped empty stdin to suppress stdin warning
    # cmd: echo. | claude.cmd --print "prompt" --dangerously-skip-permissions
    safe_prompt = prompt.replace('"', '\\"')
    shell_cmd   = f'echo. | "{claude_cmd}" --print "{safe_prompt}" --dangerously-skip-permissions'

    log.info('[NEXUS_CLAUDE] start project=%s prompt="%s" timeout=%ds cwd=%s',
             project_key, prompt[:80], timeout_s, cwd)
    t0 = time.monotonic()

    try:
        proc = await asyncio.create_subprocess_shell(
            shell_cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _env_state.update({
            'activeProject':       project_key,
            'activeWorkingDir':    cwd,
            'activeClaudeCodePid': proc.pid,
        })

        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=float(timeout_s)
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            elapsed = round((time.monotonic() - t0) * 1000)
            return {'ok': False, 'job_id': jid, 'error': f'Claude Code timeout après {timeout_s}s',
                    'project': project_key, 'cwd': cwd, 'elapsed_ms': elapsed}

        elapsed = round((time.monotonic() - t0) * 1000)
        rc      = proc.returncode
        stdout  = stdout_b.decode('utf-8', errors='replace').strip()
        stderr  = stderr_b.decode('utf-8', errors='replace').strip()

        # Strip known noise lines
        output = '\n'.join(
            line for line in stdout.splitlines()
            if not line.startswith('Warning:') and line.strip()
        ).strip()
        output_preview = output[-4000:] if len(output) > 4000 else output

        _env_state.update({
            'activeClaudeCodePid':  None,  # process done
            'lastCommand':          f'claude --print "{prompt[:60]}"',
            'lastCommandStatus':    'ok' if rc == 0 else 'error',
            'lastCommandOutput':    output_preview[:500],
            'lastCommandElapsedMs': elapsed,
        })

        log.info('[NEXUS_CLAUDE] done project=%s rc=%d elapsed=%dms output_len=%d',
                 project_key, rc, elapsed, len(output))
        return {
            'ok':         rc == 0,
            'job_id':     jid,
            'project':    project_key,
            'cwd':        cwd,
            'prompt':     prompt,
            'output':     output_preview,
            'exit_code':  rc,
            'elapsed_ms': elapsed,
        }

    except Exception as e:
        elapsed = round((time.monotonic() - t0) * 1000)
        log.error('[NEXUS_CLAUDE] error project=%s err=%s', project_key, e)
        return {'ok': False, 'job_id': jid, 'error': str(e), 'project': project_key, 'elapsed_ms': elapsed}


def get_environment() -> dict:
    return dict(_env_state)


# ── Screen Understanding ──────────────────────────────────────────────────────

async def screen_understand(data: dict, sio) -> dict:
    """Screenshot + Claude Vision analysis → Telegram."""
    question         = data.get('question') or 'Décris précisément ce que tu vois sur cet écran Windows.'
    send_telegram    = bool(data.get('send_to_telegram', True))
    caption_prefix   = data.get('caption') or '🔍 Analyse écran NEXUS'
    jid              = _jid()
    tmp              = tempfile.mktemp(suffix='.png', prefix='nexus_vision_')
    loop             = asyncio.get_event_loop()

    # Step 1 — Screenshot
    try:
        _, stderr, rc = await loop.run_in_executor(None, lambda: _ps(
            f"Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
            f"$s=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
            f"$bmp=New-Object System.Drawing.Bitmap($s.Width,$s.Height); "
            f"$g=[System.Drawing.Graphics]::FromImage($bmp); "
            f"$g.CopyFromScreen($s.Location,[System.Drawing.Point]::Empty,$s.Size); "
            f"$bmp.Save('{tmp}'); $bmp.Dispose(); $g.Dispose()",
            20,
        ))
        if rc != 0 or not os.path.exists(tmp):
            return {'ok': False, 'job_id': jid, 'error': f'Screenshot failed: {stderr}'}

        img = await loop.run_in_executor(None, lambda: open(tmp, 'rb').read())
        try:
            os.unlink(tmp)
        except Exception:
            pass
        b64 = base64.b64encode(img).decode()
    except Exception as e:
        return {'ok': False, 'job_id': jid, 'error': f'Screenshot error: {e}'}

    # Step 2 — Claude Vision
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    analysis = None
    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            msg = await loop.run_in_executor(None, lambda: client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=1024,
                messages=[{
                    'role': 'user',
                    'content': [
                        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': b64}},
                        {'type': 'text', 'text': question},
                    ],
                }],
            ))
            analysis = msg.content[0].text
        except Exception as e:
            log.warning('Claude Vision error: %s', e)
            analysis = f'(Vision error: {e})'
    else:
        analysis = '(ANTHROPIC_API_KEY not set — screenshot taken without analysis)'

    # Step 3 — Telegram
    if send_telegram:
        ts      = datetime.now().strftime('%H:%M:%S')
        caption = f'{caption_prefix} — {ts}\n\n{(analysis or "")[:900]}'
        await sio.emit('nexus:telegram_photo', {'image': b64, 'caption': caption}, namespace='/nexus')

    log.info('screen_understand [%s] size=%d analysis_len=%d', jid, len(img), len(analysis or ''))
    return {
        'ok':              True,
        'job_id':          jid,
        'question':        question,
        'analysis':        analysis,
        'size_bytes':      len(img),
        'sent_to_telegram': send_telegram,
    }
