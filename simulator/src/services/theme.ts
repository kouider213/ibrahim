// Thème de l'app : « clair », « sombre » ou « auto » (suit le réglage de l'iPhone). Gardé sur le téléphone.
export type ThemeMode = 'light' | 'dark' | 'auto';
const KEY = 'dz:theme';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeMode(): ThemeMode {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark' || v === 'auto') return v; } catch { /* navigation privée */ }
  return 'light';
}
export function resolvedTheme(mode = getThemeMode()): 'light' | 'dark' {
  return mode === 'auto' ? (mq?.matches ? 'dark' : 'light') : mode;
}
export function applyTheme(mode = getThemeMode()) {
  const t = resolvedTheme(mode);
  document.documentElement.dataset['theme'] = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#09090c' : '#f2f2f5');
  window.dispatchEvent(new CustomEvent('dz-theme', { detail: t }));
}
export function setThemeMode(mode: ThemeMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* rien */ }
  applyTheme(mode);
}
mq?.addEventListener?.('change', () => { if (getThemeMode() === 'auto') applyTheme(); });
