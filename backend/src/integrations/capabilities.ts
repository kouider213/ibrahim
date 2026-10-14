import { Dzaryx_TOOLS } from './tools.js';
import { AGENT_REGISTRY } from '../agents/agent-registry.js';
import { createGoogleDoc, createGoogleSheet } from './google-docs.js';

// list_my_capabilities — la VRAIE liste des outils de Dzaryx, lue dans son code (tools.ts).
// Avec la recherche d'outils, le modèle ne voit qu'une partie de ses outils : sans ceci, il invente
// le nombre et oublie des fonctions quand Kouider demande « fais un document avec toutes tes capacités ».

// Ordre important : la première catégorie qui correspond gagne.
const CATEGORIES: Array<[string, RegExp]> = [
  ['PC à distance (Nexus)', /nexus/],
  ['Code, sites et serveurs', /^github_|railway|supabase_execute|netlify|code_task|new_project|site_file|health_check|site_analytics|set_site_hero/],
  ['Immobilier, ventes de véhicules et prospects', /propert|vehicles?_for_sale|vehicle_sale|vehicle_sold|vehicle_details|^list_packs|_pack|lead|prospect/],
  ['Images et vidéos', /image|video|subtitle|thumbnail|background|text_overlay|optimize_for|social_variants|voice|scenario|animate|photo/],
  ['Réservations, flotte et voitures', /booking|car|fleet|late_returns|voucher|contract|signature|vehicle|damage|pricing|delivery_fee|travel_time|rate_client/],
  ['Argent et comptabilité', /payment|revenue|financ|receipt|expense|accounting|export_excel|anomal|unpaid|client_deal|daily_report/],
  ['Clients', /client|_reviews?$|arrival_pattern/],
  ['Marketing et réseaux sociaux', /tiktok|social|competitor/],
  ['Mails, documents et tableaux', /email|gmail|google_doc|google_sheet|document/],
  ['Agenda, rappels et appels', /calendar|event|reminder|^call_me$|alarm|meeting|telegram|whatsapp/],
  ['Recherche et infos du monde', /web_search|fetch_url|weather|football|news|currency|browser|location/],
  ['Mémoire, apprentissage et missions', /memory|remember|recall|learn|rule|feedback|improvement|preference|conversation|private_mode|intention|mission|goal|task|procedure|habit|obsidian|capabilit/],
];

function categoryOf(name: string): string {
  for (const [label, re] of CATEGORIES) if (re.test(name)) return label;
  return 'Autres';
}

function shortDesc(desc: string | undefined): string {
  const first = (desc ?? '').split(/(?<=[.!?])\s|\n/)[0]!.trim();
  return first.length > 160 ? first.slice(0, 157) + '…' : first;
}

function grouped(): Array<[string, Array<{ name: string; desc: string }>]> {
  const groups = new Map<string, Array<{ name: string; desc: string }>>();
  for (const t of Dzaryx_TOOLS) {
    const cat = categoryOf(t.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push({ name: t.name, desc: shortDesc(t.description) });
  }
  return [...CATEGORIES.map(c => c[0]), 'Autres'].filter(c => groups.has(c)).map(c => [c, groups.get(c)!]);
}

const header = () => [
  'Nom : Dzaryx — assistant IA de Kouider (FIK Conciergerie, location de voitures à Oran).',
  `Nombre EXACT d'outils : ${Dzaryx_TOOLS.length} (liste lue dans le code, ne pas arrondir ni inventer).`,
  `Agents spécialisés (${AGENT_REGISTRY.length}) : ${AGENT_REGISTRY.map(a => a.name).join(', ')}.`,
];

// output = 'google_doc' / 'google_sheet' : le document est fait ICI, directement depuis la vraie liste —
// en quelques secondes, même pendant un appel (le modèle n'a pas à réécrire 200 lignes).
export async function listMyCapabilities(input: Record<string, unknown>): Promise<string> {
  const output = String(input['output'] ?? 'texte');
  const groups = grouped();
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Brussels' });

  if (output === 'google_sheet') {
    const rows: string[][] = [['Catégorie', 'Outil', 'Ce qu\'il fait']];
    for (const [cat, tools] of groups) for (const t of tools) rows.push([cat, t.name, t.desc]);
    const res = await createGoogleSheet({ title: `Dzaryx — ${Dzaryx_TOOLS.length} outils (${date})`, rows });
    return `${res}\n${header().slice(1).join('\n')}`;
  }

  const detailed = input['detail'] !== false || output === 'google_doc';
  const lines = [...header(), ''];
  for (const [cat, tools] of groups) {
    lines.push(output === 'google_doc' ? `${cat.toUpperCase()} (${tools.length})` : `## ${cat} (${tools.length})`);
    for (const t of tools) lines.push(detailed ? `- ${t.name} : ${t.desc}` : `- ${t.name}`);
    lines.push('');
  }
  if (output === 'google_doc') {
    lines[1] = `Nombre d'outils : ${Dzaryx_TOOLS.length}`;
    const res = await createGoogleDoc({ title: `Dzaryx — toutes mes capacités (${date})`, content: lines.join('\n') });
    return `${res}\n${header().slice(1).join('\n')}`;
  }
  lines.push("Pour un document : list_my_capabilities avec output='google_doc' ou 'google_sheet' le crée directement depuis cette liste.");
  return lines.join('\n');
}
