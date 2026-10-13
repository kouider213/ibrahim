"""
NEXUS Wake Word Detection + mode conversation
- « Nexus réveille-toi » → Nexus répond et ouvre une session
- « Nexus, ouvre Chrome » → la commande est exécutée directement
- Pendant la session (NEXUS_SESSION_TIMEOUT s, prolongée à chaque commande),
  plus besoin de redire « Nexus »
- « merci Nexus », « c'est tout », « repos »… → fin de session
- « tais-toi », « stop », « chut » pendant que Nexus parle → coupe la parole
Runs in background thread — does not block the event loop.

Détection LOCALE du mot « Nexus » (idée reprise de bertrandmbanwi/Jarvis, avec Vosk au lieu d'OpenWakeWord qui n'a
pas de modèle « nexus ») : hors session, le son n'est envoyé à Google QUE si le PC a entendu « Nexus » ; pendant que
Nexus parle, « tais-toi / stop / chut » est reconnu localement aussi. Modèle vosk-model-small-fr-0.22 (~41 Mo),
téléchargé tout seul au 1er démarrage dans nexus/data/. NEXUS_LOCAL_WAKE=0 pour revenir à l'ancien mode.
Testé sur voix de synthèse : 8/8 « Nexus » détectés, 0 faux déclenchement sur 6 phrases ordinaires.
"""
import asyncio
import logging
import os
import re
import threading
import time
from pathlib import Path

log = logging.getLogger('nexus.wake_word')

WAKE_PHRASES = [
    'nexus réveille-toi', 'nexus reveille toi', 'nexus reveil',
    'nexus wake up', 'nexus en ligne', 'nexus activation',
    'hey nexus', 'nexus debout', 'nexus allume', 'active nexus',
]
SESSION_TIMEOUT = float(os.environ.get('NEXUS_SESSION_TIMEOUT', '30'))

# ── Détection locale (Vosk, grammaire restreinte) ────────────────────────────
_VOSK_NAME = 'vosk-model-small-fr-0.22'
_VOSK_DIR = Path(__file__).resolve().parent.parent / 'data' / _VOSK_NAME
_VOSK_URL = f'https://alphacephei.com/vosk/models/{_VOSK_NAME}.zip'
_GRAMMAR = '["nexus", "hey nexus", "ok nexus", "tais toi", "stop", "chut", "silence", "[unk]"]'
_vosk_model = None
_vosk_state = 'off'   # off | loading | ready | failed


def _load_vosk() -> None:
    """Charge (et télécharge au besoin) le modèle Vosk, dans un thread à part."""
    global _vosk_model, _vosk_state
    try:
        from vosk import Model, SetLogLevel
        SetLogLevel(-1)
        if not (_VOSK_DIR / 'am').exists():
            import io
            import urllib.request
            import zipfile
            log.info('Téléchargement du modèle de réveil local (%s, ~41 Mo)…', _VOSK_NAME)
            with urllib.request.urlopen(_VOSK_URL, timeout=300) as r:
                zipfile.ZipFile(io.BytesIO(r.read())).extractall(_VOSK_DIR.parent)
        _vosk_model = Model(str(_VOSK_DIR))
        _vosk_state = 'ready'
        log.info('Réveil local prêt : « Nexus » est détecté sur le PC, sans envoyer le son à Google')
    except Exception as e:
        _vosk_state = 'failed'
        log.warning('Réveil local indisponible (%s) — ancien mode (Google)', e)


def local_keywords(audio) -> set[str] | None:
    """Mots-clés entendus localement dans un speech_recognition.AudioData, ou None si Vosk n'est pas prêt."""
    if _vosk_state != 'ready':
        return None
    import json
    from vosk import KaldiRecognizer
    rec = KaldiRecognizer(_vosk_model, 16000, _GRAMMAR)
    rec.AcceptWaveform(audio.get_raw_data(convert_rate=16000, convert_width=2))
    text = json.loads(rec.FinalResult()).get('text', '')
    found = set()
    if 'nexus' in text:
        found.add('nexus')
    if any(w in text for w in ('tais toi', 'stop', 'chut', 'silence')):
        found.add('stop')
    return found

# Phrase qui commence par « nexus » → la suite est une commande
_LEADING_WAKE_RE = re.compile(r'^\s*(?:hey\s+|ok\s+|dis\s+)?nexus\b[\s,.!?:-]*', re.I)
_STOP_SPEECH_RE  = re.compile(r'\b(tais[\s-]?toi|chut|stop|silence|arr[eê]te\s+de\s+parler|ferme[\s-]la)\b', re.I)
_SLEEP_RE        = re.compile(
    r"\b(merci(\s+nexus)?|c'?est\s+tout|ce\s+sera\s+tout|repos|au\s+revoir|bonne\s+nuit|à\s+plus|a\s+plus|mets[\s-]toi\s+en\s+veille)\b",
    re.I,
)


def parse_utterance(text: str, in_session: bool, speaking: bool) -> tuple[str, str]:
    """Décide quoi faire d'une phrase entendue.
    Retourne (action, commande) avec action ∈ stop_speech | sleep | wake | command | ignore.
    """
    raw = text.strip()
    t = raw.lower()  # même longueur → les index restent valides sur raw
    if not t:
        return 'ignore', ''

    # Pendant que Nexus parle : on n'écoute que l'interruption (évite qu'il s'entende lui-même)
    if speaking:
        return ('stop_speech', '') if _STOP_SPEECH_RE.search(t) else ('ignore', '')

    # Fin de session : phrases courtes uniquement (« merci » au milieu d'une commande ne compte pas)
    if in_session and len(t.split()) <= 4 and _SLEEP_RE.search(t):
        return 'sleep', ''

    for phrase in WAKE_PHRASES:
        idx = t.find(phrase)
        if idx >= 0:
            rest = raw[idx + len(phrase):].strip(' ,.!?:-')
            return ('command', rest) if len(rest) > 2 else ('wake', '')

    m = _LEADING_WAKE_RE.match(t)
    if m:
        rest = raw[m.end():].strip(' ,.!?:-')
        return ('command', rest) if len(rest) > 2 else ('wake', '')

    if in_session:
        return 'command', raw
    return 'ignore', ''


class WakeWordDetector:
    def __init__(self, app) -> None:
        self.app = app
        self._active = False
        self._thread: threading.Thread | None = None
        self._session_until = 0.0

    @property
    def in_session(self) -> bool:
        return time.time() < self._session_until

    def start(self) -> None:
        if not self.app.voice._sr:
            log.warning('Wake word disabled — SpeechRecognition not available')
            return
        self._active = True
        global _vosk_state
        if os.environ.get('NEXUS_LOCAL_WAKE', '1') != '0' and _vosk_state == 'off':
            _vosk_state = 'loading'
            threading.Thread(target=_load_vosk, daemon=True, name='nexus-vosk').start()
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        log.info('Wake word detector started (say "Nexus réveille-toi" ou "Nexus, <commande>")')

    def stop(self) -> None:
        self._active = False

    def _run(self, coro) -> None:
        if self.app.loop:
            asyncio.run_coroutine_threadsafe(coro, self.app.loop)

    def _listen_loop(self) -> None:
        try:
            import speech_recognition as sr
        except ImportError:
            log.error('SpeechRecognition not installed')
            return

        rec = sr.Recognizer()
        rec.energy_threshold = 200
        rec.dynamic_energy_threshold = True
        rec.pause_threshold = 0.6

        was_in_session = False
        while self._active:
            # Le micro manuel du GUI a la main → on ne se bat pas pour le périphérique
            if self.app.mic_active:
                time.sleep(0.5)
                continue

            if was_in_session and not self.in_session:
                log.info('Session expirée → veille')
                self._run(self.app.gui_send({'type': 'status', 'text': 'NEXUS VEILLE'}))
            was_in_session = self.in_session

            try:
                with sr.Microphone() as source:
                    rec.adjust_for_ambient_noise(source, duration=0.2)
                    try:
                        audio = rec.listen(source, timeout=4, phrase_time_limit=10 if self.in_session else 6)
                    except sr.WaitTimeoutError:
                        continue
                # Filtre local : hors session, rien ne part chez Google tant que « Nexus » n'est pas entendu
                kw = local_keywords(audio) if not self.in_session or self.app.voice.is_speaking else None
                if kw is not None:
                    if self.app.voice.is_speaking:
                        if 'stop' in kw:
                            self.app.voice.stop()
                        continue
                    if 'nexus' not in kw:
                        continue
                from modules.offline_brain import recognize
                text = recognize(rec, audio)
                if not text:
                    if kw and 'nexus' in kw:      # « Nexus » entendu mais la phrase n'a pas pu être transcrite
                        text = 'nexus'
                    else:
                        continue
                log.debug('Heard: %s', text)

                action, command = parse_utterance(text, self.in_session, self.app.voice.is_speaking)
                if action == 'stop_speech':
                    self.app.voice.stop()
                elif action == 'sleep':
                    self._session_until = 0.0
                    self._run(self._on_sleep())
                elif action == 'wake':
                    log.info('Wake word detected: %s', text)
                    self._session_until = time.time() + SESSION_TIMEOUT
                    self._run(self._on_wake())
                elif action == 'command':
                    log.info('Commande vocale: %s', command)
                    self._session_until = time.time() + SESSION_TIMEOUT
                    self._run(self.app.handle_command(command, 'nexus'))
            except Exception as e:
                log.error('Wake word loop error: %s', e)
                time.sleep(2)

    async def _on_wake(self) -> None:
        await self.app.gui_send({'type': 'status', 'text': 'NEXUS ACTIF'})
        await self.app.speak("Oui Kouider, NEXUS en ligne. Qu'est-ce qu'on fait ?")
        await self.app.journal('🎤 Wake word détecté — NEXUS activé')

    async def _on_sleep(self) -> None:
        await self.app.speak('À ton service Kouider. Je me mets en veille.')
        await self.app.gui_send({'type': 'status', 'text': 'NEXUS VEILLE'})
