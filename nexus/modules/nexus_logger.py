"""
NEXUS Structured Logger — production logging with JSON output and file rotation.

Logs are written to nexus/logs/:
  nexus.log      — general application events
  jobs.log       — every command execution (start/done/fail/timeout/blocked)
  security.log   — blocked commands, auth events, suspicious activity
  websocket.log  — connect/disconnect/heartbeat/backoff events
"""
import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any

# ── Log directory ─────────────────────────────────────────────────────────────

_LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
os.makedirs(_LOG_DIR, exist_ok=True)

# ── JSON formatter ────────────────────────────────────────────────────────────

class _JsonFormatter(logging.Formatter):
    def __init__(self, channel: str) -> None:
        super().__init__()
        self._channel = channel

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            'ts':      datetime.now(timezone.utc).isoformat(),
            'channel': self._channel,
            'level':   record.levelname,
            'msg':     record.getMessage(),
        }
        if record.exc_info:
            payload['exc'] = self.formatException(record.exc_info)
        if hasattr(record, 'data'):
            payload['data'] = record.data  # type: ignore[attr-defined]
        return json.dumps(payload, ensure_ascii=False)


def _make_handler(filename: str, channel: str, max_bytes: int = 5_242_880, backup_count: int = 3) -> RotatingFileHandler:
    path    = os.path.join(_LOG_DIR, filename)
    handler = RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backup_count, encoding='utf-8')
    handler.setFormatter(_JsonFormatter(channel))
    return handler


# ── Channel loggers ───────────────────────────────────────────────────────────

def _channel(name: str, filename: str, level: int = logging.DEBUG) -> logging.Logger:
    lg = logging.getLogger(f'nexus.{name}')
    if not lg.handlers:
        lg.setLevel(level)
        lg.addHandler(_make_handler(filename, name))
        lg.propagate = False
    return lg


nexus_log    = _channel('general',   'nexus.log')
jobs_log     = _channel('jobs',      'jobs.log')
security_log = _channel('security',  'security.log')
ws_log       = _channel('websocket', 'websocket.log')

# ── Convenience helpers ───────────────────────────────────────────────────────

def log_job_start(job_id: str, cmd: str, cwd: str | None, timeout_s: int) -> None:
    jobs_log.info('job_start', extra={'data': {
        'job_id': job_id, 'cmd': cmd[:200], 'cwd': cwd, 'timeout_s': timeout_s,
    }})

def log_job_done(job_id: str, cmd: str, exit_code: int, stdout_len: int, stderr_len: int, elapsed_ms: int) -> None:
    jobs_log.info('job_done', extra={'data': {
        'job_id': job_id, 'cmd': cmd[:200],
        'exit_code': exit_code, 'stdout_len': stdout_len,
        'stderr_len': stderr_len, 'elapsed_ms': elapsed_ms,
    }})

def log_job_blocked(cmd: str, pattern: str) -> None:
    security_log.warning('job_blocked', extra={'data': {'cmd': cmd[:200], 'pattern': pattern}})
    jobs_log.warning('job_blocked', extra={'data': {'cmd': cmd[:200], 'blocked_by': pattern}})

def log_job_timeout(job_id: str, cmd: str, timeout_s: int) -> None:
    jobs_log.error('job_timeout', extra={'data': {
        'job_id': job_id, 'cmd': cmd[:200], 'timeout_s': timeout_s,
    }})

def log_ws_connect(socket_id: str, ip: str) -> None:
    ws_log.info('ws_connect', extra={'data': {'socket_id': socket_id, 'ip': ip}})

def log_ws_disconnect(socket_id: str, reason: str, total: int) -> None:
    ws_log.warning('ws_disconnect', extra={'data': {
        'socket_id': socket_id, 'reason': reason, 'total_disconnections': total,
    }})

def log_ws_backoff(delay_s: int, attempt: int) -> None:
    ws_log.info('ws_backoff', extra={'data': {'delay_s': delay_s, 'attempt': attempt}})

def log_ws_heartbeat(latency_ms: int) -> None:
    ws_log.debug('ws_heartbeat', extra={'data': {'latency_ms': latency_ms}})

def log_security_event(event: str, detail: str) -> None:
    security_log.warning(event, extra={'data': {'detail': detail}})
