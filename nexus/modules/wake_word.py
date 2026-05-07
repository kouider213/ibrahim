"""
NEXUS Wake Word Detection
Listens continuously for "nexus réveille-toi" or activation phrases.
Runs in background thread — does not block the event loop.
"""
import asyncio
import logging
import threading
import time

log = logging.getLogger('nexus.wake_word')

WAKE_PHRASES = [
    'nexus réveille-toi', 'nexus reveille toi', 'nexus reveil',
    'nexus wake up', 'nexus en ligne', 'nexus activation',
    'hey nexus', 'nexus debout', 'nexus allume', 'active nexus',
]


class WakeWordDetector:
    def __init__(self, app) -> None:
        self.app = app
        self._active = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if not self.app.voice._sr:
            log.warning('Wake word disabled — SpeechRecognition not available')
            return
        self._active = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        log.info('Wake word detector started (say "Nexus réveille-toi")')

    def stop(self) -> None:
        self._active = False

    def _listen_loop(self) -> None:
        try:
            import speech_recognition as sr
        except ImportError:
            log.error('SpeechRecognition not installed')
            return

        rec = sr.Recognizer()
        rec.energy_threshold = 200
        rec.dynamic_energy_threshold = True
        rec.pause_threshold = 0.5

        while self._active:
            try:
                with sr.Microphone() as source:
                    rec.adjust_for_ambient_noise(source, duration=0.2)
                    try:
                        audio = rec.listen(source, timeout=4, phrase_time_limit=5)
                    except sr.WaitTimeoutError:
                        continue
                try:
                    text = rec.recognize_google(audio, language='fr-FR').lower()
                    log.debug('Heard: %s', text)
                    if any(phrase in text for phrase in WAKE_PHRASES):
                        log.info('Wake word detected: %s', text)
                        if self.app.loop:
                            asyncio.run_coroutine_threadsafe(
                                self._on_wake(), self.app.loop
                            )
                        time.sleep(4)  # Pause to avoid re-triggering
                except Exception:
                    pass
            except Exception as e:
                log.error('Wake word loop error: %s', e)
                time.sleep(2)

    async def _on_wake(self) -> None:
        await self.app.gui_send({'type': 'waveform', 'active': True})
        await self.app.speak("Oui Kouider, NEXUS en ligne. Qu'est-ce qu'on fait ?")
        await self.app.gui_send({'type': 'waveform', 'active': False})
        await self.app.gui_send({'type': 'status', 'text': 'NEXUS ACTIF'})
        await self.app.journal('🎤 Wake word détecté — NEXUS activé')
        # Start mic for follow-up command
        if not self.app.mic_active:
            self.app.toggle_mic()
            await asyncio.sleep(10)
            if self.app.mic_active:
                self.app.toggle_mic()
