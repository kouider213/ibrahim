import { supabase } from './supabase.js';
import { chat } from './claude-api.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArrivalPattern {
  typical_time?:     string;  // "soir", "matin", "après-midi", "nuit"
  typical_hour?:     string;  // "20h-23h", "8h-10h"
  typical_day?:      string;  // "lundi", "vendredi"
  flight_origin?:    string;  // "Paris CDG", "Bruxelles"
  notes?:            string;
}

export interface ClientBrain {
  client_name:           string;
  client_phone:          string | null;
  passport_number:       string | null;
  preferred_cars:        string[];
  typical_months:        number[];
  typical_month_names:   string[];
  typical_duration_days: number | null;
  payment_reliability:   string;
  arrival_patterns:      ArrivalPattern;
  flight_patterns:       string | null;
  ai_insights:           string | null;
  score:                 string;
  total_bookings:        number;
  total_spent:           number;
  last_booking_date:     string | null;
  notes:                 string | null;
}

const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

// ── Get full brain profile (by name or phone) ────────────────────────────────

export async function getClientBrain(
  nameOrPhone: string,
  ownerId = 'kouider',
): Promise<{ found: boolean; clients: ClientBrain[]; context: string }> {
  try {
    const isPhone = /^[+\d][\d\s-]{5,}$/.test(nameOrPhone.trim());

    let query = supabase.from('client_intelligence').select('*').eq('owner_id', ownerId);
    if (isPhone) {
      query = query.ilike('client_phone', `%${nameOrPhone.replace(/\s/g, '')}%`);
    } else {
      query = query.ilike('client_name', `%${nameOrPhone}%`);
    }
    query = query.order('total_bookings', { ascending: false }).limit(5);

    const { data } = await query;
    if (!data || data.length === 0) return { found: false, clients: [], context: '' };

    const clients = (data as any[]).map(buildBrainFromRow);
    const context = clients.length === 1
      ? buildBrainContext(clients[0]!)
      : buildMultiContext(clients, nameOrPhone);

    return { found: true, clients, context };
  } catch (err) {
    console.error('[client-brain] getClientBrain error:', err);
    return { found: false, clients: [], context: '' };
  }
}

function buildBrainFromRow(r: any): ClientBrain {
  const months: number[] = r.typical_months ?? [];
  return {
    client_name:           r.client_name,
    client_phone:          r.client_phone ?? null,
    passport_number:       r.passport_number ?? null,
    preferred_cars:        r.preferred_cars ?? [],
    typical_months:        months,
    typical_month_names:   months.map(m => MONTH_NAMES[m - 1] ?? String(m)),
    typical_duration_days: r.typical_duration_days ?? null,
    payment_reliability:   r.payment_reliability ?? 'unknown',
    arrival_patterns:      r.arrival_patterns ?? {},
    flight_patterns:       r.flight_patterns ?? null,
    ai_insights:           r.ai_insights ?? null,
    score:                 r.score ?? 'NEW',
    total_bookings:        r.total_bookings ?? 0,
    total_spent:           r.total_spent ?? 0,
    last_booking_date:     r.last_booking_date ?? null,
    notes:                 r.notes ?? null,
  };
}

function buildBrainContext(c: ClientBrain): string {
  const lines: string[] = [`🧠 CERVEAU CLIENT — ${c.client_name}:`];
  lines.push(`• Score: ${c.score} | ${c.total_bookings} location(s) | ${c.total_spent}€ dépensé`);

  if (c.preferred_cars.length > 0) lines.push(`• Voitures préférées: ${c.preferred_cars.join(', ')}`);
  if (c.typical_month_names.length > 0) lines.push(`• Loue typiquement en: ${c.typical_month_names.join(', ')}`);
  if (c.typical_duration_days) lines.push(`• Durée typique: ${c.typical_duration_days} jours`);
  if (c.flight_patterns) lines.push(`• Vol/Arrivée: ${c.flight_patterns}`);

  const ap = c.arrival_patterns;
  if (ap.typical_time) lines.push(`• Heure d'arrivée: ${ap.typical_time}${ap.typical_hour ? ` (${ap.typical_hour})` : ''}`);
  if (ap.typical_day) lines.push(`• Arrive souvent: ${ap.typical_day}`);
  if (ap.flight_origin) lines.push(`• Vient de: ${ap.flight_origin}`);

  if (c.payment_reliability && c.payment_reliability !== 'unknown') {
    const payMap: Record<string, string> = {
      always_on_time:  '✅ Paie toujours',
      sometimes_late:  '⚠️ Parfois en retard',
      often_late:      '🔴 Souvent en retard — exiger acompte',
    };
    lines.push(`• Paiement: ${payMap[c.payment_reliability] ?? c.payment_reliability}`);
  }

  if (c.passport_number) lines.push(`• Passeport: ${c.passport_number}`);
  if (c.last_booking_date) lines.push(`• Dernière location: ${c.last_booking_date}`);
  if (c.ai_insights) lines.push(`\n💡 DZARYX SAIT: ${c.ai_insights}`);
  if (c.notes) lines.push(`📝 Notes: ${c.notes}`);

  return lines.join('\n');
}

function buildMultiContext(clients: ClientBrain[], query: string): string {
  const lines = [`⚠️ ${clients.length} clients correspondent à "${query}" — précise le nom ou le téléphone:`];
  clients.forEach((c, i) => {
    const phone = c.client_phone ? ` — ${c.client_phone}` : '';
    const pass = c.passport_number ? ` — Passeport: ${c.passport_number}` : '';
    lines.push(`  ${i + 1}. ${c.client_name}${phone}${pass} — ${c.total_bookings} location(s)`);
  });
  return lines.join('\n');
}

// ── Add manual note to client ─────────────────────────────────────────────────

export async function addClientNote(
  nameOrPhone: string,
  note: string,
  ownerId = 'kouider',
): Promise<string> {
  try {
    const { data } = await supabase
      .from('client_intelligence')
      .select('id, client_name, notes, raw_notes_history')
      .eq('owner_id', ownerId)
      .ilike(nameOrPhone.startsWith('+') || /^\d{7,}$/.test(nameOrPhone) ? 'client_phone' : 'client_name', `%${nameOrPhone}%`)
      .limit(1)
      .maybeSingle();

    if (!data) return `❌ Client "${nameOrPhone}" introuvable.`;

    const row = data as { id: string; client_name: string; notes: string | null; raw_notes_history: any[] };
    const existing = row.notes ?? '';
    const history  = row.raw_notes_history ?? [];
    const now      = new Date().toISOString().slice(0, 10);

    history.push({ date: now, note });

    const newNotes = existing ? `${existing}\n[${now}] ${note}` : `[${now}] ${note}`;

    await supabase.from('client_intelligence').update({
      notes:             newNotes,
      raw_notes_history: history.slice(-20),
    }).eq('id', row.id);

    return `✅ Note ajoutée pour ${row.client_name}: "${note}"`;
  } catch (err) {
    console.error('[client-brain] addClientNote error:', err);
    return '❌ Erreur lors de l\'ajout de la note.';
  }
}

// ── Set arrival pattern for client ───────────────────────────────────────────

export async function setArrivalPattern(
  nameOrPhone: string,
  pattern: ArrivalPattern,
  ownerId = 'kouider',
): Promise<string> {
  try {
    const isPhone = /^[+\d][\d\s-]{5,}$/.test(nameOrPhone.trim());
    const col = isPhone ? 'client_phone' : 'client_name';

    const { data } = await supabase
      .from('client_intelligence')
      .select('id, client_name, arrival_patterns')
      .eq('owner_id', ownerId)
      .ilike(col, `%${nameOrPhone}%`)
      .limit(1)
      .maybeSingle();

    if (!data) return `❌ Client "${nameOrPhone}" introuvable.`;
    const row = data as { id: string; client_name: string; arrival_patterns: ArrivalPattern };

    const merged: ArrivalPattern = { ...(row.arrival_patterns ?? {}), ...pattern };

    // Build a natural language flight_patterns string
    const parts: string[] = [];
    if (merged.typical_time) parts.push(`arrive le ${merged.typical_time}`);
    if (merged.typical_hour) parts.push(`(${merged.typical_hour})`);
    if (merged.typical_day) parts.push(`souvent le ${merged.typical_day}`);
    if (merged.flight_origin) parts.push(`depuis ${merged.flight_origin}`);
    const flightStr = parts.join(' ');

    await supabase.from('client_intelligence').update({
      arrival_patterns: merged,
      flight_patterns:  flightStr || null,
    }).eq('id', row.id);

    return `✅ Pattern d'arrivée mis à jour pour ${row.client_name}: ${flightStr || JSON.stringify(pattern)}`;
  } catch (err) {
    console.error('[client-brain] setArrivalPattern error:', err);
    return '❌ Erreur lors de la mise à jour du pattern d\'arrivée.';
  }
}

// ── Save observation (free-form Dzaryx memory) ───────────────────────────────

export async function saveObservation(
  obsType: string,
  content: string,
  actorId?: string,
  clientPhone?: string,
  clientName?: string,
  source = 'conversation',
): Promise<void> {
  try {
    await supabase.from('dzaryx_observations').insert({
      actor_id:     actorId ?? null,
      client_phone: clientPhone ?? null,
      client_name:  clientName ?? null,
      obs_type:     obsType,
      content,
      source,
    });
  } catch (err) {
    console.error('[client-brain] saveObservation error:', err);
  }
}

// ── Get recent observations ───────────────────────────────────────────────────

export async function getObservations(
  actorId?: string,
  clientPhone?: string,
  limit = 20,
): Promise<Array<{ obs_type: string; content: string; created_at: string }>> {
  try {
    let q = supabase.from('dzaryx_observations').select('obs_type, content, created_at');
    if (actorId)     q = q.eq('actor_id', actorId);
    if (clientPhone) q = q.eq('client_phone', clientPhone);
    q = q.order('created_at', { ascending: false }).limit(limit);
    const { data } = await q;
    return (data ?? []) as Array<{ obs_type: string; content: string; created_at: string }>;
  } catch { return []; }
}

// ── Weekly auto-analysis: scan ALL bookings → update client profiles ──────────

export async function analyzeAllClients(ownerId = 'kouider'): Promise<number> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('client_name, client_phone, car_id, start_date, end_date, final_price, paid_amount, payment_status, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .order('start_date', { ascending: true });

  if (!bookings || bookings.length === 0) return 0;

  // Group by phone (primary key), fall back to name
  const grouped = new Map<string, any[]>();
  for (const b of bookings as any[]) {
    const key = b.client_phone ?? b.client_name;
    const arr = grouped.get(key) ?? [];
    arr.push(b);
    grouped.set(key, arr);
  }

  let updated = 0;

  for (const [key, bks] of grouped) {
    try {
      const clientName  = bks[bks.length - 1].client_name;
      const clientPhone = bks[0].client_phone ?? null;

      // Compute patterns
      const carCounts: Record<string, number> = {};
      const monthCounts: Record<number, number> = {};
      let totalDays = 0;
      let totalSpent = 0;
      let paidOnTime = 0;

      for (const b of bks) {
        const carName = b.cars?.name ?? 'Inconnu';
        carCounts[carName] = (carCounts[carName] ?? 0) + 1;

        const month = new Date(b.start_date).getMonth() + 1;
        monthCounts[month] = (monthCounts[month] ?? 0) + 1;

        const start = new Date(b.start_date).getTime();
        const end   = new Date(b.end_date).getTime();
        totalDays  += Math.max(1, Math.ceil((end - start) / 86_400_000));
        totalSpent += Number(b.final_price ?? 0);

        if (b.payment_status === 'PAID' || b.paid_amount >= (b.final_price ?? 0) * 0.99) paidOnTime++;
      }

      const sortedCars = Object.entries(carCounts).sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const sortedMonths = Object.keys(monthCounts).map(Number).sort((a, b) => monthCounts[b]! - monthCounts[a]!);
      const avgDays = Math.round((totalDays / bks.length) * 10) / 10;
      const payRate = bks.length > 0 ? paidOnTime / bks.length : 0;
      const payRel  = payRate >= 0.9 ? 'always_on_time' : payRate >= 0.6 ? 'sometimes_late' : 'often_late';
      const score   = bks.length >= 5 || totalSpent >= 1000 ? 'VIP'
        : bks.length >= 3 || totalSpent >= 500 ? 'FREQUENT'
        : bks.length >= 2 ? 'REGULAR' : 'NEW';

      // Generate AI insights with Claude
      const insightPrompt = `Client location voiture Oran — génère UN SEUL paragraphe court (max 2 phrases) de profil en français très naturel:
Nom: ${clientName}
Voitures louées (fréquence): ${JSON.stringify(carCounts)}
Mois de location (numéros): ${JSON.stringify(monthCounts)}
Durée moyenne: ${avgDays} jours
Total locations: ${bks.length} | Total dépensé: ${totalSpent}€
Paiement: ${payRel}
Exemples: "Loue souvent des SUV en juillet-août, durée ~7j, paie toujours rapidement." ou "Client régulier: préfère la Clio en mai-juin, négociateur."
IMPORTANT: cite uniquement des faits réels ci-dessus. Court, naturel, utile pour Kouider.`;

      let aiInsights = '';
      try {
        const resp = await chat([{ role: 'user', content: insightPrompt }], undefined);
        aiInsights = resp.text.trim().slice(0, 300);
      } catch { /* skip insights if Claude fails */ }

      // Upsert
      const { data: existing } = await supabase
        .from('client_intelligence')
        .select('id')
        .eq('owner_id', ownerId)
        .ilike('client_name', clientName)
        .limit(1)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        owner_id:              ownerId,
        client_name:           clientName,
        client_phone:          clientPhone,
        preferred_cars:        sortedCars.slice(0, 5),
        typical_months:        sortedMonths.slice(0, 6),
        typical_duration_days: avgDays,
        payment_reliability:   payRel,
        total_bookings:        bks.length,
        total_spent:           totalSpent,
        last_booking_date:     bks[bks.length - 1].start_date,
        score,
        last_analyzed_at:      new Date().toISOString(),
        ...(aiInsights ? { ai_insights: aiInsights } : {}),
      };

      if (existing) {
        await supabase.from('client_intelligence').update(payload).eq('id', (existing as { id: string }).id);
      } else {
        await supabase.from('client_intelligence').insert(payload);
      }

      updated++;
    } catch (err) {
      console.error(`[client-brain] analyzeAllClients error for ${key}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[client-brain] analyzeAllClients: ${updated}/${grouped.size} clients updated`);
  return updated;
}

// ── Update actor brain from conversation ──────────────────────────────────────

export async function learnFromConversation(
  actorId: string,
  userMessages: string[],
): Promise<void> {
  if (userMessages.length < 3) return;

  try {
    const { data } = await supabase
      .from('actor_brain')
      .select('*')
      .eq('actor_id', actorId)
      .maybeSingle();

    if (!data) return;

    const brain = data as {
      actor_id: string;
      decision_patterns: Record<string, string[]>;
      interaction_count: number;
    };

    // Detect approval/rejection words from recent messages
    const approvalWords = new Set<string>(brain.decision_patterns?.approval ?? []);
    const rejectionWords = new Set<string>(brain.decision_patterns?.rejection ?? []);

    const APPROVAL_RE  = /\b(oke|ok|oui|go|parfait|nickel|top|bravo|wakha|mzien|oki|continue|fait[- ]le|vas[-\s]y)\b/gi;
    const REJECTION_RE = /\b(non|stop|annule|laisse|pas|la\b|cancel|ne fait pas)\b/gi;

    for (const msg of userMessages.slice(-20)) {
      const approvals  = msg.match(APPROVAL_RE)  ?? [];
      const rejections = msg.match(REJECTION_RE) ?? [];
      approvals.forEach(w  => approvalWords.add(w.toLowerCase()));
      rejections.forEach(w => rejectionWords.add(w.toLowerCase()));
    }

    await supabase.from('actor_brain').update({
      decision_patterns: {
        ...brain.decision_patterns,
        approval:   [...approvalWords].slice(0, 20),
        rejection:  [...rejectionWords].slice(0, 20),
      },
      interaction_count: (brain.interaction_count ?? 0) + 1,
      last_updated:       new Date().toISOString(),
    }).eq('actor_id', actorId);
  } catch { /* non-blocking */ }
}

// ── Get actor brain context for system prompt ─────────────────────────────────

export async function getActorBrainContext(actorId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('actor_brain')
      .select('decision_patterns, preferences, emotional_patterns')
      .eq('actor_id', actorId)
      .maybeSingle();

    if (!data) return '';
    const b = data as {
      decision_patterns:  Record<string, string[]>;
      preferences:        Record<string, unknown>;
      emotional_patterns: Record<string, string[]>;
    };

    const lines: string[] = [];
    const approval  = b.decision_patterns?.approval  ?? [];
    const rejection = b.decision_patterns?.rejection ?? [];
    const stress    = b.emotional_patterns?.stress_markers ?? [];

    if (approval.length)  lines.push(`Mots d'approbation détectés: ${approval.join(', ')}`);
    if (rejection.length) lines.push(`Mots de refus détectés: ${rejection.join(', ')}`);
    if (stress.length)    lines.push(`Indicateurs de stress: ${stress.join(', ')}`);

    return lines.length > 0 ? `\nCERVEAU ACTOR (${actorId}):\n${lines.join('\n')}` : '';
  } catch { return ''; }
}
