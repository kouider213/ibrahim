"""
NEXUS Voice Module
TTS: ElevenLabs → edge-tts (gratuit, voix neuronale FR) → pyttsx3
     Lecture via pygame quand dispo → interruptible avec stop()
STT: Google Speech Recognition fr-FR
"""
import asyncio
import logging
import os
import tempfile
import threading
import time

log = logging.getLogger('nexus.voice')

VOICE_ID   = os.environ.get('ELEVENLABS_VOICE_ID', 'pNInz6obpgDQGcFmaJgB')
API_KEY    = os.environ.get('ELEVENLABS_API_KEY', '')
EDGE_VOICE = os.environ.get('EDGE_TTS_VOICE', 'fr-FR-HenriNeural')


class VoiceModule:
    def __init__(self) -> None:
        self._el_client = None
        self._sr = None
        self._stop = threading.Event()
        self.is_speaking = False
        self._setup()

    def _setup(self) -> None:
        if API_KEY:
            try:
                from elevenlabs.client import ElevenLabs
                self._el_client = ElevenLabs(api_key=API_KEY)
                log.info('ElevenLabs TTS ready (voice=%s)', VOICE_ID[:8])
            except ImportError:
                log.warning('elevenlabs not installed → pip install elevenlabs')

        try:
            import speech_recognition as sr
            self._sr = sr.Recognizer()
            self._sr.energy_threshold = 300
            self._sr.dynamic_energy_threshold = True
            self._sr.pause_threshold = 0.8
            log.info('Speech recognition ready')
        except ImportError:
            log.warning('SpeechRecognition not installed → pip install SpeechRecognition pyaudio')

    async def speak(self, text: str) -> None:
        if not text:
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._speak_sync, text)

    def stop(self) -> None:
        """Coupe la parole en cours (« tais-toi », « stop »)."""
        if self.is_speaking:
            log.info('TTS interrompu')
        self._stop.set()

    def _speak_sync(self, text: str) -> None:
        self._stop.clear()
        self.is_speaking = True
        try:
            if self._el_client and self._speak_elevenlabs(text):
                return
            if self._speak_edge(text):
                return
            self._speak_pyttsx3(text)
        finally:
            self.is_speaking = False

    # ── Moteurs TTS ──────────────────────────────────────────────────────────
    def _speak_elevenlabs(self, text: str) -> bool:
        try:
            audio = self._el_client.text_to_speech.convert(
                voice_id=VOICE_ID,
                text=text,
                model_id='eleven_multilingual_v2',
                output_format='mp3_44100_128',
            )
            # pygame dispo → on bufferise pour pouvoir interrompre ; sinon streaming mpv
            if _pygame_ready():
                return _play_mp3_bytes(b''.join(audio), self._stop)
            from elevenlabs import stream as el_stream
            el_stream(audio)
            return True
        except Exception as e:
            log.error('ElevenLabs error: %s', e)
            return False

    def _speak_edge(self, text: str) -> bool:
        """Fallback gratuit (voix neuronale Microsoft Edge), bien meilleur que pyttsx3."""
        try:
            import edge_tts
        except ImportError:
            return False
        if not _pygame_ready():
            return False
        tmp = os.path.join(tempfile.gettempdir(), f'nexus_tts_{int(time.time() * 1000)}.mp3')
        try:
            asyncio.run(edge_tts.Communicate(text, voice=EDGE_VOICE).save(tmp))
            with open(tmp, 'rb') as f:
                return _play_mp3_bytes(f.read(), self._stop)
        except Exception as e:
            log.error('edge-tts error: %s', e)
            return False
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass

    def _speak_pyttsx3(self, text: str) -> None:
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty('rate', 165)
            for v in engine.getProperty('voices'):
                if 'fr' in v.id.lower() or 'french' in v.name.lower():
                    engine.setProperty('voice', v.id)
                    break
            engine.say(text)
            engine.runAndWait()
        except Exception as e:
            log.error('pyttsx3 error: %s', e)

    def listen_once(self) -> str | None:
        if not self._sr:
            return None
        try:
            import speech_recognition as sr
            with sr.Microphone() as source:
                self._sr.adjust_for_ambient_noise(source, duration=0.3)
                audio = self._sr.listen(source, timeout=10, phrase_time_limit=20)
            from modules.offline_brain import recognize
            text = recognize(self._sr, audio)
            if text:
                log.info('STT: %s', text)
            return text
        except Exception:
            return None


# ── Lecture audio (pygame) ───────────────────────────────────────────────────
_pygame_ok: bool | None = None


def _pygame_ready() -> bool:
    global _pygame_ok
    if _pygame_ok is None:
        try:
            import pygame
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            _pygame_ok = True
        except Exception as e:
            log.warning('pygame indisponible (%s) → pip install pygame', e)
            _pygame_ok = False
    return _pygame_ok


def _play_mp3_bytes(data: bytes, stop: threading.Event) -> bool:
    import io
    import pygame
    try:
        pygame.mixer.music.load(io.BytesIO(data), 'mp3')
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            if stop.is_set():
                pygame.mixer.music.stop()
                break
            time.sleep(0.05)
        pygame.mixer.music.unload()
        return True
    except Exception as e:
        log.error('Lecture audio échouée: %s', e)
        return False
