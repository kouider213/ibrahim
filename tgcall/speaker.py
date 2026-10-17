"""Reconnaissance de la voix (qui parle au téléphone ?) — empreintes vocales locales, rien ne sort du VPS.

- Modèle CAM++ (3D-Speaker zh+en, ONNX, models/spk.onnx) via sherpa-onnx : une voix → un vecteur de 512 nombres.
- voiceprints/<nom>.npy = moyenne des vecteurs de la personne (+ .json : nombre d'échantillons).
- Kouider est appris tout seul à partir de ses vocaux Telegram et de ses appels reconnus ;
  Sa femme (ou un proche) est apprise pendant un appel quand elle se présente (outil learn_voice).
- Mot de passe vocal (« code secret … » sur Telegram) : déverrouille un appel si la voix n'est pas reconnue.
"""
import hashlib
import json
import logging
import subprocess
import threading
from pathlib import Path

import numpy as np

log = logging.getLogger('dzaryx-tg')

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / 'models' / 'spk.onnx'
PRINTS = ROOT / 'voiceprints'
OWNER = 'kouider'
MATCH = 0.50          # même personne au-dessus (cosinus, modèle 3D-Speaker CAM++)
REJECT = 0.30         # personne différente en dessous ; entre les deux → on écoute encore
MIN_ENROLL_S = 2.0
MAX_SAMPLES = 30      # au-delà, la moyenne glisse (la voix d'aujourd'hui compte autant)

_lock = threading.Lock()
_extractor = None


def _get():
    global _extractor
    if _extractor is None:
        import sherpa_onnx
        cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(MODEL), num_threads=1)
        _extractor = sherpa_onnx.SpeakerEmbeddingExtractor(cfg)
    return _extractor


def available() -> bool:
    return MODEL.exists()


def embed(pcm16: bytes, rate: int) -> np.ndarray | None:
    """PCM 16 bits mono → empreinte normalisée (None si trop court)."""
    if len(pcm16) < rate * 2:          # < 1 s
        return None
    samples = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32) / 32768.0
    with _lock:
        ex = _get()
        s = ex.create_stream()
        s.accept_waveform(rate, samples)
        s.input_finished()
        if not ex.is_ready(s):
            return None
        v = np.array(ex.compute(s), dtype=np.float32)
    n = float(np.linalg.norm(v))
    return v / n if n else None


def voiced(pcm16: bytes, rate: int, rms_min: int = 150) -> bytes:
    """Garde seulement les tranches de 20 ms où quelqu'un parle (pas les silences ni le souffle).
    Seuil relatif au volume de la personne (téléphone loin ou près de la bouche)."""
    a = np.frombuffer(pcm16, dtype=np.int16)
    step = rate // 50
    if len(a) < step:
        return b''
    fr = a[:len(a) // step * step].reshape(-1, step).astype(np.float32)
    rms = np.sqrt(np.mean(fr ** 2, axis=1))
    keep = fr[rms >= max(rms_min, 0.2 * float(np.percentile(rms, 95)))]
    return keep.astype(np.int16).tobytes() if len(keep) else b''


def ogg_to_pcm(path: str, rate: int = 16000) -> bytes:
    return subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(rate), '-f', 's16le', '-'],
                          capture_output=True, check=True, timeout=60).stdout


def _load(name: str) -> tuple[np.ndarray | None, int]:
    f = PRINTS / f'{name}.npy'
    if not f.exists():
        return None, 0
    meta = PRINTS / f'{name}.json'
    n = json.loads(meta.read_text()).get('n', 1) if meta.exists() else 1
    return np.load(f), n


def people() -> dict[str, np.ndarray]:
    if not PRINTS.exists():
        return {}
    return {f.stem: np.load(f) for f in PRINTS.glob('*.npy')}


def known(name: str = OWNER) -> int:
    """Nombre d'échantillons appris pour cette personne (0 = voix inconnue)."""
    return _load(name)[1]


def enroll(name: str, vec: np.ndarray) -> int:
    name = name.strip().lower()
    PRINTS.mkdir(exist_ok=True)
    cur, n = _load(name)
    w = min(n, MAX_SAMPLES)
    new = vec if cur is None else (cur * w + vec) / (w + 1)
    new = new / (np.linalg.norm(new) or 1)
    np.save(PRINTS / f'{name}.npy', new)
    (PRINTS / f'{name}.json').write_text(json.dumps({'n': n + 1}))
    log.info('voix de %s apprise (%d échantillons)', name, n + 1)
    return n + 1


def identify(vec: np.ndarray) -> tuple[str, float, float]:
    """→ (meilleure personne, son score, score de Kouider)."""
    best, best_s, owner_s = '', -1.0, -1.0
    for name, ref in people().items():
        s = float(np.dot(vec, ref))
        if name == OWNER:
            owner_s = s
        if s > best_s:
            best, best_s = name, s
    return best, best_s, owner_s


# ── Code secret (déverrouillage si la voix n'est pas reconnue) ──────────────
def _norm(code: str) -> str:
    # « FIK. », « f-i-k » → « fik » (la transcription ajoute ponctuation, espaces, accents)
    import unicodedata
    code = unicodedata.normalize('NFKD', code.lower())
    return ''.join(c for c in code if c.isalnum())


def _h(code: str) -> str:
    return hashlib.sha256(_norm(code).encode()).hexdigest()


def _variants(code: str) -> set[str]:
    # tolère une voyelle mal transcrite (« fek » pour « fik ») sur un code court
    c = _norm(code)
    out = {c}
    for i, ch in enumerate(c):
        if ch in 'aeiouy':
            out |= {c[:i] + v + c[i + 1:] for v in 'aeiouy'}
    return out


def set_passcode(code: str) -> None:
    PRINTS.mkdir(exist_ok=True)
    (PRINTS / 'passcode').write_text(_h(code))


def check_passcode(code: str) -> bool:
    f = PRINTS / 'passcode'
    if not f.exists() or not _norm(code):
        return False
    h = f.read_text().strip()
    return any(hashlib.sha256(v.encode()).hexdigest() == h for v in _variants(code))


GUARD = PRINTS / 'guard_on'


def guard_on() -> bool:
    # vérification de la voix au téléphone : désactivée par défaut (son compte Telegram suffit), « vérif voix on » pour l'activer
    return GUARD.exists()


def set_guard(on: bool) -> None:
    PRINTS.mkdir(exist_ok=True)
    GUARD.touch() if on else GUARD.unlink(missing_ok=True)


def has_passcode() -> bool:
    return (PRINTS / 'passcode').exists()
