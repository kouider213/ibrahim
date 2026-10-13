import axios from 'axios';
import { getRates } from './exchange-rates.js';

// Outils repris de J.A.R.V.I.S (techenclair.fr) et adaptés à Dzaryx : ils tournent sur le serveur,
// donc marchent depuis le téléphone, PC éteint (Jarvis, lui, ne tourne que sur le PC).

// ── Conversion de devises (EUR/USD ↔ DZD, officiel + marché parallèle) ──
export async function convertCurrency(input: Record<string, unknown>): Promise<string> {
  const amount = Number(input['amount']);
  const from = String(input['from'] ?? 'EUR').toUpperCase();
  const to   = String(input['to'] ?? 'DZD').toUpperCase();
  if (!(amount > 0)) return '❌ Montant invalide.';
  if (![from, to].every(c => ['EUR', 'USD', 'DZD'].includes(c)) || from === to) return '❌ Devises gérées : EUR, USD, DZD (deux devises différentes).';
  const r = await getRates();
  if (!r) return '❌ Taux de change indisponibles pour le moment.';

  // Valeur de 1 unité en DZD selon le marché
  const toDzd = (cur: string, market: 'official' | 'parallel'): number | null => {
    if (cur === 'DZD') return 1;
    const m = market === 'official' ? r.official : r.parallel;
    if (!m) return null;
    return cur === 'EUR' ? m.eur_to_dzd : m.usd_to_dzd;
  };
  const conv = (market: 'official' | 'parallel') => {
    const a = toDzd(from, market); const b = toDzd(to, market);
    return a && b ? amount * a / b : null;
  };
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: to === 'DZD' ? 0 : 2 });
  const off = conv('official'); const par = conv('parallel');
  return [
    `💱 ${amount.toLocaleString('fr-FR')} ${from} =`,
    off != null ? `• Taux officiel (banque) : ${fmt(off)} ${to}` : '',
    par != null ? `• Marché parallèle (square, ${r.parallel?.source}) : ${fmt(par)} ${to}` : '• Marché parallèle : pas de taux disponible (Kouider peut le saisir dans la page Devises)',
    `Taux : 1 EUR = ${r.official.eur_to_dzd} DZD officiel${r.parallel?.eur_to_dzd ? ` · ${r.parallel.eur_to_dzd} DZD parallèle` : ''}`,
  ].filter(Boolean).join('\n');
}

// ── Alertes météo 3 jours (orage, neige, fortes pluies, vent, canicule) ──
async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const { data } = await axios.get('https://geocoding-api.open-meteo.com/v1/search',
    { params: { name: city, count: 1, language: 'fr', format: 'json' }, timeout: 8_000 });
  const g = (data as { results?: Array<{ latitude: number; longitude: number; name: string; country?: string }> }).results?.[0];
  return g ? { lat: g.latitude, lon: g.longitude, name: `${g.name}${g.country ? `, ${g.country}` : ''}` } : null;
}

export async function weatherAlerts(input: Record<string, unknown>): Promise<string> {
  const city = String(input['city'] ?? '').trim() || 'Oran';
  const loc = city.toLowerCase() === 'oran' ? { lat: 35.6971, lon: -0.6308, name: 'Oran' } : await geocode(city);
  if (!loc) return `❌ Ville introuvable : ${city}`;
  const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
    params: { latitude: loc.lat, longitude: loc.lon, daily: 'weathercode,precipitation_sum,wind_speed_10m_max,temperature_2m_max', timezone: 'auto', forecast_days: 3 },
    timeout: 8_000,
  });
  const d = (data as { daily: { weathercode: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; temperature_2m_max: number[] } }).daily;
  const days = ['aujourd\'hui', 'demain', 'après-demain'];
  const alerts: string[] = [];
  d.weathercode.forEach((code, i) => {
    const day = days[i] ?? `J+${i}`;
    if ([95, 96, 99].includes(code)) alerts.push(`⛈️ Orage ${day}`);
    if ([71, 73, 75, 77, 85, 86].includes(code)) alerts.push(`❄️ Neige ${day}`);
    if ((d.precipitation_sum[i] ?? 0) > 20) alerts.push(`🌧️ Fortes pluies ${day} (${Math.round(d.precipitation_sum[i]!)} mm)`);
    if ((d.wind_speed_10m_max[i] ?? 0) > 60) alerts.push(`💨 Vent fort ${day} (${Math.round(d.wind_speed_10m_max[i]!)} km/h)`);
    if ((d.temperature_2m_max[i] ?? 0) >= 40) alerts.push(`🔥 Canicule ${day} (${Math.round(d.temperature_2m_max[i]!)}°C)`);
  });
  return alerts.length
    ? `⚠️ Alertes météo ${loc.name} (3 jours) :\n${alerts.map(a => `• ${a}`).join('\n')}`
    : `✅ Aucune alerte météo à ${loc.name} sur les 3 prochains jours.`;
}

// ── Football : dernier résultat + prochain match d'une équipe (TheSportsDB, gratuit) ──
const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const TEAM_ALIASES: Record<string, string> = {
  mco: 'MC Oran', 'mc oran': 'MC Oran', mouloudia: 'MC Oran', 'mouloudia oran': 'MC Oran',
  algerie: 'Algeria', 'algérie': 'Algeria', 'equipe d\'algerie': 'Algeria', 'les verts': 'Algeria',
  psg: 'Paris SG', 'paris': 'Paris SG', om: 'Marseille', real: 'Real Madrid', barca: 'Barcelona',
};

// Championnats pour le classement (ids TheSportsDB)
const LEAGUES: Record<string, { id: string; name: string }> = {
  'ligue 1': { id: '4334', name: 'Ligue 1' }, france: { id: '4334', name: 'Ligue 1' },
  'algerie': { id: '4753', name: 'Ligue 1 algérienne' }, 'algérie': { id: '4753', name: 'Ligue 1 algérienne' },
  'ligue 1 algerie': { id: '4753', name: 'Ligue 1 algérienne' }, 'ligue 1 algérienne': { id: '4753', name: 'Ligue 1 algérienne' },
  'premier league': { id: '4328', name: 'Premier League' }, angleterre: { id: '4328', name: 'Premier League' },
  liga: { id: '4335', name: 'Liga' }, espagne: { id: '4335', name: 'Liga' },
  bundesliga: { id: '4331', name: 'Bundesliga' }, allemagne: { id: '4331', name: 'Bundesliga' },
  'serie a': { id: '4332', name: 'Serie A' }, italie: { id: '4332', name: 'Serie A' },
};

async function leagueStandings(raw: string): Promise<string> {
  const lg = LEAGUES[raw.toLowerCase()];
  if (!lg) return `❌ Championnat non géré : ${raw}. Gérés : Ligue 1, Ligue 1 algérienne, Premier League, Liga, Bundesliga, Serie A.`;
  const { data: info } = await axios.get(`${SPORTSDB}/lookupleague.php`, { params: { id: lg.id }, timeout: 8_000 });
  const season = (info as { leagues?: Array<{ strCurrentSeason?: string }> }).leagues?.[0]?.strCurrentSeason;
  if (!season) return `❌ Saison en cours introuvable pour ${lg.name}.`;
  const { data } = await axios.get(`${SPORTSDB}/lookuptable.php`, { params: { l: lg.id, s: season }, timeout: 8_000 });
  type Row = { intRank: string; strTeam: string; intPoints: string; intPlayed: string; intGoalDifference: string };
  const table = (data as { table?: Row[] | null }).table ?? [];
  if (!table.length) return `Classement ${lg.name} ${season} pas encore disponible — utilise web_search.`;
  return [`🏆 Classement ${lg.name} ${season}${table.length <= 5 ? ' (top 5, base gratuite — web_search pour la suite)' : ''}`,
    ...table.slice(0, 10).map(r => `${r.intRank}. ${r.strTeam} — ${r.intPoints} pts (${r.intPlayed} J, diff ${Number(r.intGoalDifference) > 0 ? '+' : ''}${r.intGoalDifference})`),
  ].join('\n');
}

export async function footballScores(input: Record<string, unknown>): Promise<string> {
  const league = String(input['league'] ?? '').trim();
  const raw = String(input['team'] ?? '').trim();
  if (league && !raw) return leagueStandings(league);
  if (!raw) return '❌ Nom de l\'équipe ou du championnat requis.';
  const team = TEAM_ALIASES[raw.toLowerCase()] ?? raw;
  const { data } = await axios.get(`${SPORTSDB}/searchteams.php`, { params: { t: team }, timeout: 8_000 });
  const t = (data as { teams?: Array<{ idTeam: string; strTeam: string }> | null }).teams?.[0];
  if (!t) return `❌ Équipe introuvable : ${raw}`;
  type Ev = { dateEvent: string; strTime?: string; strHomeTeam: string; strAwayTeam: string; intHomeScore: string | null; intAwayScore: string | null; strLeague?: string };
  const [last, next] = await Promise.all([
    axios.get(`${SPORTSDB}/eventslast.php`, { params: { id: t.idTeam }, timeout: 8_000 }).then(r => (r.data as { results?: Ev[] }).results ?? []).catch(() => [] as Ev[]),
    axios.get(`${SPORTSDB}/eventsnext.php`, { params: { id: t.idTeam }, timeout: 8_000 }).then(r => (r.data as { events?: Ev[] }).events ?? []).catch(() => [] as Ev[]),
  ]);
  const lines = [`⚽ ${t.strTeam}`];
  const l = last[0];
  if (l) lines.push(`• Dernier match (${l.dateEvent}) : ${l.strHomeTeam} ${l.intHomeScore ?? '?'} - ${l.intAwayScore ?? '?'} ${l.strAwayTeam}${l.strLeague ? ` · ${l.strLeague}` : ''}`);
  const n = next[0];
  if (n) lines.push(`• Prochain match : ${n.strHomeTeam} - ${n.strAwayTeam}, le ${n.dateEvent}${n.strTime ? ` à ${n.strTime.slice(0, 5)} (UTC)` : ''}${n.strLeague ? ` · ${n.strLeague}` : ''}`);
  if (!l && !n) lines.push('Pas de match récent ou à venir dans la base gratuite — utilise web_search pour plus de détails.');
  return lines.join('\n');
}
