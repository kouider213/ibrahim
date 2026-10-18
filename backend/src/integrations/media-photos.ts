// Photos des annonces (voitures du parc, biens immobiliers, voitures à vendre) : une seule logique
// pour l'app (galerie, envoi Telegram) et pour Dzaryx (outil send_photos).
// Tables : car_photos / property_photos / vehicle_sale_photos (ordre = position) + image_url = photo principale du site.
import { supabase } from './supabase.js';
import { queueTelegramAlbum } from '../notifications/tg-outbox.js';

export type MediaKind = 'car' | 'property' | 'sale';

export interface MediaTarget { kind: MediaKind; id: string; name: string; cover: string | null; urls: string[] }

const CFG = {
  car:      { table: 'cars',              photos: 'car_photos',          fk: 'car_id',      cols: 'id, name, image_url' },
  property: { table: 'properties',        photos: 'property_photos',     fk: 'property_id', cols: 'id, title, name, district, city, image_url' },
  sale:     { table: 'vehicles_for_sale', photos: 'vehicle_sale_photos', fk: 'vehicle_id',  cols: 'id, brand, model, year, image_url' },
} as const;

type Row = { id: string; image_url?: string | null; name?: string | null; title?: string | null; district?: string | null; city?: string | null; brand?: string | null; model?: string | null; year?: number | null };

function label(kind: MediaKind, r: Row): string {
  if (kind === 'car') return r.name ?? 'Voiture';
  if (kind === 'property') return r.title || r.name || [r.district, r.city].filter(Boolean).join(', ') || 'Bien';
  return [r.brand, r.model, r.year].filter(Boolean).join(' ') || 'Voiture à vendre';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Retrouve l'annonce par id exact ou par nom (le plus précis gagne). */
export async function resolveMedia(kind: MediaKind, idOrName: string): Promise<MediaTarget | null> {
  const c = CFG[kind];
  const q = idOrName.trim();
  let row: Row | null = null;
  if (/^[0-9a-f-]{36}$/i.test(q)) {
    const { data } = await supabase.from(c.table).select(c.cols).eq('id', q).maybeSingle();
    row = (data as unknown as Row | null) ?? null;
  } else {
    const { data } = await supabase.from(c.table).select(c.cols);
    const rows = (data ?? []) as unknown as Row[];
    const n = norm(q);
    const scored = rows.map(r => {
      const l = norm(label(kind, r));
      const score = l === n ? 1000 : l.includes(n) ? 500 + n.length : n.includes(l) ? 400 + l.length
        : n.split(/\s+/).filter(t => t.length >= 2 && l.includes(t)).length * 10;
      return { r, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    row = scored[0]?.r ?? null;
  }
  if (!row) return null;
  const { data: ph } = await supabase.from(c.photos).select('url, position').eq(c.fk, row.id).order('position', { ascending: true });
  const urls = ((ph ?? []) as { url: string }[]).map(p => p.url).filter(Boolean);
  if (row.image_url && !urls.includes(row.image_url)) urls.unshift(row.image_url);
  return { kind, id: row.id, name: label(kind, row), cover: row.image_url ?? null, urls };
}

/** Supprime une photo ; si c'était la photo principale, la suivante prend sa place. */
export async function deleteMediaPhoto(kind: MediaKind, id: string, url: string): Promise<void> {
  const c = CFG[kind];
  await supabase.from(c.photos).delete().eq(c.fk, id).eq('url', url);
  const { data: row } = await supabase.from(c.table).select('image_url').eq('id', id).maybeSingle();
  if ((row as { image_url?: string | null } | null)?.image_url === url) {
    const { data: rest } = await supabase.from(c.photos).select('url').eq(c.fk, id).order('position', { ascending: true }).limit(1);
    await supabase.from(c.table).update({ image_url: ((rest ?? []) as { url: string }[])[0]?.url ?? null }).eq('id', id);
  }
}

/** Choisit la photo principale (celle du site) et la place en premier. */
export async function setMediaCover(kind: MediaKind, id: string, url: string): Promise<void> {
  const c = CFG[kind];
  const { data } = await supabase.from(c.photos).select('url, position').eq(c.fk, id).order('position', { ascending: true });
  const list = ((data ?? []) as { url: string }[]).map(p => p.url);
  if (!list.includes(url)) await supabase.from(c.photos).insert({ [c.fk]: id, url, position: 0 });
  const ordered = [url, ...list.filter(u => u !== url)];
  for (let i = 0; i < ordered.length; i++) {
    await supabase.from(c.photos).update({ position: i }).eq(c.fk, id).eq('url', ordered[i]);
  }
  await supabase.from(c.table).update({ image_url: url }).eq('id', id);
}

/** Envoie toutes les photos sur le Telegram de Kouider (albums de 10). */
export async function sendMediaToTelegram(kind: MediaKind, idOrName: string, actor = 'kouider'): Promise<string> {
  const t = await resolveMedia(kind, idOrName);
  const what = kind === 'car' ? 'voiture' : kind === 'property' ? 'bien' : 'voiture à vendre';
  if (!t) return `❌ Aucune ${what} trouvée pour « ${idOrName} ».`;
  if (!t.urls.length) return `⚠️ ${t.name} n'a encore aucune photo. Ajoute-les dans l'app (PARC → Photos).`;
  await queueTelegramAlbum(`📸 ${t.name} — ${t.urls.length} photo${t.urls.length > 1 ? 's' : ''}`, t.urls, actor);
  return `✅ ${t.urls.length} photo${t.urls.length > 1 ? 's' : ''} de ${t.name} envoyée${t.urls.length > 1 ? 's' : ''} sur Telegram (arrivée sous 30 s).`;
}
