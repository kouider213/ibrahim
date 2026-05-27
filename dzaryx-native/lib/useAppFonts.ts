import { useFonts } from 'expo-font';

/**
 * Font files must be placed in assets/fonts/ before first use.
 * Download from Google Fonts:
 *   Orbitron: https://fonts.google.com/specimen/Orbitron  → Orbitron-Regular.ttf, Orbitron-Bold.ttf
 *   Exo 2:   https://fonts.google.com/specimen/Exo+2     → Exo2-Regular.ttf, Exo2-SemiBold.ttf
 */
export function useAppFonts() {
  return useFonts({
    'Orbitron':       require('../assets/fonts/Orbitron-Regular.ttf'),
    'Orbitron-Bold':  require('../assets/fonts/Orbitron-Bold.ttf'),
    'Exo2':           require('../assets/fonts/Exo2-Regular.ttf'),
    'Exo2-SemiBold':  require('../assets/fonts/Exo2-SemiBold.ttf'),
  });
}

/** Font family names for StyleSheet usage */
export const FONTS = {
  orbitron:      'Orbitron',
  orbitronBold:  'Orbitron-Bold',
  exo2:          'Exo2',
  exo2SemiBold:  'Exo2-SemiBold',
} as const;
