/**
 * Mémoire par le sens (2026-10-14) — retrouver « le client qui avait rayé la Clio » même si Kouider
 * ne dit pas les mêmes mots que ceux enregistrés.
 *
 * Chaque souvenir (memory_facts) et chaque message de conversation recherché reçoit une empreinte de sens
 * (embedding 256 dimensions, OpenAI text-embedding-3-small, Gemini en secours). Les empreintes sont gardées
 * dans app_kv (pas de changement de schéma Supabase) et recalculées seulement quand le texte change.
 * Tout est « au mieux » : si aucun fournisseur ne répond, les appelants gardent la recherche par mots-clés.
 */
import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { kvGet, kvSet } from './app-store.js';

const DIM = 256;
const FACTS_KEY = 'emb:facts:v1';
const CONV_KEY  = 'emb:conv:v1';
const CONV_MAX  = 3000;             // messages gardés dans l'index des conversations
const TIMEOUT_MS = 4000;

type Vec = number[];
// v = vecteur quantifié sur 8 bits puis base64 (256 octets → 344 caractères par empreinte)
type Index = Record<string, { h: string; v: string }>;

const hash = (t: string) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);
const pack = (v: Vec) => Buffer.from(Int8Array.from(v, x => Math.max(-127, Math.min(127, Math.round(x * 127)))).buffer).toString('base64');
const unpack = (s: string): Vec => normalize(Array.from(new Int8Array(Buffer.from(s, 'base64')), x => x / 127));

function normalize(v: Vec): Vec {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

export function cosine(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i]! * b[i]!;
  return s;
}

async function embedOpenAI(texts: string[]): Promise<Vec[] | null> {
  if (!env.OPENAI_API_KEY) return null;
  const { data } = await axios.post('https://api.openai.com/v1/embeddings',
    { model: 'text-embedding-3-small', input: texts, dimensions: DIM },
    { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, timeout: TIMEOUT_MS * 3 });
  return (data.data as Array<{ embedding: Vec; index: number }>)
    .sort((a, b) => a.index - b.index).map(d => normalize(d.embedding));
}

async function embedGemini(texts: string[]): Promise<Vec[] | null> {
  if (!env.GEMINI_API_KEY) return null;
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${env.GEMINI_API_KEY}`,
    { requests: texts.map(t => ({ model: 'models/gemini-embedding-001', content: { parts: [{ text: t }] }, outputDimensionality: DIM })) },
    { timeout: TIMEOUT_MS * 3 });
  return (data.embeddings as Array<{ values: Vec }>).map(e => normalize(e.values));
}

/** Empreintes de sens de plusieurs textes (par paquets de 96). null si aucun fournisseur disponible. */
export async function embed(texts: string[]): Promise<Vec[] | null> {
  if (!texts.length) return [];
  const out: Vec[] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const chunk = texts.slice(i, i + 96).map(t => t.slice(0, 2000) || ' ');
    let vecs: Vec[] | null = null;
    try { vecs = await embedOpenAI(chunk); } catch (e) { console.warn('[semantic] OpenAI:', (e as Error).message); }
    if (!vecs) {
      try { vecs = await embedGemini(chunk); } catch (e) { console.warn('[semantic] Gemini:', (e as Error).message); }
    }
    if (!vecs || vecs.length !== chunk.length) return null;
    out.push(...vecs);
  }
  return out;
}

export function semanticAvailable(): boolean {
  return !!(env.OPENAI_API_KEY || env.GEMINI_API_KEY);
}

// Index gardé en mémoire 5 min : évite de relire app_kv à chaque message
const memCache = new Map<string, { at: number; idx: Index }>();
async function loadIndex(key: string): Promise<Index> {
  const c = memCache.get(key);
  if (c && Date.now() - c.at < 5 * 60_000) return c.idx;
  let idx: Index = {};
  try { idx = JSON.parse((await kvGet(key)) ?? '{}') as Index; } catch { /* index vide */ }
  memCache.set(key, { at: Date.now(), idx });
  return idx;
}

/** Met à jour l'index pour ces éléments (id → texte) et renvoie les vecteurs. Recalcule seulement ce qui a changé. */
async function ensureIndexed(key: string, items: Array<{ id: string; text: string }>, max?: number): Promise<Index | null> {
  const idx = await loadIndex(key);
  const missing = items.filter(it => idx[it.id]?.h !== hash(it.text));
  if (missing.length) {
    const vecs = await embed(missing.map(m => m.text));
    if (!vecs) return Object.keys(idx).length ? idx : null;
    missing.forEach((m, i) => { idx[m.id] = { h: hash(m.text), v: pack(vecs[i]!) }; });
    if (max) {
      const keep = new Set(items.map(i => i.id));
      const ids = Object.keys(idx);
      if (ids.length > max) for (const id of ids.slice(0, ids.length - max)) if (!keep.has(id)) delete idx[id];
    }
    memCache.set(key, { at: Date.now(), idx });
    await kvSet(key, JSON.stringify(idx)).catch(e => console.warn('[semantic] save:', (e as Error).message));
  }
  return idx;
}

export interface Ranked<T> { item: T; score: number }

/** Classe des éléments par proximité de sens avec la requête. null = recherche par le sens indisponible. */
async function rank<T>(key: string, query: string, items: T[], idOf: (t: T) => string, textOf: (t: T) => string, max?: number): Promise<Ranked<T>[] | null> {
  if (!semanticAvailable() || !query.trim() || !items.length) return null;
  const [qv] = (await embed([query])) ?? [];
  if (!qv) return null;
  const idx = await ensureIndexed(key, items.map(t => ({ id: idOf(t), text: textOf(t) })), max);
  if (!idx) return null;
  return items
    .map(item => { const e = idx[idOf(item)]; return { item, score: e ? cosine(qv, unpack(e.v)) : 0 }; })
    .sort((a, b) => b.score - a.score);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]).catch(() => null);
}

/** Souvenirs (memory_facts) classés par le sens. Abandonne après `timeoutMs` pour ne jamais ralentir une réponse. */
export async function rankFacts<T extends { id: string; key: string; value: string; domain?: string }>(
  query: string, facts: T[], timeoutMs = TIMEOUT_MS,
): Promise<Ranked<T>[] | null> {
  return withTimeout(rank(FACTS_KEY, query, facts, f => f.id, f => `${f.domain ?? ''} ${f.key}: ${f.value}`), timeoutMs);
}

/** Messages de conversation classés par le sens (index plafonné à CONV_MAX messages). */
export async function rankMessages<T extends { id: string; content: string }>(
  query: string, rows: T[], timeoutMs = 20_000,
): Promise<Ranked<T>[] | null> {
  return withTimeout(rank(CONV_KEY, query, rows, r => String(r.id), r => r.content.slice(0, 1500), CONV_MAX), timeoutMs);
}
