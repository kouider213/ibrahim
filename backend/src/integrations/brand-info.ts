import { supabase } from './supabase.js';

/**
 * Coordonnées de l'entreprise saisies par Kouider dans l'admin du site (Admin › Paramètres) :
 * WhatsApp, numéro algérien, adresse, RC / NIF. Lues ici pour que les PDF de Dzaryx (bon de réservation,
 * devis) les reprennent tout seuls dès qu'il les ajoute. Cache 10 min.
 */
export interface BrandInfo { whatsapp: string; phone: string; address: string; legal: string }

const FALLBACK: BrandInfo = { whatsapp: '+32 466 31 14 69', phone: '', address: 'Rue Derbouz Draoua Houari, Hay Badr, Oran 31300, Algérie', legal: '' };
let cache: { at: number; info: BrandInfo } | null = null;

export async function getBrandInfo(): Promise<BrandInfo> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.info;
  try {
    const { data } = await supabase.from('site_settings').select('whatsapp, phone, address, content').eq('id', 1).single();
    const content = (data?.content ?? {}) as { rc?: string; nif?: string };
    const wa = String(data?.whatsapp ?? '').replace(/\D/g, '');
    const info: BrandInfo = {
      whatsapp: wa ? (wa.startsWith('32') && wa.length === 11 ? `+${wa.slice(0, 2)} ${wa.slice(2, 5)} ${wa.slice(5, 7)} ${wa.slice(7, 9)} ${wa.slice(9)}` : `+${wa}`) : FALLBACK.whatsapp,
      phone: String(data?.phone ?? '').trim(),
      // « Houari » fait partie du nom de la rue : jamais de virgule avant
      address: String(data?.address || FALLBACK.address).replace(/Draoua\s*,\s*Houari/i, 'Draoua Houari'),
      legal: [content.rc?.trim() && `RC ${content.rc.trim()}`, content.nif?.trim() && `NIF ${content.nif.trim()}`].filter(Boolean).join(' · '),
    };
    cache = { at: Date.now(), info };
    return info;
  } catch {
    return cache?.info ?? FALLBACK;
  }
}
