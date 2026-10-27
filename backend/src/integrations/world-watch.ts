/**
 * LE MONDE AUTOUR DE KOUIDER (27/10/2026) :
 *  - vue_satellite : « montre-moi le parking de l'aéroport d'Oran » → vue satellite (Esri World Imagery, gratuite) +
 *    Street View si dispo (Google) + météo + temps de trajet depuis sa position, envoyés sur Telegram.
 *  - change_euros : meilleur moment pour changer ses euros au square — historique quotidien (app_kv `square:history`),
 *    alerte quand le taux est au plus haut depuis 3 semaines ou fait un bond.
 *  - opportunites : chasseur d'opportunités — ventes aux enchères de véhicules (saisies, domaines), appels d'offres,
 *    salons, à Oran / en Algérie et à Bruxelles ; chaque semaine, seulement les NOUVELLES (app_kv `opps:seen`).
 */
import { kvJson, kvPut, tg, research, extractJson } from './ai-util.js';

// ── Satellite ────────────────────────────────────────────────────────────────
async function place(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (/^(ici|ma position|o[uù] je suis)$/i.test(q.trim())) {
    const { getLocation } = await import('./location.js');
    const l = await getLocation('kouider').catch(() => null);
    return l ? { lat: l.lat, lng: l.lng, label: 'ta position' } : null;
  }
  if (key) {
    const j = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&language=fr&key=${key}`).then(r => r.json()).catch(() => ({})) as { results?: Array<{ name: string; formatted_address?: string; geometry: { location: { lat: number; lng: number } } }> };
    const r = j.results?.[0];
    if (r) return { ...r.geometry.location, label: `${r.name}${r.formatted_address ? `, ${r.formatted_address}` : ''}` };
  }
  const { geocode } = await import('./departures.js');
  const g = await geocode(q).catch(() => null);
  return g ? { ...g, label: q } : null;
}

export async function satelliteTool(input: Record<string, unknown>): Promise<string> {
  const q = String(input['place'] ?? '').trim();
  if (!q) return '❌ Quel endroit ?';
  const p = await place(q);
  if (!p) return `❌ Je ne trouve pas « ${q} » sur la carte.`;
  const zoom = Math.min(Math.max(Number(input['zoom']) || 2, 1), 4);   // 1 = très près … 4 = quartier
  const d = [0, 0.0015, 0.004, 0.01, 0.025][zoom]!;
  const k = 1 / Math.cos(p.lat * Math.PI / 180);
  const bbox = `${p.lng - d * k * 1.33},${p.lat - d},${p.lng + d * k * 1.33},${p.lat + d}`;
  const sat = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=1000,750&format=jpg&f=image`, { signal: AbortSignal.timeout(20_000) })
    .then(async r => r.ok && /image/.test(r.headers.get('content-type') ?? '') ? Buffer.from(await r.arrayBuffer()).toString('base64') : null).catch(() => null);
  const out: string[] = [];
  if (sat) { await tg(`🛰️ Vue satellite — ${p.label}`, sat); out.push('🛰️ vue satellite'); }
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (key) {
    const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${p.lat},${p.lng}&radius=150&key=${key}`).then(r => r.json()).catch(() => ({})) as { status?: string; date?: string };
    if (meta.status === 'OK') {
      const sv = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=800x500&location=${p.lat},${p.lng}&radius=150&key=${key}`).then(async r => Buffer.from(await r.arrayBuffer()).toString('base64')).catch(() => null);
      if (sv) { await tg(`🚶 Street View — ${p.label}${meta.date ? ` (photo de ${meta.date})` : ''}`, sv); out.push('🚶 vue de la rue'); }
    }
  }
  const { executeTool } = await import('./tool-executor.js');
  const [weather, travel] = await Promise.all([
    executeTool('get_weather', { city: p.label.split(',').slice(-2).join(',').trim() || q }, 'satellite').catch(() => ''),
    executeTool('get_travel_time', { destination: `${p.lat},${p.lng}` }, 'satellite').catch(() => ''),
  ]);
  let wx = '';
  try { const w = JSON.parse(weather) as { temperature?: number; condition?: string; icon?: string; city?: string }; if (w.temperature !== undefined) wx = `${w.icon ?? '🌤️'} ${w.city ?? ''} : ${Math.round(w.temperature)} °C, ${String(w.condition ?? '').toLowerCase()}`; } catch { if (weather && !/❌/.test(weather)) wx = `🌤️ ${weather.slice(0, 160)}`; }
  // Trajet seulement s'il est près (pas « 1 948 min » depuis Bruxelles)
  const dist = Number((/Distance:\s*\**([\d.,]+)\s*km/i.exec(travel)?.[1] ?? '0').replace(',', '.'));
  const trip = travel && !/❌/.test(travel) && dist > 0 && dist < 300 ? `\n🚗 ${travel.replace(/\*\*/g, '').split('\n').slice(0, 3).join(' · ').slice(0, 200)}` : '';
  return `📍 ${p.label}\n${out.length ? `Envoyé sur ton Telegram : ${out.join(' + ')}.` : '⚠️ Pas d\'image disponible pour cet endroit.'}\n🗺️ https://www.google.com/maps/@${p.lat},${p.lng},18z/data=!3m1!1e3`
    + (wx ? `\n${wx}` : '') + trip;
}

// ── Change des euros au square ───────────────────────────────────────────────
interface Point { date: string; rate: number }

async function squareNow(): Promise<number | null> {
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  if (g?.eurDzd) return g.eurDzd;
  const r = await import('./exchange-rates.js').then(m => m.getRates()).catch(() => null) as { parallel?: { eur_to_dzd?: number } } | null;
  return r?.parallel?.eur_to_dzd ?? null;
}

export async function euroTool(input: Record<string, unknown>): Promise<string> {
  const rate = await squareNow();
  const h = await kvJson<Point[]>('square:history', []);
  if (!rate) return '❌ Taux du square indisponible pour le moment.';
  const last21 = h.filter(p => Date.parse(p.date) > Date.now() - 21 * 86_400_000).map(p => p.rate);
  const max = Math.max(...last21, rate), min = Math.min(...last21, rate);
  const amount = Number(String(input['amount'] ?? '').replace(/[^\d.]/g, '')) || 0;
  const pos = max > min ? Math.round(((rate - min) / (max - min)) * 100) : 50;
  return `💶 Square aujourd'hui : 1 € = ${Math.round(rate)} DA${last21.length >= 3 ? `\nSur 3 semaines : de ${Math.round(min)} à ${Math.round(max)} DA → tu es à ${pos} % du plus haut.` : '\n(Je commence l\'historique : comparaison possible dans quelques jours.)'}`
    + (amount ? `\n${amount} € = ${Math.round(amount * rate).toLocaleString('fr-FR')} DA` : '')
    + (last21.length >= 5 ? `\n👉 ${pos >= 85 ? 'BON moment pour changer.' : pos <= 30 ? 'Mauvais moment : attends si tu peux.' : 'Moment moyen.'}` : '');
}

/** Tous les jours 10h et 17h : on note le taux ; plus haut depuis 3 semaines (ou +2 % en 3 jours) → alerte. */
export async function jobEuroWatch(): Promise<string> {
  const rate = await squareNow();
  if (!rate) return 'pas de taux';
  const h = await kvJson<Point[]>('square:history', []);
  const date = new Date().toISOString().slice(0, 10);
  const prev = h.filter(p => p.date !== date);
  await kvPut('square:history', [...prev, { date, rate }].slice(-120));
  const last21 = prev.filter(p => Date.parse(p.date) > Date.now() - 21 * 86_400_000);
  const alerted = await kvJson<string>('square:alerted', '');
  if (last21.length < 7 || alerted === date) return `noté ${rate}`;
  const max = Math.max(...last21.map(p => p.rate));
  const d3 = prev.find(p => Date.parse(p.date) <= Date.now() - 3 * 86_400_000 && Date.parse(p.date) > Date.now() - 5 * 86_400_000);
  if (rate > max || (d3 && rate >= d3.rate * 1.02)) {
    await kvPut('square:alerted', date, 2 * 86_400);
    await tg(`💶 Bon moment pour changer tes euros : 1 € = ${Math.round(rate)} DA au square${rate > max ? `, le plus haut depuis 3 semaines (avant : ${Math.round(max)})` : `, +${Math.round((rate / d3!.rate - 1) * 100)} % en 3 jours`}.\n1 000 € = ${Math.round(1000 * rate).toLocaleString('fr-FR')} DA.`);
    return 'alerte';
  }
  return `noté ${rate}`;
}

// ── Chasseur d'opportunités ──────────────────────────────────────────────────
interface Opp { title: string; where: string; when: string; why: string; link: string }

export async function huntOpportunities(focus = ''): Promise<Opp[]> {
  const raw = await research(`Tu es le chasseur d'opportunités de Kouider (FIK Conciergerie : location et vente de voitures à Oran, immobilier Oran, sites web ; il vit à Bruxelles).
Cherche sur le web les opportunités CONCRÈTES et À VENIR (dates futures) ${focus ? `sur : ${focus}` : 'parmi : ventes aux enchères de véhicules en Algérie (domaines, saisies douane, entreprises publiques, Oran en priorité), enchères de véhicules en Belgique (Finances / domaines), appels d\'offres de location de véhicules ou de transport à Oran, salons auto / immobilier / diaspora à Oran, Alger et Bruxelles'}.
Garde seulement ce qui a une date, un lieu et une source. Réponds à la fin UNIQUEMENT avec ce JSON :
{"opps":[{"title":"","where":"","when":"date","why":"ce que ça peut rapporter à Kouider","link":"url source"}]}`, { rounds: 7, sessionId: 'opps' });
  return ((await extractJson<{ opps?: Opp[] }>(raw, '{"opps":[{"title":"","where":"","when":"","why":"","link":""}]}'))?.opps ?? []).filter(o => o.title && o.link);
}

export async function opportunitiesTool(input: Record<string, unknown>): Promise<string> {
  const opps = await huntOpportunities(String(input['focus'] ?? ''));
  return opps.length ? `🎯 Opportunités trouvées :\n${opps.map(o => `• ${o.title} — ${o.where}, ${o.when}\n  💡 ${o.why}\n  🔗 ${o.link}`).join('\n')}` : 'Rien de concret et daté trouvé pour le moment.';
}

/** Lundi 8h30 : seulement les nouvelles. */
export async function jobOpportunities(): Promise<string> {
  const opps = await huntOpportunities();
  const seen = await kvJson<string[]>('opps:seen', []);
  const fresh = opps.filter(o => !seen.includes(o.link));
  await kvPut('opps:seen', [...seen, ...fresh.map(o => o.link)].slice(-300));
  if (fresh.length) await tg(`🎯 Nouvelles opportunités de la semaine :\n${fresh.map(o => `• ${o.title} — ${o.where}, ${o.when}\n  💡 ${o.why}\n  🔗 ${o.link}`).join('\n')}`);
  return `${fresh.length} nouvelle(s)`;
}
