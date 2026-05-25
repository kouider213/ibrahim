import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const ACCESS_KEY = process.env.EXPO_PUBLIC_PICOVOICE_ACCESS_KEY ?? '';

// Drop-in swap: replace BuiltInKeywords.PORCUPINE with custom .ppn path
// once dzaryx_android.ppn is bundled in assets/.

export function useWakeWord(onDetected: () => void): void {
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!ACCESS_KEY || Platform.OS !== 'android') return;

    let cancelled = false;

    async function start() {
      try {
        const { default: Porcupine, BuiltInKeywords } =
          await import('@picovoice/porcupine-react-native');

        const porcupine = await Porcupine.fromBuiltInKeywords(
          ACCESS_KEY,
          // Placeholder keyword until dzaryx_android.ppn is ready.
          // Say "porcupine" to trigger for now.
          [BuiltInKeywords.PORCUPINE],
        );

        if (cancelled) { await porcupine.delete(); return; }

        porcupine.onKeywordDetection = () => { if (!cancelled) onDetected(); };
        await porcupine.start();

        stopRef.current = async () => {
          await porcupine.stop();
          await porcupine.delete();
        };
      } catch (err) {
        console.warn('[wake-word] Porcupine init failed:', err);
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopRef.current?.().catch(() => {});
      stopRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
