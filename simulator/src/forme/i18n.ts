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
    if (m) return lead + p.idx.reduce((s, n, i) => s.replace(`{${n}}`, DICT[(m[i + 1] ?? '').trim()] ?? m[i + 1] ?? ''), p.to) + trail;
  }
  return text;
}

/** Titres en 2 parties (« Tes » + « outils » en italique) : traduits ensemble, l'ordre des mots change en arabe. */
export function trPair(a: string, b?: string): [string, string | undefined] {
  if (lang !== 'ar' || b == null) return [lang === 'ar' ? tr(a) : a, b];
  const hit = DICT[`§${a}|${b}`];
  if (hit) { const [x, y] = hit.split('|'); return [x ?? '', y]; }
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
const done = new WeakSet<Node>();
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    const p = root.parentElement;
    if (!p || p.closest('[data-notr], script, style, textarea')) return;
    const t = root.nodeValue ?? '';
    const n = tr(t);
    if (n !== t) { root.nodeValue = n; done.add(root); }
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
      if (m.type === 'characterData') { if (!done.has(m.target)) walk(m.target); done.delete(m.target); }
      else if (m.type === 'attributes') walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
