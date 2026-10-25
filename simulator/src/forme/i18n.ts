import AR from './ar.json';

// Langue de FORME. Sa femme l'utilise en ARABE LITTÉRAIRE (langue principale, Kouider 25/10), le français reste possible.
// L'interface est écrite en français ; en arabe, chaque texte affiché est remplacé par sa traduction (ar.json, faite une
// fois par Claude : textes fixes + modèles « {0} » pour les textes avec des chiffres). Les contenus générés (recettes,
// conseils, analyses photo) arrivent déjà en arabe du serveur.
const DICT = AR as Record<string, string>;
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const PATTERNS = Object.keys(DICT).filter(k => /\{\d\}/.test(k) && !k.startsWith('§'))
  .map(k => ({ re: new RegExp(`^${esc(k).replace(/\\?\{(\d)\\?\}/g, '(.+?)')}$`), to: DICT[k]!, idx: [...k.matchAll(/\{(\d)\}/g)].map(m => Number(m[1])) }))
  .sort((a, b) => b.re.source.length - a.re.source.length);

let lang: 'fr' | 'ar' = 'fr';

// TRADUCTION À LA VOLÉE : tout texte encore en français à l'écran (recettes déjà créées, exercices, analyses, textes
// avec des chiffres…) part au serveur (Claude, mis en cache) et revient en arabe ; gardé aussi sur le téléphone.
const LIVE_KEY = 'forme:ar-live';
let LIVE: Record<string, string> = {};
try { LIVE = JSON.parse(localStorage.getItem(LIVE_KEY) || '{}'); } catch { /* */ }
let fetcher: ((texts: string[]) => Promise<Record<string, string>>) | null = null;
export const setTranslator = (f: (texts: string[]) => Promise<Record<string, string>>) => { fetcher = f; };
const pending = new Set<string>(), asked = new Set<string>();
let flushT: ReturnType<typeof setTimeout> | null = null;
const KEEP = /^(Colruyt|Delhaize|Aldi|Lidl|Carrefour|Albert Heijn|Intermarché|Wegovy|Dzaryx|FORME|Boni|Basic-Fit|Jims|Telegram|WhatsApp|iPhone|OK|kcal|kg|g|min|cm|mg|€|K|F|[A-Z])$/i;
const needs = (t: string) => /[A-Za-zÀ-ÿ]{2}/.test(t) && !/[\u0600-\u06FF]/.test(t) && !KEEP.test(t) && !/^https?:|@|^[\d\s.,:/%+-]+[a-z]{0,4}$/i.test(t);
function queue(t: string) {
  if (!fetcher || asked.has(t)) return;
  pending.add(t);
  if (!flushT) flushT = setTimeout(flush, 500);
}
async function flush() {
  flushT = null;
  const list = [...pending].slice(0, 80); list.forEach(t => { pending.delete(t); asked.add(t); });
  if (!list.length || !fetcher) return;
  try {
    const map = await fetcher(list);
    Object.assign(LIVE, map);
    const keys = Object.keys(LIVE);
    if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete LIVE[k];
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(LIVE)); } catch { /* */ }
    if (lang === 'ar') walk(document.body);
  } catch { list.forEach(t => asked.delete(t)); }
  if (pending.size) flushT = setTimeout(flush, 800);
}
export const isAr = () => lang === 'ar';

export function tr(text: string): string {
  if (lang !== 'ar') return text;
  const norm = text.replace(/ /g, ' ');
  const core = norm.trim();
  if (!core) return text;
  const lead = norm.slice(0, norm.indexOf(core)), trail = norm.slice(norm.indexOf(core) + core.length);
  const hit = DICT[core];
  if (hit) return lead + hit + trail;
  for (const p of PATTERNS) {
    const m = p.re.exec(core);
    if (m) return lead + p.idx.reduce((s, n, i) => {
      const part = (m[i + 1] ?? '').trim();
      const v = DICT[part] ?? LIVE[part];
      if (!v && needs(part)) queue(part);   // morceau variable encore en français (nom de plat, site…)
      return s.replace(`{${n}}`, v ?? m[i + 1] ?? '');
    }, p.to) + trail;
  }
  const live = LIVE[core];
  if (live) return lead + live + trail;
  if (needs(core)) queue(core);
  return text;
}

/** Titres en 2 parties (« Tes » + « outils » en italique) : traduits ensemble, l'ordre des mots change en arabe. */
export function trPair(a: string, b?: string): [string, string | undefined] {
  if (lang !== 'ar' || b == null) return [lang === 'ar' ? tr(a) : a, b];
  const hit = DICT[`§${a}|${b}`];
  if (typeof hit === 'string') { const [x, y] = hit.split('|'); return [x ?? '', y]; }
  // Modèle avec un prénom : « Salut {0}, » + « on mange quoi ? »
  for (const k of Object.keys(DICT)) {
    if (!k.startsWith('§') || !k.includes('{0}')) continue;
    const [ka, kb] = k.slice(1).split('|');
    const m = new RegExp(`^${esc(ka!).replace('\\{0\\}', '(.+?)')}$`).exec(a);
    if (m && kb === b) { const [x, y] = DICT[k]!.replace('{0}', m[1]!).split('|'); return [x ?? '', y]; }
  }
  return [tr(a), tr(b)];
}

const ATTRS = ['placeholder', 'aria-label', 'title'];
// Texte d'origine de chaque nœud : on peut le retraduire quand une traduction arrive plus tard
const orig = new WeakMap<Node, string>(), shown = new WeakMap<Node, string>();
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = root.parentElement;
    if (!p || p.closest('[data-notr], script, style, textarea')) return;
    const cur = root.nodeValue ?? '';
    const base = shown.get(root) === cur ? orig.get(root) ?? cur : cur;   // changé par React → nouveau texte d'origine
    const n = tr(base);
    orig.set(root, base); shown.set(root, n);
    if (n !== cur) root.nodeValue = n;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const n = tr(v); if (n !== v) el.setAttribute(a, n); } }
  for (const c of Array.from(el.childNodes)) walk(c);
}

let obs: MutationObserver | null = null;
export function applyLang(l: 'fr' | 'ar') {
  if (l === lang && (l === 'fr' || obs)) return;
  if (lang === 'ar' && l === 'fr') { location.reload(); return; }   // revenir au français = recharger proprement
  lang = l;
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  if (l !== 'ar') return;
  if (!document.getElementById('ar-font')) {
    const link = document.createElement('link');
    link.id = 'ar-font'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Noto+Naskh+Arabic:wght@500;700&display=swap';
    document.head.appendChild(link);
    const st = document.createElement('style');
    st.textContent = 'html[lang=ar] body, html[lang=ar] button, html[lang=ar] input { font-family: "Cairo", "Inter Tight", sans-serif !important; letter-spacing: 0 !important; }';
    document.head.appendChild(st);
  }
  walk(document.body);
  obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
