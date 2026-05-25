import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import type { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

// Accepted pronunciations of "Dzaryx" by Google STT
const WAKE_WORDS = ['dzaryx', 'zaryx', 'dzary', 'dzar', 'zar'];

export function useWakeWord(onDetected: () => void): void {
  const activeRef    = useRef(false);
  const listeningRef = useRef(false);

  const startListening = useCallback(async () => {
    if (!activeRef.current || listeningRef.current) return;
    try {
      const Voice = (await import('@react-native-voice/voice')).default;
      await Voice.start('fr-FR');
      listeningRef.current = true;
    } catch { /* mic busy or permission denied — retry handled by onSpeechError */ }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let Voice: typeof import('@react-native-voice/voice').default;
    activeRef.current = true;

    async function init() {
      const mod = await import('@react-native-voice/voice');
      Voice = mod.default;

      Voice.onSpeechResults = (e: SpeechResultsEvent) => {
        listeningRef.current = false;
        const text = (e.value ?? []).join(' ').toLowerCase();
        if (WAKE_WORDS.some(w => text.includes(w))) {
          onDetected();
        }
        // Always restart — continuous monitoring
        if (activeRef.current) setTimeout(() => void startListening(), 300);
      };

      Voice.onSpeechError = (_e: SpeechErrorEvent) => {
        listeningRef.current = false;
        if (activeRef.current) setTimeout(() => void startListening(), 1500);
      };

      Voice.onSpeechEnd = () => {
        listeningRef.current = false;
        if (activeRef.current) setTimeout(() => void startListening(), 300);
      };

      await startListening();
    }

    void init();

    return () => {
      activeRef.current    = false;
      listeningRef.current = false;
      import('@react-native-voice/voice')
        .then(m => m.default.destroy())
        .then(v => (v as typeof Voice).removeAllListeners?.())
        .catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
