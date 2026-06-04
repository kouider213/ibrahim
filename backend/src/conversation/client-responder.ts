// ──────────────────────────────────────────────────────────────────────────────
// Client Responder — Dzaryx qui répond aux CLIENTS (WhatsApp / chat public).
// Persona commercial Fik Conciergerie. NE révèle jamais d'infos internes
// (prix proprio, profit, marges). NE promet jamais la dispo d'une voiture :
// propose de vérifier + crée un lead. Peut donner prix client, infos, photos.
// ──────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import { executeTool } from '../integrations/tool-executor.js';
import { Dzaryx_TOOLS } from '../integrations/tools.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Outils SÛRS exposés au client (lecture + capture de lead uniquement).
const CLIENT_TOOL_NAMES = [
  'get_car_photo', 'get_property_photo', 'get_vehicle_sale_photo', 'record_lead',
];
const clientTools = Dzaryx_TOOLS.filter(t => CLIENT_TOOL_NAMES.includes(t.name));

function cur(c?: string | null): string { return c === 'EUR' ? '€' : 'DA'; }

// Construit un catalogue compact (sans prix proprio ni marge) injecté au prompt.
async function buildCatalog(): Promise<string> {
  const lines: string[] = [];
  try {
    const [{ data: cars }, { data: props }, { data: vfs }] = await Promise.all([
      supabase.from('cars').select('name, category, resale_price, currency, fuel, seats, transmission').order('name'),
      supabase.from('properties').select('title, city, district, transaction, price, currency, status, type, rooms').order('created_at', { ascending: false }).limit(30),
      supabase.from('vehicles_for_sale').select('brand, model, year, price, currency, status, mileage').order('created_at', { ascending: false }).limit(30),
    ]);

    if (cars?.length) {
      lines.push('VOITURES EN LOCATION (prix = prix client/jour) :');
      (cars as any[]).forEach(c => lines.push(`- ${c.name}${c.category ? ` (${c.category})` : ''} : ${c.resale_price != null ? Number(c.resale_price).toLocaleString('fr-FR') + ' ' + cur(c.currency) + '/jour' : 'prix sur demande'}${c.fuel ? ` · ${c.fuel}` : ''}${c.seats ? ` · ${c.seats} places` : ''}`));
    }
    const dispoProps = (props as any[] || []).filter(p => (p.status || 'disponible') === 'disponible');
    if (dispoProps.length) {
      lines.push('\nIMMOBILIER DISPONIBLE :');
      dispoProps.forEach(p => lines.push(`- ${p.title} — ${[p.district, p.city].filter(Boolean).join(', ')} · ${p.transaction === 'vente' ? 'à vendre' : 'à louer'} · ${p.price ? Number(p.price).toLocaleString('fr-FR') + ' ' + cur(p.currency) + (p.transaction === 'vente' ? '' : '/mois') : 'prix sur demande'}`));
    }
    const dispoVfs = (vfs as any[] || []).filter(v => (v.status || 'disponible') === 'disponible');
    if (dispoVfs.length) {
      lines.push('\nVOITURES À VENDRE :');
      dispoVfs.forEach(v => lines.push(`- ${v.brand} ${v.model}${v.year ? ` (${v.year})` : ''} · ${v.price ? Number(v.price).toLocaleString('fr-FR') + ' ' + cur(v.currency) : 'prix sur demande'}${v.mileage ? ` · ${Number(v.mileage).toLocaleString('fr-FR')} km` : ''}`));
    }
  } catch { /* catalogue best-effort */ }
  return lines.join('\n') || '(catalogue indisponible pour le moment)';
}

const CLIENT_SYSTEM = (catalog: string) => `Tu es l'assistant commercial de **Fik Conciergerie Oran** (conciergerie premium : location de voitures, vente de voitures, immobilier location/vente, à Oran, Algérie). Tu parles à un CLIENT sur WhatsApp.

TON : chaleureux, professionnel, concis, en français (ou en arabe darija si le client écrit en arabe). Emojis avec parcimonie. Pas de pavés. JAMAIS de tableaux markdown (WhatsApp ne les affiche pas) — utilise des listes simples avec des tirets « - ».

CE QUE TU PEUX FAIRE :
- Présenter les voitures, biens, voitures à vendre (depuis le CATALOGUE ci-dessous).
- Donner les prix CLIENT, les infos (carburant, places, ville, etc.).
- Envoyer des photos : appelle get_car_photo / get_property_photo / get_vehicle_sale_photo.
- Donner le contact / proposer WhatsApp pour finaliser.

RÈGLES ABSOLUES :
1. DISPONIBILITÉ VOITURE : ne dis JAMAIS qu'une voiture est "disponible" ou "réservable" tout de suite. Réponds : « Je transmets ta demande à un conseiller qui te confirme la disponibilité très vite 👌 ». Et DÈS que le client évoque une dispo, des dates, ou un intérêt sérieux pour louer → appelle record_lead IMMÉDIATEMENT (category=voiture_location, criteria = ce qu'on sait : voiture si connue + dates, client_name si connu sinon "Client WhatsApp", client_phone). Même si le modèle n'est pas encore choisi, capture le lead — un conseiller reprend ensuite.
2. Quand un client est intéressé (par une voiture, un bien, une vente), récupère son NOM (et téléphone si possible) et appelle record_lead avec la bonne category (voiture_location, immo_location, immo_vente, voiture_vente). Toujours capturer le lead.
3. NE révèle JAMAIS d'infos internes : prix propriétaire, marges, profits, noms des associés (Houari), données d'autres clients. Tu ne connais que les prix CLIENT.
4. Si tu ne sais pas / hors sujet : propose de transférer à l'équipe sur WhatsApp.
5. Ne confirme jamais une réservation toi-même : tu enregistres la demande, l'équipe confirme.

CATALOGUE ACTUEL :
${catalog}`;

export interface ClientReplyResult {
  reply: string;
  leadCreated: boolean;
}

export async function respondToClient(message: string, opts?: { clientPhone?: string; sessionId?: string }): Promise<ClientReplyResult> {
  const catalog = await buildCatalog();
  const sid = opts?.sessionId ?? `client_${opts?.clientPhone ?? 'web'}`;
  let leadCreated = false;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: opts?.clientPhone ? `[Téléphone client: ${opts.clientPhone}]\n${message}` : message },
  ];

  for (let round = 0; round < 4; round++) {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: CLIENT_SYSTEM(catalog),
      tools: clientTools,
      messages,
    });

    const toolUses = resp.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (toolUses.length === 0) {
      const text = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('').trim();
      return { reply: text || 'Je transmets ta demande à l\'équipe, on te répond très vite 👌', leadCreated };
    }

    messages.push({ role: 'assistant', content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === 'record_lead') leadCreated = true;
      let out = '';
      try { out = await executeTool(tu.name, tu.input as Record<string, unknown>, sid); }
      catch (e) { out = `Erreur: ${e instanceof Error ? e.message : String(e)}`; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return { reply: 'Je transmets ta demande à l\'équipe, on te répond très vite 👌', leadCreated };
}
