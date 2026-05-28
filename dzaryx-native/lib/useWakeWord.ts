import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import {
  PorcupineManager,
  BuiltInKeywords,
} from '@picovoice/porcupine-react-native';

// ── CONFIG — fill these after picovoice.ai signup ─────────────────────────────
export const PORCUPINE_ACCESS_KEY = 'REPLACE_WITH_YOUR_PICOVOICE_ACCESS_KEY';

// Custom "Dzaryx" keyword paths — place .ppn files in assets/ folder
// Download from: picovoice.ai → Console → Wake Word → train "Dzaryx" → download
const CUSTOM_KEYWORD_ANDROID = 'Dzaryx_en_android_v3_0_0.ppn'; // in android/app/src/main/assets/
const CUSTOM_KEYWORD_IOS     = 'Dzaryx_en_ios_v3_0_0.ppn';     // in iOS bundle

// If custom keyword not yet available, falls back to built-in "Jarvis"
const USE_CUSTOM = false; // ← set true once .ppn files added to assets/
// ──────────────────────────────────────────────────────────────────────────────

export function useWakeWord(onDetected: () => void): { active: boolean; error: string | null } {
  const managerRef  = useRef<PorcupineManager | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const stableDetected = useRef(onDetected);
  stableDetected.current = onDetected;

  const onError = useCallback((err: Error) => {
    console.warn('[porcupine] error:', err);
    setError(err.message);
    setActive(false);
  }, []);

  useEffect(() => {
    if (!PORCUPINE_ACCESS_KEY || PORCUPINE_ACCESS_KEY.startsWith('REPLACE')) {
      console.warn('[porcupine] No access key — wake word disabled');
      setError('No access key');
      return;
    }

    let mounted = true;

    async function start() {
      try {
        let manager: PorcupineManager;

        if (USE_CUSTOM) {
          const keywordPath = Platform.OS === 'ios' ? CUSTOM_KEYWORD_IOS : CUSTOM_KEYWORD_ANDROID;
          manager = await PorcupineManager.fromKeywordPaths(
            PORCUPINE_ACCESS_KEY,
            [keywordPath],
            (idx) => { if (idx === 0) stableDetected.current(); },
            onError,
          );
        } else {
          // Built-in fallback: "Jarvis"
          manager = await PorcupineManager.fromBuiltInKeywords(
            PORCUPINE_ACCESS_KEY,
            [BuiltInKeywords.JARVIS],
            (idx) => { if (idx === 0) stableDetected.current(); },
            onError,
          );
        }

        if (!mounted) {
          await manager.stop();
          manager.delete();
          return;
        }

        managerRef.current = manager;
        await manager.start();
        setActive(true);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[porcupine] init failed:', msg);
        setError(msg);
        setActive(false);
      }
    }

    void start();

    return () => {
      mounted = false;
      if (managerRef.current) {
        managerRef.current.stop()
          .then(() => managerRef.current?.delete())
          .catch(() => {});
        managerRef.current = null;
      }
      setActive(false);
    };
  }, [onError]);

  return { active, error };
}
