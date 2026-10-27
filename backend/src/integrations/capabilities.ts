import { Dzaryx_TOOLS } from './tools.js';
import { AGENT_REGISTRY } from '../agents/agent-registry.js';
import { createGoogleSheet } from './google-docs.js';
import { askJson, startDossierJob, type DocSpec, type Section } from './pro-doc.js';

// list_my_capabilities — la VRAIE liste des outils de Dzaryx, lue dans son code (tools.ts).
// Avec la recherche d'outils, le modèle ne voit qu'une partie de ses outils : sans ceci, il invente
// le nombre et oublie des fonctions quand Kouider demande « fais un document avec toutes tes capacités ».

// Ordre important : la première catégorie qui correspond gagne.
const CATEGORIES: Array<[string, RegExp]> = [
  ['Jarvis : protocoles, mémoire photo, anti-arnaque, réunions', /^protocol$|^photo_memory$|^anti_arnaque$|^meetings$/],
  ['Jarvis : gardien de nuit, négociateur, prédictions, rappels de lieu, escouade', /^gardien_nuit$|^negociateur$|^predictions$|^rappel_lieu$|^escouade$/],
  ['Jarvis : mémoire des gens, liste de nuit, avocat de poche, courriers, économies, prof perso, conseil des sages', /^memoire_gens$|^liste_nuit$|^avocat_de_poche$|^courrier_admin$|^economies$|^prof$|^conseil_sages$/],
  ['Jarvis : satellite, change des euros, opportunités, projets, vacances, rapport sur toi, fortune, santé', /^vue_satellite$|^change_euros$|^opportunites$|^projet$|^mode_vacances$|^rapport_moi$|^fortune$|^sante$/],
  ['Jarvis : auto-amélioration, radar concurrence, chasseur de voitures, commercial, atelier, usine à business, autonomie', /^auto_amelioration$|^radar_concurrence$|^chasseur_voitures$|^commercial$|^atelier$|^usine_business$|^autonomie$/],
  ['PC à distance (Nexus)', /nexus/],
  ['Code, sites et serveurs', /^github_|demo_site|railway|supabase_execute|netlify|code_task|new_project|site_file|health_check|site_analytics|set_site_hero/],
  ['Immobilier, ventes de véhicules et prospects', /propert|vehicles?_for_sale|vehicle_sale|vehicle_sold|vehicle_details|^list_packs|_pack|lead|prospect/],
  ['Images et vidéos', /image|video|subtitle|thumbnail|background|text_overlay|optimize_for|social_variants|voice|scenario|animate|photo/],
  ['Réservations, flotte et voitures', /booking|car|fleet|late_returns|voucher|contract|signature|vehicle|damage|pricing|delivery_fee|travel_time|rate_client/],
  ['Argent et comptabilité', /payment|revenue|financ|^gold_|receipt|expense|accounting|export_excel|anomal|unpaid|client_deal|daily_report/],
  ['Clients', /client|_reviews?$|arrival_pattern/],
  ['Marketing et réseaux sociaux', /tiktok|social|competitor/],
  ['Mails, documents et tableaux', /email|gmail|google_doc|google_sheet|document|presentation_doc/],
  ['Agenda, rappels et appels', /calendar|event|reminder|^call_me$|alarm|meeting|telegram|whatsapp|morning_routine|^travel$/],
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

export function grouped(): Array<[string, Array<{ name: string; desc: string }>]> {
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

  if (output === 'google_doc') return startDossierJob('Dzaryx — dossier de présentation', () => capabilitiesDossier(groups));
  const detailed = input['detail'] !== false;
  const lines = [...header(), ''];
  for (const [cat, tools] of groups) {
    lines.push(`## ${cat} (${tools.length})`);
    for (const t of tools) lines.push(detailed ? `- ${t.name} : ${t.desc}` : `- ${t.name}`);
    lines.push('');
  }
  lines.push("Pour un document : list_my_capabilities avec output='google_doc' ou 'google_sheet' le crée directement depuis cette liste.");
  return lines.join('\n');
}

// Dossier « capacités » : la liste des outils vient du code (rien d'oublié), Claude ne fait que la rédiger.
const CAT_SYSTEM = `Tu rédiges une partie d'un dossier de présentation de Dzaryx, l'assistant IA de FIK Conciergerie (location de voitures à Oran ; Kouider, le fondateur, vit à Bruxelles). Français impeccable, ton professionnel, vouvoiement du lecteur, pas d'émojis, pas de jargon technique (ni noms de fonctions, ni « API »).
Pour CHAQUE outil reçu, donne un nom lisible (2 à 5 mots) et une phrase claire qui dit ce qu'il apporte. Garde exactement les mêmes "name". N'invente aucune fonction.
Réponds UNIQUEMENT en JSON : {"intro": "paragraphe de 3 à 4 phrases sur ce domaine", "items": [{"name": "...", "label": "...", "phrase": "..."}]}`;

export async function capabilitiesDossier(groups: Array<[string, Array<{ name: string; desc: string }>]>): Promise<DocSpec> {
  const sections: Section[] = await Promise.all(groups.map(async ([cat, tools]): Promise<Section> => {
    let intro = '';
    const byName = new Map<string, { label: string; phrase: string }>();
    try {
      const r = await askJson<{ intro?: string; items?: Array<{ name?: string; label?: string; phrase?: string }> }>(CAT_SYSTEM,
        `Domaine : ${cat}\nOutils :\n${tools.map(t => `- ${t.name} : ${t.desc}`).join('\n')}`, 8000);
      intro = String(r.intro ?? '').trim();
      for (const it of r.items ?? []) if (it.name && it.label && it.phrase) byName.set(it.name, { label: it.label.trim(), phrase: it.phrase.trim() });
    } catch (err) {
      console.warn('[capabilities] rédaction', cat, err instanceof Error ? err.message : String(err));
    }
    return { title: `${cat} (${tools.length})`, blocks: [
      ...(intro ? [{ type: 'p' as const, text: intro }] : []),
      { type: 'bullets' as const, items: tools.map(t => {
        const w = byName.get(t.name);
        return w ? `**${w.label}** — ${w.phrase}` : `**${t.name.replace(/_/g, ' ')}** — ${t.desc}`;
      }) },
    ] };
  }));
  const total = groups.reduce((n, [, t]) => n + t.length, 0);
  const agents = AGENT_REGISTRY.map(a => a.name.replace(/^\P{L}+/u, '').trim());
  const summary = [
    `Dzaryx est l'assistant intelligent de **FIK Conciergerie**, la société de location de voitures et de conciergerie de Kouider à Oran. Il gère au quotidien les réservations, la flotte, les clients et l'argent, communique par l'application, par Telegram et au téléphone, et agit à distance sur le PC de Kouider.`,
    `Ce dossier présente l'ensemble de ses capacités : **${total} outils** répartis en **${groups.length} domaines**, mis en œuvre par **${agents.length} agents spécialisés** (${agents.join(', ')}). Chaque partie ci-après décrit un domaine : ce qu'il couvre, puis chacun de ses outils.`,
  ];
  return { title: 'Dzaryx — dossier de présentation', subtitle: "L'assistant intelligent de FIK Conciergerie", summary, sections };
}
