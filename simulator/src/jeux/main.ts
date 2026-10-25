import { bootIdentity, games, online, fromHub, type Uid } from '../games/net.ts';
import { getDeviceToken } from '../services/api.ts';

// Page JEUX : les jeux du couple + le duel (records de chacun) + l'invitation en cours de l'autre.
bootIdentity({ name: 'Nos Jeux', short: 'Jeux', color: '#5b5cff', icon: '/ibrahim/icons/jeux-512.png' });
const $ = (id: string) => document.getElementById(id)!;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const invite = (() => { try { return getDeviceToken() ? '' : localStorage.getItem('forme:token') ?? ''; } catch { return ''; } })();
// les liens vers les jeux gardent le jeton de Fatima (icône d'écran d'accueil séparée de Safari)
if (invite) document.querySelectorAll<HTMLAnchorElement>('a.game').forEach(a => { a.href += `&invite=${encodeURIComponent(invite)}`; });
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $('bLang').textContent = lang === 'ar' ? 'FR' : 'ع';
  $('title').textContent = lang === 'ar' ? 'ألعابنا' : 'Nos Jeux';
  $('sub').textContent = lang === 'ar' ? 'قويدر ♥ فاطمة — وحدك أو معًا، كلٌّ بهاتفه' : 'Kouider ♥ Fatima — seul ou à deux, chacun sur son téléphone';
  $('foot').textContent = lang === 'ar' ? 'قريبًا: المطعم المجنون 🍲' : 'Bientôt : Le Resto en Folie 🍲';
  document.querySelectorAll<HTMLElement>('[data-ar]').forEach(el => { el.dataset.fr ??= el.textContent ?? ''; el.textContent = lang === 'ar' ? el.dataset.ar! : el.dataset.fr; });
}
$('bLang').onclick = () => { lang = lang === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('jeux:lang', lang); } catch { /* */ } applyLang(); };
$('bExit').hidden = !embedded; $('bExit').onclick = () => window.parent.postMessage({ type: 'jeux:exit' }, '*');
void fromHub;
const GAME_NAME: Record<string, string> = { folie: 'La Grande Folie', gardiens: 'Les Gardiens', oeil: "L'Œil", rush: 'RUSH', resto: 'Le Resto' };
async function refresh() {
  if (!online()) return;
  try {
    const b = await games.board(); const n = b.names; const best = (k: string, u: Uid) => b.board[k]?.[u]?.best ?? 0;
    const oe = (u: Uid) => Math.max(best('oeil:facile', u), best('oeil:normal', u), best('oeil:difficile', u));
    $('duel').hidden = false;
    $('duel').innerHTML = `<div><small>${n.kouider}</small><b>👑 ${best('folie', 'kouider')}</b><small>🛡️ ${best('gardiens', 'kouider').toLocaleString('fr-FR')} · 👁️ ${oe('kouider').toLocaleString('fr-FR')}</small></div><div style="font-family:var(--d);color:#ff3d8b">VS</div><div><small>${n.femme}</small><b>👑 ${best('folie', 'femme')}</b><small>🛡️ ${best('gardiens', 'femme').toLocaleString('fr-FR')} · 👁️ ${oe('femme').toLocaleString('fr-FR')}</small></div>`;
    const v = await games.peek(); const r = v.room;
    if (r && !r.ended && r.host !== r.me && !r.players[r.me] && !r.otherGone && GAME_NAME[r.game]) {
      const live = $('live'); live.hidden = false; live.innerHTML = `<span style="font-size:26px">🎮</span><span style="flex:1">${n[r.host]} ${lang === 'ar' ? 'يدعوك إلى' : 't\'invite à'} ${GAME_NAME[r.game]} !</span><span>▶</span>`;
      live.onclick = () => { location.href = `../${r.game}/?hub=1${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`; };
    } else $('live').hidden = true;
  } catch { /* */ }
}
applyLang(); void refresh(); setInterval(() => void refresh(), 5000);
