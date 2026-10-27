/**
 * CHASSEURS DU MARCHÉ (27/10/2026) — par la recherche web de Dzaryx (annonces trouvées par le moteur de recherche, avec
 * leur lien ; pas d'aspiration de sites) :
 *  - radar_concurrence : prix de location des autres agences à Oran (sites, Facebook, Ouedkniss) comparés aux prix FIK
 *    au square → alerte si quelqu'un est nettement moins cher sur la même catégorie, avec la riposte proposée.
 *    Tous les jours 9h. Résumé gardé pour le détecteur de bluff du souffleur (app_kv `radar:summary`).
 *  - chasseur_voitures : voitures d'occasion à vendre en Algérie (Oran d'abord) sous le prix du marché, et ce que chacune
 *    rapporterait en location chez FIK (prix/jour d'un modèle équivalent × taux d'occupation réel) → mois pour la rembourser.
 *    Mercredi 9h30 + à la demande.
 */
import { kvJson, kvPut, tg, research, extractJson } from './ai-util.js';
import { supabase } from './supabase.js';

async function fleet(): Promise<{ text: string; cars: Array<{ name: string; category: string; price: number }>; occupancy: number; rate: number }> {
  const [{ data: cars }, { data: books }] = await Promise.all([
    supabase.from('cars').select('id, name, category, resale_price'),
    supabase.from('bookings').select('car_id, start_date, end_date, status').gte('end_date', new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  const list = ((cars ?? []) as Array<{ name: string; category: string; resale_price: number }>).map(c => ({ name: c.name, category: c.category ?? '', price: Number(c.resale_price) }));
  const rented = ((books ?? []) as Array<{ start_date: string; end_date: string; status: string }>).filter(b => !/REJECT|CANCEL/i.test(b.status))
    .reduce((s, b) => s + Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000)), 0);
  const occupancy = list.length ? Math.min(0.9, rented / (list.length * 90)) : 0;
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const rate = g?.eurDzd ?? 260;
  return { text: list.map(c => `${c.name} (${c.category}) : ${c.price} €/j ≈ ${Math.round(c.price * rate)} DA/j`).join('\n'), cars: list, occupancy, rate };
}

// ── Radar de la concurrence ──────────────────────────────────────────────────
interface Comp { agency: string; car: string; price_da: number; caution?: string; source: string }

export async function radarScan(): Promise<{ comps: Comp[]; text: string }> {
  const f = await fleet();
  const raw = await research(`Tu es le radar de la concurrence de FIK Conciergerie (location de voitures à Oran, sans caution).
Cherche sur le web (5 recherches maximum, va vite) les prix ACTUELS de location de voitures à Oran chez les autres agences (leurs sites, pages Facebook, annonces Ouedkniss visibles dans les résultats de recherche, comparateurs). Note pour chaque offre : agence, voiture, prix par jour en DA (convertis si en €), caution demandée, lien.
Nos prix FIK (1 € = ${Math.round(f.rate)} DA au square) :\n${f.text}
Puis compare : sur quelles voitures / catégories une agence est NETTEMENT moins chère (> 15 %) que FIK, et où FIK est le moins cher. Pense à l'argument « sans caution » de FIK.
Un prix « à partir de / dès » compte (mets car = « dès » + catégorie si le modèle n'est pas dit).
Termine par ce JSON : {"comps":[{"agency":"","car":"","price_da":0,"caution":"","source":"url"}],"summary":"5 lignes : où FIK est cher, où FIK est bien placé, la riposte conseillée (sans casser les prix)"}`, { rounds: 6, sessionId: 'radar' });
  const o = await extractJson<{ comps?: Comp[]; summary?: string }>(raw, '{"comps":[{"agency":"","car":"","price_da":0,"caution":"","source":"url"}],"summary":"5 lignes"}') ?? {};
  const comps = (o.comps ?? []).filter(c => c.agency && c.price_da > 0);
  const summary = String(o.summary ?? '').trim();
  if (comps.length) await kvPut('radar:last', { at: new Date().toISOString(), comps, summary }, 30 * 86_400);
  if (summary) {
    const { kvSet } = await import('./app-store.js');
    await kvSet('radar:summary', `${comps.slice(0, 12).map(c => `${c.agency} ${c.car} ${c.price_da} DA/j`).join(' ; ')}. ${summary}`.slice(0, 900), 30 * 86_400);
  }
  return { comps, text: summary || raw.slice(0, 1500) };
}

export async function radarTool(): Promise<string> {
  const r = await radarScan();
  return `📡 Radar de la concurrence à Oran :\n${r.comps.slice(0, 12).map(c => `• ${c.agency} — ${c.car} : ${c.price_da.toLocaleString('fr-FR')} DA/j${c.caution ? ` (caution ${c.caution})` : ''}\n  🔗 ${c.source}`).join('\n') || '(aucun prix trouvé)'}\n\n${r.text}`;
}

/** 9h : alerte seulement si quelque chose a changé (nouvelle agence moins chère). */
export async function jobRadar(): Promise<string> {
  const before = await kvJson<{ comps?: Comp[] } | null>('radar:last', null);
  const r = await radarScan();
  const key = (c: Comp) => `${c.agency}|${c.car}|${Math.round(c.price_da / 500)}`;
  const known = new Set((before?.comps ?? []).map(key));
  const f = await fleet();
  const cheaper = r.comps.filter(c => !known.has(key(c)) && f.cars.some(x => c.car.toLowerCase().includes(x.name.split(' ')[0]!.toLowerCase()) && c.price_da < x.price * f.rate * 0.85));
  if (cheaper.length) await tg(`📡 Radar : ${cheaper.length} offre(s) nettement moins chère(s) que FIK à Oran :\n${cheaper.map(c => `• ${c.agency} — ${c.car} à ${c.price_da.toLocaleString('fr-FR')} DA/j${c.caution ? ` (caution ${c.caution})` : ''}\n  🔗 ${c.source}`).join('\n')}\n\n💡 ${r.text}`);
  return `${r.comps.length} prix, ${cheaper.length} alerte(s)`;
}

// ── Chasseur de voitures à acheter ───────────────────────────────────────────
interface Deal { car: string; year: string; km: string; price_da: number; market_da: number; where: string; source: string }

export async function carHunterTool(input: Record<string, unknown>): Promise<string> {
  const f = await fleet();
  const budget = Number(String(input['budget_da'] ?? '').replace(/\D/g, '')) || 0;
  const models = String(input['models'] ?? '').trim();
  const raw = await research(`Tu es le chasseur de voitures de FIK Conciergerie (location à Oran). Cherche sur le web des voitures d'occasion À VENDRE en ce moment en Algérie (Oran en priorité, puis ouest algérien) ${models ? `: ${models}` : 'qui se louent bien (citadines, SUV compacts, 7 places : Clio, i10, Sandero, Duster, Jogger, Creta, Berlingo…)'}${budget ? `, budget max ${budget.toLocaleString('fr-FR')} DA` : ''}.
Garde celles dont le prix est SOUS le prix du marché (compare à d'autres annonces du même modèle / année / km). Pour chacune : modèle, année, km, prix demandé, prix du marché estimé, ville, lien de l'annonce.
Termine par ce JSON : {"deals":[{"car":"","year":"","km":"","price_da":0,"market_da":0,"where":"","source":"url"}]}`, { rounds: 7, sessionId: 'carhunter' });
  const deals = ((await extractJson<{ deals?: Deal[] }>(raw, '{"deals":[{"car":"","year":"","km":"","price_da":0,"market_da":0,"where":"","source":"url"}]}'))?.deals ?? []).filter(d => d.price_da > 0 && d.source);
  if (!deals.length) return '🚘 Pas de bonne affaire claire trouvée pour le moment (annonces visibles via la recherche web).';
  const occ = f.occupancy > 0.05 ? f.occupancy : 0.4;
  const lines = deals.slice(0, 8).map(d => {
    const twin = f.cars.find(c => d.car.toLowerCase().includes(c.name.split(' ')[0]!.toLowerCase()) || c.name.toLowerCase().includes(d.car.split(' ')[0]!.toLowerCase()));
    const dayDa = twin ? twin.price * f.rate : 0;
    const monthNet = dayDa * 30 * occ * 0.85;   // −15 % : entretien, assurance, lavage
    const payback = monthNet > 0 ? Math.ceil(d.price_da / monthNet) : 0;
    return `• ${d.car} ${d.year} — ${d.km} — ${d.price_da.toLocaleString('fr-FR')} DA${d.market_da ? ` (marché ≈ ${d.market_da.toLocaleString('fr-FR')}, −${Math.max(0, Math.round((1 - d.price_da / d.market_da) * 100))} %)` : ''} — ${d.where}\n`
      + (twin ? `  💶 En location comme ta ${twin.name} (${twin.price} €/j, occupation ${Math.round(occ * 100)} %) : ≈ ${Math.round(monthNet).toLocaleString('fr-FR')} DA/mois → remboursée en ≈ ${payback} mois\n` : '  (pas de modèle équivalent dans ta flotte pour estimer)\n')
      + `  🔗 ${d.source}`;
  });
  return `🚘 Bonnes affaires trouvées :\n${lines.join('\n')}\n\n⚠️ À vérifier avant tout achat : papiers, carte grise, état réel (fais-la voir par Houari ou un mécanicien). Je peux négocier le prix pour toi (négociateur).`;
}

export async function jobCarHunter(): Promise<string> {
  const t = await carHunterTool({});
  if (!/Pas de bonne affaire/.test(t)) await tg(t);
  return 'ok';
}
