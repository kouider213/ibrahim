"""
NEXUS Offline — Nexus continue de marcher sans internet ou quand Claude/OpenAI tombent
(idée reprise de bertrandmbanwi/Jarvis et Open.Jarvis).

- Cerveau local : Ollama (http://localhost:11434), modèle NEXUS_OLLAMA_MODEL (défaut qwen3:4b-instruct, ~2,5 Go, répond sans « réfléchir à voix haute »).
- Oreille locale : faster-whisper (modèle NEXUS_WHISPER_MODEL, défaut « small ») quand la reconnaissance
  Google ne répond pas.
- La voix marche déjà hors ligne (pyttsx3) et les commandes locales (minuteurs, volume, fichiers…) aussi.

Installation en une phrase : « installe le mode hors ligne » (winget Ollama + téléchargement du modèle).
"""
import logging
import re
import os
import socket
import subprocess
import threading
import time

import requests

log = logging.getLogger('nexus.offline')

OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434').rstrip('/')
MODEL = os.getenv('NEXUS_OLLAMA_MODEL', 'qwen3:4b-instruct')
WHISPER_MODEL = os.getenv('NEXUS_WHISPER_MODEL', 'small')

SYSTEM = (
    "Tu es NEXUS, l'assistant du PC de Kouider (Fik Conciergerie, location de voitures à Oran). "
    "Tu fonctionnes en MODE HORS LIGNE : pas d'internet, pas d'accès aux réservations, mails ni agenda. "
    "Réponds en français, en 1 à 3 phrases courtes faites pour être lues à voix haute. "
    "Si on te demande une info du business (réservation, client, paiement) ou d'internet, dis simplement "
    "que tu es hors ligne et que Dzaryx répondra dès que la connexion revient."
)

_net_cache: tuple[float, bool] = (0.0, True)
_history: list[dict] = []
_whisper = None
_whisper_lock = threading.Lock()


def internet_ok() -> bool:
    """Test rapide (mis en cache 20 s) : connexion TCP à deux serveurs DNS publics."""
    global _net_cache
    ts, ok = _net_cache
    if time.time() - ts < 20:
        return ok
    ok = False
    for host in ('1.1.1.1', '8.8.8.8'):
        try:
            with socket.create_connection((host, 443), timeout=1.5):
                ok = True
                break
        except OSError:
            continue
    _net_cache = (time.time(), ok)
    return ok


def ollama_ok() -> bool:
    try:
        return requests.get(f'{OLLAMA_URL}/api/tags', timeout=1.5).ok
    except Exception:
        return False


def ask(text: str) -> str:
    """Réponse du modèle local (garde les 6 derniers échanges)."""
    if not ollama_ok():
        return ("Je suis hors ligne et le cerveau local n'est pas installé. "
                "Quand internet revient, dis « installe le mode hors ligne ».")
    _history.append({'role': 'user', 'content': text})
    del _history[:-12]
    try:
        r = requests.post(f'{OLLAMA_URL}/api/chat', timeout=120, json={
            'model': MODEL, 'stream': False, 'keep_alive': '30m',
            'messages': [{'role': 'system', 'content': SYSTEM}, *_history],
            'options': {'temperature': 0.4, 'num_predict': 300},
        })
        r.raise_for_status()
        answer = (r.json().get('message') or {}).get('content', '')
        answer = re.sub(r'<think>.*?</think>', '', answer, flags=re.S).strip()   # modèles « thinking »
    except Exception as e:
        log.error('ollama: %s', e)
        return f"Le cerveau local ne répond pas ({e})."
    _history.append({'role': 'assistant', 'content': answer})
    return '(hors ligne) ' + (answer or "Je n'ai pas de réponse.")


def transcribe_local(audio) -> str | None:
    """speech_recognition.AudioData → texte, avec faster-whisper (si installé)."""
    global _whisper
    try:
        import io
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    with _whisper_lock:
        if _whisper is None:
            log.info('Chargement de faster-whisper %s…', WHISPER_MODEL)
            _whisper = WhisperModel(WHISPER_MODEL, device='cpu', compute_type='int8')
        segments, _ = _whisper.transcribe(io.BytesIO(audio.get_wav_data(convert_rate=16000)),
                                          language='fr', vad_filter=True, beam_size=1)
        text = ' '.join(s.text for s in segments).strip()
    return text or None


def recognize(rec, audio) -> str | None:
    """Google d'abord ; si pas de réseau (ou Google en panne) → whisper local."""
    import speech_recognition as sr
    try:
        return rec.recognize_google(audio, language='fr-FR')
    except sr.UnknownValueError:
        return None
    except Exception as e:     # RequestError : pas d'internet / service coupé
        log.info('STT Google indisponible (%s) → local', type(e).__name__)
        try:
            return transcribe_local(audio)
        except Exception as e2:
            log.error('whisper: %s', e2)
            return None


_INSTALL_PHRASES = ('installe le mode hors ligne', 'installe le mode hors-ligne', 'active le mode hors ligne',
                    'installe le cerveau local', 'installe ollama')


def wants_install(text: str) -> bool:
    t = text.lower().strip().rstrip('.!?')
    return any(t.endswith(p) or t == p for p in _INSTALL_PHRASES)


def install() -> str:
    """winget Ollama + modèle + faster-whisper. Long (plusieurs minutes) : lancé dans un thread par l'appelant."""
    steps = []
    if not ollama_ok():
        r = subprocess.run(['winget', 'install', '-e', '--id', 'Ollama.Ollama', '--silent',
                            '--accept-package-agreements', '--accept-source-agreements'],
                           capture_output=True, text=True, timeout=900)
        steps.append('Ollama installé' if r.returncode == 0 else f'Ollama : échec winget ({r.returncode})')
        time.sleep(5)
    exe = os.path.expandvars(r'%LOCALAPPDATA%\Programs\Ollama\ollama.exe')
    ollama = exe if os.path.exists(exe) else 'ollama'
    r = subprocess.run([ollama, 'pull', MODEL], capture_output=True, text=True, timeout=3600)
    steps.append(f'modèle {MODEL} prêt' if r.returncode == 0 else f'modèle {MODEL} : échec ({r.stderr[-200:]})')
    import sys
    r = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'faster-whisper'],
                       capture_output=True, text=True, timeout=1200)
    steps.append('reconnaissance vocale locale prête' if r.returncode == 0 else 'faster-whisper : échec pip')
    return 'Mode hors ligne : ' + ', '.join(steps) + '.'
