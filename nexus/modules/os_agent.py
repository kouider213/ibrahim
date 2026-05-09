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


# ── Application Launcher ──────────────────────────────────────────────────────

async def app_launch(data: dict) -> dict:
    app_key = data.get('app', '').strip().lower()
    jid     = _jid()
    if not app_key:
        return {'ok': False, 'job_id': jid, 'error': 'app required', 'available': list(_APP_REGISTRY.keys())}
    if app_key not in _APP_REGISTRY:
        return {'ok': False, 'job_id': jid, 'error': f'Unknown app: {app_key}', 'available': list(_APP_REGISTRY.keys())}

    cmd = _APP_REGISTRY[app_key]
    loop = asyncio.get_event_loop()
    try:
        # If first token is absolute path, verify it exists; try where.exe fallback
        exe = cmd[0]
        if os.path.isabs(exe) and not os.path.exists(exe):
            wo, _, _ = await loop.run_in_executor(None, lambda: _ps(f'where.exe "{os.path.basename(exe)}"', 5))
            if wo:
                cmd = [wo.splitlines()[0].strip()] + cmd[1:]
            else:
                return {'ok': False, 'job_id': jid, 'error': f'Executable not found: {exe}'}

        subprocess.Popen(
            cmd,
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
        jobs_log.info('app_launch', extra={'data': {'job_id': jid, 'app': app_key, 'cmd': cmd[0]}})
        return {'ok': True, 'job_id': jid, 'app': app_key, 'launched': True}
    except FileNotFoundError:
        return {'ok': False, 'job_id': jid, 'error': f'Executable not found for: {app_key}'}
    except Exception as e:
        log.error('app_launch ERROR: %s', e)
        return {'ok': False, 'job_id': jid, 'error': str(e)}


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
