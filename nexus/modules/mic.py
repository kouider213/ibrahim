"""
NEXUS Micro — écoute une phrase et la rend en speech_recognition.AudioData.

PyAudio (sr.Microphone) quand il est installé ; sinon sounddevice (déjà dans requirements, PortAudio inclus sous Windows).
PyAudio n'a souvent pas de paquet prêt pour les Python récents (3.13/3.14) : son installation échoue et Nexus
n'entendait plus rien. Avec ce module, le micro marche dans les deux cas.
"""
import collections
import logging
import math
import time
from array import array

log = logging.getLogger('nexus.mic')

RATE, BLOCK = 16000, 480            # blocs de 30 ms
_backend: str | None = None


def backend() -> str:
    """'pyaudio', 'sounddevice' ou '' (aucun micro utilisable)."""
    global _backend
    if _backend is None:
        try:
            import pyaudio  # noqa: F401
            _backend = 'pyaudio'
        except Exception:
            try:
                import sounddevice as sd
                sd.query_devices(kind='input')
                _backend = 'sounddevice'
            except Exception as e:
                log.error('Aucun micro utilisable (ni PyAudio ni sounddevice) : %s', e)
                _backend = ''
        if _backend:
            log.info('Micro : %s', _backend)
    return _backend


def available() -> bool:
    return bool(backend())


def _rms(raw: bytes) -> float:
    a = array('h', raw)
    return math.sqrt(sum(x * x for x in a) / len(a)) if a else 0.0


def listen(rec, timeout: float = 5, phrase_time_limit: float = 10, ambient: float = 0.25):
    """Une phrase du micro → sr.AudioData. Lève sr.WaitTimeoutError si personne ne parle avant `timeout`."""
    import speech_recognition as sr
    if backend() == 'pyaudio':
        with sr.Microphone() as source:
            rec.adjust_for_ambient_noise(source, duration=ambient)
            return rec.listen(source, timeout=timeout, phrase_time_limit=phrase_time_limit)
    if not backend():
        raise OSError('aucun micro')

    import sounddevice as sd
    pause = getattr(rec, 'pause_threshold', 0.8)
    pre = collections.deque(maxlen=int(0.4 * RATE / BLOCK))         # 400 ms gardées avant le début de la phrase
    with sd.RawInputStream(samplerate=RATE, channels=1, dtype='int16', blocksize=BLOCK) as stream:
        noise = [_rms(stream.read(BLOCK)[0]) for _ in range(max(1, int(ambient * RATE / BLOCK)))]
        threshold = max(getattr(rec, 'energy_threshold', 300) * .6, sum(noise) / len(noise) * 2.8, 180)
        start = time.time()
        while True:                                                 # attente du début de la phrase
            raw = bytes(stream.read(BLOCK)[0])
            pre.append(raw)
            if _rms(raw) > threshold:
                break
            if time.time() - start > timeout:
                raise sr.WaitTimeoutError('silence')
        frames, quiet, t0 = list(pre), 0.0, time.time()
        while time.time() - t0 < phrase_time_limit:               # jusqu'à un silence de `pause` secondes
            raw = bytes(stream.read(BLOCK)[0])
            frames.append(raw)
            quiet = quiet + BLOCK / RATE if _rms(raw) < threshold else 0.0
            if quiet >= pause:
                break
    return sr.AudioData(b''.join(frames), RATE, 2)
