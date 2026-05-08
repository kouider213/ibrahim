"""
NEXUS Voice Module
TTS: ElevenLabs streaming (fallback: pyttsx3)
STT: Google Speech Recognition fr-FR
"""
import asyncio
import logging
import os

log = logging.getLogger('nexus.voice')

VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', 'pNInz6obpgDQGcFmaJgB')
API_KEY  = os.environ.get('ELEVENLABS_API_KEY', '')


class VoiceModule:
    def __init__(self) -> None:
        self._el_client = None
        self._sr = None
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

    def _speak_sync(self, text: str) -> None:
        if self._el_client:
            try:
                from elevenlabs import stream as el_stream
                # SDK >= 1.0: text_to_speech.convert()
                audio = self._el_client.text_to_speech.convert(
                    voice_id=VOICE_ID,
                    text=text,
                    model_id='eleven_multilingual_v2',
                    output_format='mp3_44100_128',
                )
                el_stream(audio)
                return
            except Exception as e:
                log.error('ElevenLabs error: %s', e)

        # Fallback: pyttsx3
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
            text = self._sr.recognize_google(audio, language='fr-FR')
            log.info('STT: %s', text)
            return text
        except Exception:
            return None
