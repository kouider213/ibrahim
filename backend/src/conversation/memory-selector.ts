import { supabase, getMemoryFacts, type MemoryFact } from '../integrations/supabase.js';

// 4 chars ≈ 1 token (mixed French/English/Arabic estimate)
const CHARS_PER_TOKEN = 4;

function scoreMemoryFact(fact: MemoryFact, query: string): number {
  const q = query.toLowerCase();
  let score = 0;

  // 1. Keyword overlap between query and fact key+value
  const queryWords = q.split(/[\s,.!?;:]+/).filter(w => w.length > 3);
  const factText   = `${fact.key} ${fact.value}`.toLowerCase();
  const overlap    = queryWords.filter(w => factText.includes(w)).length;
  score += overlap * 15;

  // 2. Domain relevance based on query intent
  if (/réservation|booking|location|voiture|client|tarif|prix|Houari|Fik/.test(q)   && fact.domain === 'business')    score += 20;
  if (/santé|vitamine|médecin|sport|médication|supplément/.test(q)                   && fact.domain === 'health')      score += 30;
  if (/famille|enfant|conjoint|parent|proche|anniversaire/.test(q)                   && fact.domain === 'family')      score += 30;
  if (/objectif|but|plan|stratégie|tiktok|vidéo|contenu/.test(q)                     && fact.domain === 'goal')        score += 25;
  if (/habitude|routine|matin|soir|réveil|café|vitamine|gym/.test(q)                 && fact.domain === 'habit')       score += 25;
  if (/qui|nom|où|profil|identité|Bruxelles|Oran|langue|parle/.test(q)               && fact.domain === 'identity')   score += 15;
  if (/dzaryx|nexus|assistant|Ibrahim/.test(q)                                        && fact.domain === 'business')   score += 10;
  if (/preference|style|réponse|format|rappel/.test(q)                               && fact.domain === 'preference') score += 20;

  // 3. Confidence bonus
  score += fact.confidence * 10;

  // 4. Freshness: recent updates score higher (max 20 pts, decays over 30 days)
  const daysSince = (Date.now() - new Date(fact.updated_at).getTime()) / 86_400_000;
  score += Math.max(0, 20 - daysSince * (20 / 30));

  // 5. Base priority for identity and business facts — always useful
  if (fact.domain === 'identity' || fact.domain === 'business') score += 8;

  return score;
}

export interface MemoryContextResult {
  entries:       Array<{ content: string; category: string }>;
  source:        'memory_facts' | 'ibrahim_memory' | 'empty';
  totalFacts:    number;
  selectedFacts: number;
  tokenEstimate: number;
}

export async function buildMemoryContext(
  userMessage: string,
  maxTokens = 300,
): Promise<MemoryContextResult> {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // ── Primary: memory_facts (L2 Semantic, scored) ───────────────
  try {
    const facts = await getMemoryFacts({ is_current: true, limit: 200 });

    if (facts.length > 0) {
      const scored = facts
        .map((f: MemoryFact) => ({ fact: f, score: scoreMemoryFact(f, userMessage) }))
        .sort((a, b) => b.score - a.score);

      const entries: Array<{ content: string; category: string }> = [];
      let usedChars = 0;

      for (const { fact } of scored) {
        const line = `[${fact.domain}] ${fact.key}: ${fact.value}`;
        if (usedChars + line.length + 1 > maxChars) continue; // skip if over budget
        entries.push({ content: `${fact.key}: ${fact.value}`, category: fact.domain });
        usedChars += line.length + 1;
      }

      const tokenEstimate = Math.round(usedChars / CHARS_PER_TOKEN);
      console.log(
        `[memory-engine] source=memory_facts total=${facts.length} selected=${entries.length} ~${tokenEstimate}tok budget=${maxTokens}tok`,
      );

      return {
        entries,
        source:        'memory_facts',
        totalFacts:    facts.length,
        selectedFacts: entries.length,
        tokenEstimate,
      };
    }
  } catch (err) {
    console.error('[memory-engine] memory_facts fetch failed, falling back:', (err as Error).message);
  }

  // ── Fallback: ibrahim_memory (legacy FIFO, budget-capped) ─────
  try {
    const { data } = await supabase
      .from('ibrahim_memory')
      .select('content, category')
      .order('created_at', { ascending: false })
      .limit(20);

    const raw = (data ?? []) as Array<{ content: string; category: string }>;
    const entries: Array<{ content: string; category: string }> = [];
    let usedChars = 0;

    for (const entry of raw) {
      const line = `[${entry.category}] ${entry.content}`;
      if (usedChars + line.length + 1 > maxChars) break;
      entries.push(entry);
      usedChars += line.length + 1;
    }

    const tokenEstimate = Math.round(usedChars / CHARS_PER_TOKEN);
    console.log(
      `[memory-engine] source=ibrahim_memory(fallback) total=${raw.length} selected=${entries.length} ~${tokenEstimate}tok budget=${maxTokens}tok`,
    );

    return {
      entries,
      source:        'ibrahim_memory',
      totalFacts:    raw.length,
      selectedFacts: entries.length,
      tokenEstimate,
    };
  } catch (err) {
    console.error('[memory-engine] fallback ibrahim_memory also failed:', (err as Error).message);
    return { entries: [], source: 'empty', totalFacts: 0, selectedFacts: 0, tokenEstimate: 0 };
  }
}
