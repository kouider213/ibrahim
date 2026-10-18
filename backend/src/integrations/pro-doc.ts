import axios from 'axios';
import { createAnthropic, CLAUDE_MAIN } from './anthropic-compat.js';
import { token, notConnected } from './google-docs.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { chartPngUrl, cleanChart, type ChartSpec } from './chart-image.js';

// Dossier de présentation soigné dans Google Docs (create_presentation_doc) :
//   page de garde avec le logo FIK → résumé + sommaire (numéros de page réels) → une partie par page.
// Claude rédige (JSON), puis on monte le document via l'API Docs. Prend 1 à 2 min : le travail tourne
// en arrière-plan et le lien est envoyé sur Telegram + dans l'app (un appel téléphonique n'attend que 90 s).

export const LOGO_URL = process.env['BRAND_LOGO_URL']
  ?? 'https://febrrgqpyqqrewcohomx.supabase.co/storage/v1/object/public/client-documents/branding/fik-logo.jpg';

export type Block =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbers'; items: string[] }
  | { type: 'chart'; chart: ChartSpec };
export interface Section { title: string; blocks: Block[] }
export interface DocSpec { title: string; subtitle?: string; summary: string[]; sections: Section[] }

// ── Mise en page ─────────────────────────────────────────────────────────────
const GOLD  = { red: 0.62, green: 0.48, blue: 0.13 };
const INK   = { red: 0.13, green: 0.13, blue: 0.13 };
const GREY  = { red: 0.45, green: 0.45, blue: 0.45 };
const SERIF = 'Playfair Display';
const SANS  = 'Lato';

type Align = 'START' | 'CENTER' | 'JUSTIFIED';
interface ParaStyle { named: string; align?: Align; before?: number; after?: number; lineSpacing?: number }
interface TextStyle { font: string; size: number; color: typeof INK; bold?: boolean; italic?: boolean }

const STYLE: Record<string, { para: ParaStyle; text: TextStyle }> = {
  title:    { para: { named: 'TITLE', align: 'CENTER', before: 18, after: 6 },  text: { font: SERIF, size: 30, color: GOLD, bold: true } },
  subtitle: { para: { named: 'SUBTITLE', align: 'CENTER', after: 4 },          text: { font: SANS, size: 14, color: INK } },
  cover:    { para: { named: 'NORMAL_TEXT', align: 'CENTER', after: 2 },       text: { font: SANS, size: 11, color: GREY } },
  h1:       { para: { named: 'HEADING_1', before: 0, after: 14 },               text: { font: SERIF, size: 22, color: GOLD, bold: true } },
  h2:       { para: { named: 'HEADING_2', before: 14, after: 6 },               text: { font: SERIF, size: 14, color: INK, bold: true } },
  p:        { para: { named: 'NORMAL_TEXT', align: 'JUSTIFIED', after: 8, lineSpacing: 125 }, text: { font: SANS, size: 11, color: INK } },
  li:       { para: { named: 'NORMAL_TEXT', after: 4, lineSpacing: 120 },       text: { font: SANS, size: 11, color: INK } },
  toc:      { para: { named: 'NORMAL_TEXT', after: 6 },                          text: { font: SANS, size: 12, color: INK } },
  blank:    { para: { named: 'NORMAL_TEXT' },                                    text: { font: SANS, size: 11, color: INK } },
};

const pageToken = (i: number) => `⟦P${i}⟧`;

/** « **gras** » → texte nu + plages en gras. */
function parseBold(raw: string): { text: string; bold: Array<[number, number]> } {
  const bold: Array<[number, number]> = [];
  let text = '';
  const parts = raw.split('**');
  parts.forEach((part, i) => {
    if (i % 2 === 1 && i < parts.length - 1) bold.push([text.length, text.length + part.length]);
    text += part;
  });
  return { text: text.replace(/\n+/g, ' ').trim(), bold };
}

class Builder {
  reqs: unknown[] = [];
  bullets: unknown[] = [];
  cursor = 1;
  tocLines: Array<{ start: number; end: number; section: number }> = [];

  private styleRange(start: number, end: number, s: { para: ParaStyle; text: TextStyle }, bold: Array<[number, number]> = []) {
    const p = s.para;
    this.reqs.push({ updateParagraphStyle: {
      range: { startIndex: start, endIndex: end },
      paragraphStyle: {
        namedStyleType: p.named, alignment: p.align ?? 'START',
        spaceAbove: { magnitude: p.before ?? 0, unit: 'PT' }, spaceBelow: { magnitude: p.after ?? 0, unit: 'PT' },
        lineSpacing: p.lineSpacing ?? 115,
      },
      fields: 'namedStyleType,alignment,spaceAbove,spaceBelow,lineSpacing',
    } });
    const t = s.text;
    if (end - 1 > start) {
      this.reqs.push({ updateTextStyle: {
        range: { startIndex: start, endIndex: end - 1 },
        textStyle: { weightedFontFamily: { fontFamily: t.font }, fontSize: { magnitude: t.size, unit: 'PT' },
          foregroundColor: { color: { rgbColor: t.color } }, bold: !!t.bold, italic: !!t.italic },
        fields: 'weightedFontFamily,fontSize,foregroundColor,bold,italic',
      } });
    }
    for (const [a, b] of bold) {
      if (b > a) this.reqs.push({ updateTextStyle: { range: { startIndex: start + a, endIndex: start + b }, textStyle: { bold: true }, fields: 'bold' } });
    }
  }

  para(raw: string, kind: keyof typeof STYLE): { start: number; end: number } {
    const { text, bold } = parseBold(raw);
    const start = this.cursor;
    this.reqs.push({ insertText: { location: { index: start }, text: text + '\n' } });
    this.cursor += text.length + 1;
    this.styleRange(start, this.cursor, STYLE[kind]!, bold);
    return { start, end: this.cursor };
  }

  list(items: string[], numbered: boolean) {
    if (!items.length) return;
    const start = this.cursor;
    for (const it of items) this.para(it.replace(/^\s*([-•*]|\d+[.)])\s+/, ''), 'li');
    this.bullets.push({ createParagraphBullets: {
      range: { startIndex: start, endIndex: this.cursor - 1 },
      bulletPreset: numbered ? 'NUMBERED_DECIMAL_ALPHA_ROMAN' : 'BULLET_DISC_CIRCLE_SQUARE',
    } });
  }

  /** Graphique en image (PNG) + légende ; sans image → les chiffres en liste. */
  chart(c: ChartSpec, url: string | null) {
    if (!url) {
      this.para(c.title, 'h2');
      this.list(c.data.map(d => `${d.label} : ${d.value.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')}${c.unit ? ` ${c.unit}` : ''}`), false);
      return;
    }
    const start = this.cursor;
    this.reqs.push({ insertInlineImage: { location: { index: start }, uri: url,
      objectSize: { width: { magnitude: 450, unit: 'PT' }, height: { magnitude: 262.5, unit: 'PT' } } } });
    this.reqs.push({ insertText: { location: { index: start + 1 }, text: '\n' } });
    this.cursor += 2;
    this.reqs.push({ updateParagraphStyle: { range: { startIndex: start, endIndex: this.cursor },
      paragraphStyle: { namedStyleType: 'NORMAL_TEXT', alignment: 'CENTER', spaceAbove: { magnitude: 10, unit: 'PT' }, spaceBelow: { magnitude: 10, unit: 'PT' } },
      fields: 'namedStyleType,alignment,spaceAbove,spaceBelow' } });
  }

  pageBreak() {
    this.reqs.push({ insertPageBreak: { location: { index: this.cursor } } });
    this.cursor += 2;
    this.styleRange(this.cursor - 2, this.cursor, STYLE['blank']!);
  }

  image(uri: string, widthPt: number, heightPt: number) {
    const start = this.cursor;
    this.reqs.push({ insertInlineImage: { location: { index: start }, uri,
      objectSize: { width: { magnitude: widthPt, unit: 'PT' }, height: { magnitude: heightPt, unit: 'PT' } } } });
    this.reqs.push({ insertText: { location: { index: start + 1 }, text: '\n' } });
    this.cursor += 2;
    this.reqs.push({ updateParagraphStyle: { range: { startIndex: start, endIndex: this.cursor },
      paragraphStyle: { namedStyleType: 'NORMAL_TEXT', alignment: 'CENTER', spaceAbove: { magnitude: 24, unit: 'PT' } },
      fields: 'namedStyleType,alignment,spaceAbove' } });
  }
}

function build(spec: DocSpec, withLogo: boolean, chartUrls: Map<ChartSpec, string | null>): Builder {
  const b = new Builder();
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric' });

  // 1. Page de garde
  if (withLogo) b.image(LOGO_URL, 225, 300);
  b.para(spec.title, 'title');
  if (spec.subtitle) b.para(spec.subtitle, 'subtitle');
  b.para('FIK Conciergerie — Oran', 'cover');
  b.para(date, 'cover');
  b.pageBreak();

  // 2. Résumé + sommaire
  b.para('Résumé', 'h1');
  for (const s of spec.summary) b.para(s, 'p');
  b.para('Sommaire', 'h2');
  spec.sections.forEach((s, i) => {
    const r = b.para(`${i + 1}.  ${s.title}  —  page ${pageToken(i + 1)}`, 'toc');
    b.tocLines.push({ ...r, section: i });
  });

  // 3. Une partie par page
  spec.sections.forEach((s, i) => {
    b.pageBreak();
    b.para(`${i + 1}. ${s.title}`, 'h1');
    for (const bl of s.blocks) {
      if (bl.type === 'p') b.para(bl.text, 'p');
      else if (bl.type === 'h2') b.para(bl.text, 'h2');
      else if (bl.type === 'bullets') b.list(bl.items, false);
      else if (bl.type === 'numbers') b.list(bl.items, true);
      else if (bl.type === 'chart') b.chart(bl.chart, chartUrls.get(bl.chart) ?? null);
    }
  });
  return b;
}

// ── Numéros de page : export PDF puis recherche des titres de partie ─────────
const compact = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

async function pdfPages(buf: ArrayBuffer): Promise<string[]> {
  // pdfjs-dist est un module ES : import() natif (sinon tsc le transforme en require)
  const pdfjs = await (new Function('s', 'return import(s)'))('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(compact(tc.items.map((it: { str?: string }) => it.str ?? '').join('')));
  }
  return pages;
}

async function sectionPages(docId: string, headers: Record<string, string>, spec: DocSpec): Promise<number[] | null> {
  try {
    // Lien d'export de Docs (marche sans l'API Drive, non activée dans le projet Google)
    const { data } = await axios.get(`https://docs.google.com/document/d/${docId}/export`,
      { headers, params: { format: 'pdf' }, responseType: 'arraybuffer', timeout: 60_000 });
    const pages = await pdfPages(data as ArrayBuffer);
    // Le sommaire contient aussi les titres : on cherche après sa dernière page
    let from = pages.reduce((last, txt, i) => (txt.includes('p1') && txt.includes('sommaire') ? i : last), 1) + 1;
    const out: number[] = [];
    spec.sections.forEach((s, i) => {
      const needle = compact(`${i + 1}. ${s.title}`).slice(0, 40);
      let found = -1;
      for (let p = from; p < pages.length; p++) if (pages[p]!.includes(needle)) { found = p; break; }
      out.push(found >= 0 ? found + 1 : 0);
      if (found >= 0) from = found;
    });
    return out.every(n => n > 0) ? out : null;
  } catch (err) {
    console.warn('[pro-doc] numéros de page:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function renderProDoc(spec: DocSpec, withLogo = true, withImages = true): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const t = await token();
  if (!t) return { ok: false, error: notConnected() };
  const headers = { Authorization: `Bearer ${t}` };
  const api = (id: string, requests: unknown[]) =>
    axios.post(`https://docs.googleapis.com/v1/documents/${id}:batchUpdate`, { requests }, { headers, timeout: 60_000 });

  try {
    const { data: created } = await axios.post('https://docs.googleapis.com/v1/documents', { title: spec.title }, { headers, timeout: 15_000 });
    const id = (created as { documentId: string }).documentId;
    // Graphiques → PNG publics (Google les télécharge pendant le montage)
    const charts = spec.sections.flatMap(s => s.blocks.flatMap(bl => (bl.type === 'chart' ? [bl.chart] : [])));
    const urls = withImages ? await Promise.all(charts.map(chartPngUrl)) : charts.map(() => null);
    const chartUrls = new Map(charts.map((c, i) => [c, urls[i] ?? null] as const));
    const b = build(spec, withLogo, chartUrls);
    try { await api(id, [...b.reqs, ...b.bullets]); }
    catch (err) {
      // Logo ou graphique injoignable par Google → on refait sans images plutôt que d'échouer
      if (!withLogo && !withImages) throw err;
      console.warn('[pro-doc] rendu avec images refusé, nouvel essai sans images:', axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? '').slice(0, 200) : String(err));
      await axios.delete(`https://www.googleapis.com/drive/v3/files/${id}`, { headers }).catch(() => {});
      return renderProDoc(spec, false, false);
    }

    // Pied de page (pas sur la page de garde) + sommaire cliquable vers chaque partie
    const { data: foot } = await api(id, [
      { updateDocumentStyle: { documentStyle: { useFirstPageHeaderFooter: true }, fields: 'useFirstPageHeaderFooter' } },
      { createFooter: { type: 'DEFAULT' } },
    ]);
    const footerId = (foot as { replies: Array<{ createFooter?: { footerId: string } }> }).replies[1]?.createFooter?.footerId;
    const { data: doc } = await axios.get(`https://docs.googleapis.com/v1/documents/${id}`, { headers, timeout: 30_000 });
    const headingIds = new Map<string, string>();
    for (const el of (doc as { body: { content: Array<{ paragraph?: { paragraphStyle?: { headingId?: string; namedStyleType?: string }; elements?: Array<{ textRun?: { content?: string } }> } }> } }).body.content) {
      const ps = el.paragraph?.paragraphStyle;
      if (ps?.namedStyleType === 'HEADING_1' && ps.headingId) {
        headingIds.set((el.paragraph!.elements ?? []).map(e => e.textRun?.content ?? '').join('').trim(), ps.headingId);
      }
    }
    const second: unknown[] = [];
    if (footerId) {
      const text = `FIK Conciergerie  ·  ${spec.title}`;
      second.push({ insertText: { location: { segmentId: footerId, index: 0 }, text } });
      second.push({ updateTextStyle: { range: { segmentId: footerId, startIndex: 0, endIndex: text.length },
        textStyle: { weightedFontFamily: { fontFamily: SANS }, fontSize: { magnitude: 9, unit: 'PT' }, foregroundColor: { color: { rgbColor: GREY } } },
        fields: 'weightedFontFamily,fontSize,foregroundColor' } });
      second.push({ updateParagraphStyle: { range: { segmentId: footerId, startIndex: 0, endIndex: text.length },
        paragraphStyle: { alignment: 'CENTER' }, fields: 'alignment' } });
    }
    for (const line of b.tocLines) {
      const hid = headingIds.get(`${line.section + 1}. ${spec.sections[line.section]!.title}`.replace(/\*\*/g, '').trim());
      if (hid) second.push({ updateTextStyle: { range: { startIndex: line.start, endIndex: line.end - 1 },
        textStyle: { link: { headingId: hid }, foregroundColor: { color: { rgbColor: INK } }, underline: false },
        fields: 'link,foregroundColor,underline' } });
    }
    if (second.length) await api(id, second);

    // Numéros de page réels (sinon on retire la mention de page)
    const pages = await sectionPages(id, headers, spec);
    await api(id, spec.sections.map((_, i) => ({ replaceAllText: {
      containsText: { text: `  —  page ${pageToken(i + 1)}`, matchCase: true },
      replaceText: pages ? `  —  page ${pages[i]}` : '',
    } })));

    return { ok: true, url: `https://docs.google.com/document/d/${id}/edit` };
  } catch (err) {
    const msg = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message).slice(0, 400) : String(err);
    return { ok: false, error: `❌ Création du dossier échouée : ${msg}` };
  }
}

// ── Rédaction ────────────────────────────────────────────────────────────────
const anthropic = createAnthropic();
const MODEL = process.env['DOSSIER_MODEL'] ?? CLAUDE_MAIN;

const WRITER_SYSTEM = `Tu es le rédacteur de FIK Conciergerie (location de voitures et conciergerie à Oran, Algérie ; fondateur Kouider, basé à Bruxelles ; associé Houari à Oran).
Tu rédiges des DOSSIERS DE PRÉSENTATION à remettre (partenaires, clients, investisseurs, banque) : français impeccable, ton professionnel et chaleureux, phrases claires, vouvoiement du lecteur.
Règles absolues :
- N'utilise QUE les faits fournis. N'invente aucun chiffre, nom, prix, date ni client. S'il manque une info, n'en parle pas.
- Pas de markdown sauf **gras** pour quelques mots-clés. Pas d'émojis. Pas de titres dans les paragraphes.
- Chaque partie est vraiment rédigée : un paragraphe d'introduction, puis des développements (paragraphes, sous-titres h2, listes). Pas de style télégraphique.
- GRAPHIQUES : dès que les faits contiennent des chiffres comparables (revenus, répartition, évolution, projection, comparaison), ajoute un bloc chart là où il éclaire le propos (2 à 5 dans un dossier chiffré, aucun sinon). chart.type = "bar" (comparer), "pie" (répartition d'un total), "line" (évolution dans le temps). Valeurs = uniquement les chiffres fournis ; si ce sont des hypothèses, écris-le dans le titre du graphique. Le texte autour commente le graphique.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"title": "...", "subtitle": "...", "summary": ["paragraphe", "..."], "sections": [{"title": "...", "blocks": [{"type":"p","text":"..."},{"type":"h2","text":"..."},{"type":"bullets","items":["..."]},{"type":"numbers","items":["..."]},{"type":"chart","chart":{"type":"bar","title":"...","unit":"€","data":[{"label":"...","value":123}]}}]}]}
summary = 2 ou 3 paragraphes qui présentent le dossier et annoncent ce que contient chaque partie. sections = 3 à 8 parties, titres courts (sans numéro).`;

// Schéma imposé à l'API (sortie structurée) : la réponse est TOUJOURS un JSON valide de cette forme
const STR = { type: 'string' } as const;
const strs = { type: 'array', items: STR } as const;
const block = (type: string, props: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false, required: ['type', ...Object.keys(props)],
  properties: { type: { type: 'string', enum: [type] }, ...props },
});
const DOSSIER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'subtitle', 'summary', 'sections'],
  properties: {
    title: STR, subtitle: STR, summary: strs,
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'blocks'], properties: {
      title: STR,
      blocks: { type: 'array', items: { anyOf: [
        block('p', { text: STR }), block('h2', { text: STR }),
        block('bullets', { items: strs }), block('numbers', { items: strs }),
        block('chart', { chart: { type: 'object', additionalProperties: false, required: ['type', 'title', 'unit', 'data'], properties: {
          type: { type: 'string', enum: ['bar', 'pie', 'line'] }, title: STR, unit: STR,
          data: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'value'],
            properties: { label: STR, value: { type: 'number' } } } },
        } } }),
      ] } },
    } } },
  },
};

function parseJson<T>(text: string): T | null {
  const t = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(t.slice(a, z + 1)) as T; } catch { return null; }
}

/**
 * Réponse JSON de Claude, fiable :
 *  - schema fourni → sortie structurée de l'API (JSON valide garanti) ;
 *  - réponse coupée (max_tokens) → on relance avec 2× plus de place ;
 *  - JSON cassé (guillemet non échappé…) → Claude répare sa propre réponse.
 * Le 18/10 le dossier « gagner de l'argent avec Dzaryx » est mort sur « réponse non JSON ».
 */
export async function askJson<T>(system: string, user: string, maxTokens: number, schema?: object): Promise<T> {
  let max = maxTokens, last = '', why = '';
  const ask = async (content: string) => {
    const res = await anthropic.messages.stream({ model: MODEL, max_tokens: max, system,
      messages: [{ role: 'user', content }],
      ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}) } as never).finalMessage();
    if (res.stop_reason === 'refusal') throw new Error('demande refusée par l\'IA');
    return { text: res.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join(''), cut: res.stop_reason === 'max_tokens' };
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await ask(attempt && why === 'json' && !schema
      ? `${user}\n\nTa réponse précédente n'était pas du JSON valide (souvent un guillemet " non échappé dans un texte : écris « » à la place). Réponds UNIQUEMENT avec le JSON complet et valide.`
      : attempt && why === 'cut' ? `${user}\n\n(Sois un peu plus concis : ta réponse précédente était trop longue et a été coupée.)` : user);
    last = r.text;
    const out = r.cut ? null : parseJson<T>(r.text);
    if (out) return out;
    why = r.cut ? 'cut' : 'json';
    if (r.cut) max = Math.min(64_000, max * 2);
    console.warn(`[askJson] essai ${attempt + 1} : ${r.cut ? 'réponse coupée' : 'JSON invalide'} (${r.text.length} car.)`);
  }
  throw new Error(why === 'cut' ? 'réponse trop longue, coupée 3 fois' : `réponse non JSON : ${last.slice(0, 200)}`);
}

function cleanSpec(raw: DocSpec, fallbackTitle: string): DocSpec {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).map(s => ({
    title: str(s?.title).replace(/^\d+[.)]\s*/, ''),
    blocks: (Array.isArray(s?.blocks) ? s.blocks : []).flatMap((bl): Block[] => {
      if ((bl.type === 'p' || bl.type === 'h2') && str(bl.text)) return [{ type: bl.type, text: str(bl.text) }];
      if ((bl.type === 'bullets' || bl.type === 'numbers') && Array.isArray(bl.items)) {
        const items = bl.items.map(str).filter(Boolean);
        return items.length ? [{ type: bl.type, items }] : [];
      }
      if (bl.type === 'chart') {
        const chart = cleanChart(bl.chart);
        return chart ? [{ type: 'chart', chart }] : [];
      }
      return [];
    }),
  })).filter(s => s.title && s.blocks.length);
  return { title: str(raw.title) || fallbackTitle, subtitle: str(raw.subtitle) || undefined,
    summary: (Array.isArray(raw.summary) ? raw.summary : []).map(str).filter(Boolean), sections };
}

export async function writeDossier(title: string, brief: string, material: string): Promise<DocSpec> {
  const raw = await askJson<DocSpec>(WRITER_SYSTEM,
    `Titre souhaité : ${title}\nObjectif / public : ${brief || 'dossier de présentation'}\n\nFAITS À UTILISER (seule source autorisée) :\n${material}`, 32000, DOSSIER_SCHEMA);
  const spec = cleanSpec(raw, title);
  if (!spec.sections.length) throw new Error('aucune partie rédigée');
  return spec;
}

// ── Travail en arrière-plan + envoi du lien ─────────────────────────────────
const running = new Set<string>();

export function startDossierJob(title: string, make: () => Promise<DocSpec>): string {
  const key = title.toLowerCase();
  if (running.has(key)) return `⏳ Le dossier « ${title} » est déjà en préparation : le lien arrive sur Telegram et dans l'app dès qu'il est prêt.`;
  running.add(key);
  void (async () => {
    let msg: string;
    try {
      const spec = await make();
      const r = await renderProDoc(spec);
      const nCharts = spec.sections.reduce((n, s) => n + s.blocks.filter(bl => bl.type === 'chart').length, 0);
      msg = r.ok ? `📄 Ton dossier « ${spec.title} » est prêt (page de garde, résumé, sommaire, ${spec.sections.length} parties${nCharts ? `, ${nCharts} graphique${nCharts > 1 ? 's' : ''}` : ''}) :\n${r.url}` : r.error;
    } catch (err) {
      msg = `❌ Le dossier « ${title} » n'a pas pu être fait : ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      running.delete(key);
    }
    console.log('[pro-doc]', msg.replace(/\n/g, ' '));
    await queueTelegramMessage(msg).catch(() => {});
    emitProactive(msg.split('\n')[0]!.slice(0, 100), 'info', msg);
  })();
  return `⏳ Dossier « ${title} » en préparation (1 à 2 minutes) : page de garde avec le logo FIK, résumé, sommaire avec les pages, une partie par page. Le lien sera envoyé sur Telegram et dans l'app dès qu'il est prêt.`;
}

export function createPresentationDoc(input: Record<string, unknown>): string {
  const title = String(input['title'] ?? '').trim() || 'Dossier de présentation';
  const brief = String(input['brief'] ?? '').trim();
  const material = String(input['material'] ?? '').trim();
  if (material.length < 80) {
    return "❌ Il me faut la matière du dossier dans material : récupère d'abord les vraies infos avec les autres outils (ou demande-les à Kouider), puis rappelle create_presentation_doc.";
  }
  return startDossierJob(title, () => writeDossier(title, brief, material));
}
