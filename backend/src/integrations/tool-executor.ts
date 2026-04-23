import { supabase } from './supabase.js';
import { getFinancialReport, formatFinancialReport } from './finance.js';
import { getFileContent, updateFile } from './github.js';
import { learnRule } from './claude-api.js';
import { getOranWeather } from './web-search.js';
import axios from 'axios';

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    switch (name) {
      case 'list_bookings':       return await listBookings(input);
      case 'update_booking':      return await updateBooking(input);
      case 'create_booking':      return await createBooking(input);
      case 'cancel_booking':      return await cancelBooking(input);
      case 'delete_booking':      return await deleteBooking(input);
      case 'get_financial_report':return await financialReport(input);
      case 'store_document':      return await storeDocument(input);
      case 'read_site_file':      return await readSiteFile(input);
      case 'update_site_file':    return await updateSiteFile(input);
      case 'learn_rule':          return await learnRuleTool(input);
      case 'remember_info':       return await rememberInfo(input);
      case 'recall_memory':       return await recallMemory(input);
      case 'get_weather':         return await getWeather(input);
      case 'get_news':            return await getNews(input);
      default:                    return `Outil inconnu: ${name}`;
    }
  } catch (err) {
    return `Erreur outil ${name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listBookings(input: Record<string, unknown>): Promise<string> {
  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, status, cars(name)')
    .order('start_date', { ascending: false })
    .limit(Number(input['limit'] ?? 20));

  if (input['status'])      query = query.eq('status', input['status'] as string);
  if (input['client_name']) query = query.ilike('client_name', `%${input['client_name']}%`);

  const { data, error } = await query;
  if (error) {
    // Fallback: query without join if there's a schema issue
    const { data: fallback, error: err2 } = await supabase
      .from('bookings')
      .select('id, client_name, client_phone, start_date, end_date, final_price, status')
      .order('start_date', { ascending: false })
      .limit(Number(input['limit'] ?? 20));
    if (err2) return `Erreur: ${err2.message}`;
    if (!fallback?.length) return 'Aucune réservation trouvée.';
    return `${fallback.length} réservation(s):\n${(fallback as unknown as Array<{
      id: string; client_name: string; start_date: string; end_date: string; final_price: number; status: string;
    }>).map(b => `- [${b.id}] ${b.client_name} | ${b.start_date} → ${b.end_date} | ${b.final_price}€ | ${b.status}`).join('\n')}`;
  }
  if (!data?.length) return 'Aucune réservation trouvée.';

  const rows = (data as unknown as Array<{
    id: string; client_name: string; client_phone?: string;
    start_date: string; end_date: string; final_price: number;
    status: string; cars?: { name: string };
  }>).map(b =>
    `- [${b.id}] ${b.client_name} | ${b.cars?.name ?? '?'} | ${b.start_date} → ${b.end_date} | ${b.final_price}€ | ${b.status}`,
  );

  return `${data.length} réservation(s):\n${rows.join('\n')}`;
}

async function updateBooking(input: Record<string, unknown>): Promise<string> {
  const { id, ...updates } = input as { id: string } & Record<string, unknown>;
  if (!id) return 'Erreur: id obligatoire';

  const { id: _i, ...safeUpdates } = updates;
  (safeUpdates as Record<string, unknown>)['updated_at'] = new Date().toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .update(safeUpdates)
    .eq('id', id)
    .select('id, client_name, start_date, end_date, status')
    .single();

  if (error) return `Erreur mise à jour: ${error.message}`;
  const b = data as { client_name: string; start_date: string; end_date: string; status: string };
  return `✅ Réservation ${id.slice(0,8)} mise à jour: ${b.client_name} | ${b.start_date} → ${b.end_date} | ${b.status}`;
}

async function createBooking(input: Record<string, unknown>): Promise<string> {
  const { car_id, client_name, client_phone, client_age, start_date, end_date, final_price, notes, rented_by } = input as {
    car_id: string; client_name: string; client_phone?: string; client_age: number;
    start_date: string; end_date: string; final_price: number;
    notes?: string; rented_by?: string;
  };

  const days = Math.ceil((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86_400_000);

  const { data, error } = await supabase.from('bookings').insert({
    car_id, client_name, client_phone, client_age, start_date, end_date,
    nb_days:               days,
    final_price,
    base_price_snapshot:   final_price,
    resale_price_snapshot: final_price,
    profit:                0,
    status:                'CONFIRMED',
    rented_by:             rented_by ?? 'Kouider',
    notes,
    whatsapp_sent: false,
    sms_sent:      false,
  }).select('id').single();

  if (error) return `Erreur création: ${error.message}`;
  return `✅ Réservation créée: ${client_name} | ${days} jours | ID: ${(data as { id: string }).id}`;
}

async function cancelBooking(input: Record<string, unknown>): Promise<string> {
  const { id } = input as { id: string };
  if (!id) return 'Erreur: id obligatoire';

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return `Erreur annulation: ${error.message}`;
  return `✅ Réservation ${id.slice(0,8)} annulée.`;
}

async function deleteBooking(input: Record<string, unknown>): Promise<string> {
  const { id } = input as { id: string };
  if (!id) return 'Erreur: id obligatoire';

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) return `Erreur suppression: ${error.message}`;
  return `✅ Réservation ${id.slice(0,8)} supprimée définitivement.`;
}

async function financialReport(input: Record<string, unknown>): Promise<string> {
  const year  = Number(input['year']  ?? new Date().getFullYear());
  const month = input['month'] ? Number(input['month']) : undefined;
  const report = await getFinancialReport(year, month);
  return formatFinancialReport(report);
}

async function storeDocument(input: Record<string, unknown>): Promise<string> {
  const { client_phone, client_name, booking_id, type, file_url, notes } = input as {
    client_phone: string; client_name: string; booking_id?: string;
    type: string; file_url: string; notes?: string;
  };

  const { error } = await supabase.from('client_documents').insert({
    client_phone, client_name, booking_id, type, file_url,
    storage_path: file_url,
    notes,
  });

  if (error) return `Erreur stockage: ${error.message}`;
  return `✅ Document ${type} enregistré pour ${client_name}`;
}

async function readSiteFile(input: Record<string, unknown>): Promise<string> {
  const { path } = input as { path: string };
  const file = await getFileContent(path);
  if (!file) return `Fichier introuvable: ${path}`;
  return `Contenu de ${path}:\n\`\`\`\n${file.content.slice(0, 3000)}\n\`\`\``;
}

async function updateSiteFile(input: Record<string, unknown>): Promise<string> {
  const { path, content, message } = input as { path: string; content: string; message?: string };
  const result = await updateFile(path, content, message ?? `Ibrahim: update ${path}`);
  if (!result) return `Échec GitHub update: ${path}`;
  return `✅ Site mis à jour: ${path} — commit ${result.commitSha} — Vercel redéploie.`;
}

async function learnRuleTool(input: Record<string, unknown>): Promise<string> {
  const { instruction } = input as { instruction: string };
  const rule = await learnRule(instruction);
  const { error } = await supabase.from('ibrahim_rules').insert({ ...rule, source: 'learned', active: true });
  if (error) return `Erreur mémorisation: ${error.message}`;
  return `✅ Règle mémorisée: "${rule.rule}"`;
}

async function rememberInfo(input: Record<string, unknown>): Promise<string> {
  const { content, category } = input as { content: string; category?: string };
  if (!content) return 'Erreur: content requis';
  const { error } = await supabase.from('ibrahim_memory').insert({
    content,
    category: category ?? 'general',
  });
  if (error) return `Erreur mémorisation: ${error.message}`;
  return `✅ Mémorisé: "${content}"`;
}

async function recallMemory(input: Record<string, unknown>): Promise<string> {
  const { query, category } = input as { query?: string; category?: string };
  let q = supabase
    .from('ibrahim_memory')
    .select('content, category, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (category) q = q.eq('category', category);
  if (query) q = q.ilike('content', `%${query}%`);
  const { data, error } = await q;
  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return 'Aucun souvenir trouvé.';
  return (data as Array<{ content: string; category: string; created_at: string }>)
    .map(m => `[${m.category}] ${m.content}`)
    .join('\n');
}

async function getWeather(input: Record<string, unknown>): Promise<string> {
  const { city, country } = input as { city?: string; country?: string };
  try {
    if (!city || city.toLowerCase() === 'oran') {
      const w = await getOranWeather();
      return `Météo Oran: ${w.icon} ${w.condition} — ${w.temperature}°C (ressenti ${w.apparent_temp}°C), humidité ${w.humidity}%, vent ${w.wind_speed} km/h`;
    }
    // Geocode the city
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`;
    const geo = await axios.get<{results?: Array<{latitude: number; longitude: number; name: string; country: string}>}>(geoUrl, { timeout: 5000 });
    const loc = geo.data.results?.[0];
    if (!loc) return `Ville introuvable: ${city}`;
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode,is_day&timezone=auto`;
    const wx = await axios.get<{current: {temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weathercode: number; is_day: number}}>(wxUrl, { timeout: 5000 });
    const c = wx.data.current;
    const codes: Record<number, string> = {0:'Ciel dégagé ☀️',1:'Principalement dégagé 🌤️',2:'Partiellement nuageux ⛅',3:'Couvert ☁️',45:'Brouillard 🌫️',51:'Bruine 🌦️',61:'Pluie légère 🌧️',63:'Pluie modérée 🌧️',65:'Forte pluie ⛈️',80:'Averses 🌦️',95:'Orage ⛈️'};
    const cond = codes[c.weathercode] ?? `Code météo ${c.weathercode}`;
    return `Météo ${loc.name}, ${country ?? loc.country}: ${cond} — ${Math.round(c.temperature_2m)}°C (ressenti ${Math.round(c.apparent_temperature)}°C), humidité ${c.relative_humidity_2m}%, vent ${Math.round(c.wind_speed_10m)} km/h`;
  } catch (err) {
    return `Erreur météo: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function getNews(input: Record<string, unknown>): Promise<string> {
  const { source } = input as { source?: string };
  try {
    const feeds = source === 'monde'
      ? [{ url: 'https://www.lemonde.fr/rss/une.xml', name: 'Le Monde' }]
      : [
          { url: 'https://www.echoroukonline.com/feed/', name: 'Echourouk' },
          { url: 'https://www.tsa-algerie.com/feed/', name: 'TSA' },
        ];
    const results = await Promise.allSettled(feeds.map(async f => {
      const r = await axios.get<string>(f.url, { timeout: 8000, headers: { 'User-Agent': 'Ibrahim/2.0' } });
      const items: string[] = [];
      const re = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = re.exec(r.data as string)) !== null && items.length < 4) {
        const t = (/<title><!\[CDATA\[(.*?)\]\]>/.exec(m[1]) ?? /<title>(.*?)<\/title>/.exec(m[1]))?.[1]?.trim().replace(/<[^>]+>/g,'') ?? '';
        if (t) items.push(`[${f.name}] ${t}`);
      }
      return items;
    }));
    const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    return all.length ? `Actualités:\n${all.join('\n')}` : 'Aucune actualité disponible.';
  } catch (err) {
    return `Erreur news: ${err instanceof Error ? err.message : String(err)}`;
  }
}
