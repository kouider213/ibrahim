import * as XLSX from 'xlsx';
import { supabase } from './supabase.js';

interface BookingRow {
  id: string;
  client_name: string;
  client_phone: string;
  start_date: string;
  end_date: string;
  final_price: number | null;
  paid_amount: number | null;
  status: string;
  payment_status: string;
  client_price_per_day: number | null;
  owner_price_per_day: number | null;
  cars: { name: string } | null;
}

export async function exportBookingsToExcel(year?: number, month?: number): Promise<Buffer> {
  const y = year  ?? new Date().getFullYear();
  const label = month ? `${String(month).padStart(2, '0')}/${y}` : String(y);

  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, paid_amount, status, payment_status, client_price_per_day, owner_price_per_day, cars(name)')
    .gte('start_date', month ? `${y}-${String(month).padStart(2, '0')}-01` : `${y}-01-01`)
    .lte('start_date', month
      ? `${y}-${String(month).padStart(2, '0')}-31`
      : `${y}-12-31`,
    )
    .order('start_date', { ascending: true });

  const { data: bookings, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);

  const rows = (bookings ?? []) as unknown as BookingRow[];

  // ── Feuille principale ────────────────────────────────────────
  const wsData: unknown[][] = [[
    'Date début', 'Date fin', 'Jours', 'Client', 'Téléphone', 'Véhicule',
    'Prix/j client', 'Prix/j propriétaire', 'Total', 'Profit', 'Payé', 'Reste', 'Statut', 'Paiement',
  ]];

  let totalRevenu = 0;
  let totalProfit = 0;
  let totalPaye   = 0;

  for (const b of rows) {
    const start = new Date(b.start_date);
    const end   = new Date(b.end_date);
    const days  = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1); // jours inclus
    const total = b.final_price ?? 0;
    const paid  = b.paid_amount ?? 0;
    const reste = total - paid;
    const cpd   = b.client_price_per_day;
    const opd   = b.owner_price_per_day;
    const profit = (cpd != null && opd != null) ? (cpd - opd) * days : null;

    totalRevenu += total;
    totalPaye   += paid;
    if (profit != null) totalProfit += profit;

    wsData.push([
      b.start_date,
      b.end_date,
      days,
      b.client_name ?? '',
      b.client_phone ?? '',
      (b.cars as { name: string } | null)?.name ?? '',
      cpd ?? '',
      opd ?? '',
      total,
      profit ?? 'N/A',
      paid,
      reste > 0 ? reste : 0,
      b.status   ?? '',
      b.payment_status ?? '',
    ]);
  }

  // Ligne totaux
  wsData.push([]);
  wsData.push(['TOTAUX', '', '', '', '', '', '', '', totalRevenu, totalProfit, totalPaye, totalRevenu - totalPaye, '', '']);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Largeurs colonnes
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 22 }, { wch: 16 },
    { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];

  // ── Feuille résumé ────────────────────────────────────────────
  const wsSummary = XLSX.utils.aoa_to_sheet([
    ['RÉSUMÉ COMPTABLE — ' + label],
    [],
    ['Période',             label],
    ['Nombre réservations', rows.length],
    ['Chiffre d\'affaires', totalRevenu],
    ['Total encaissé',      totalPaye],
    ['Reste à encaisser',   totalRevenu - totalPaye],
    ['Profit estimé',       totalProfit],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Réservations');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}
