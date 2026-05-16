import { detectMood, saveMoodSession, getRecentMood } from '../orchestrator/mood-detector.js';
import { getClientProfile, updateClientIntelFromBooking, getTopClients } from '../orchestrator/client-intelligence.js';
import { supabase } from '../integrations/supabase.js';

let passed = 0;
let failed = 0;

function ok(label: string, val: boolean, detail = '') {
  if (val) { console.log(`✅ ${label}`); passed++; }
  else      { console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function run() {
  // ── 1. Mood detect ──────────────────────────────────────────────
  const mood = detectMood('urgent putain je stresse!!!', 23);
  ok('mood détecté (stressed/angry)', ['stressed', 'angry'].includes(mood.mood), `mood=${mood.mood}`);
  ok('intensity >= 3', mood.intensity >= 3, `intensity=${mood.intensity}`);
  ok('tone = direct ou soft', ['direct', 'soft'].includes(mood.tone), `tone=${mood.tone}`);
  ok('advice non vide', mood.advice.length > 0);

  // ── 2. Mood save → Supabase ──────────────────────────────────────
  const sessionId = 'test_' + Date.now();
  try {
    await saveMoodSession(sessionId, mood, 'urgent putain je stresse!!!', 'test_user');
    ok('saveMoodSession sans erreur', true);
  } catch (e) {
    ok('saveMoodSession sans erreur', false, String(e));
  }

  // ── 3. Mood read back ────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 1000));
  const recentMood = await getRecentMood('test_user');
  ok('getRecentMood retourne MoodResult', recentMood !== null, 'null retourné');
  if (recentMood) {
    ok('mood persisté = stressed/angry', ['stressed', 'angry'].includes(recentMood.mood), `mood=${recentMood.mood}`);
  }

  // ── 4. Client profile — client inexistant ────────────────────────
  const unknown = await getClientProfile('Client_Inexistant_XYZ_999', 'kouider');
  ok('client inexistant → exists=false', !unknown.exists);
  ok('client inexistant → profile=null', unknown.profile === null);

  // ── 5. Create client via booking ─────────────────────────────────
  const testClientName = 'TestClient_' + Date.now();
  try {
    await updateClientIntelFromBooking({
      client_name:          testClientName,
      client_phone:         '+213555000001',
      car_name:             'BMW Série 3',
      start_date:           '2026-06-01',
      end_date:             '2026-06-04',
      nb_days:              3,
      client_price_per_day: 80,
      final_price:          240,
      discount_applied:     0,
      status:               'confirmed',
      payment_status:       'paid',
      paid_amount:          240,
    }, 'kouider');
    ok('updateClientIntelFromBooking sans erreur', true);
  } catch (e) {
    ok('updateClientIntelFromBooking sans erreur', false, String(e));
  }

  // ── 6. Read back client profile ───────────────────────────────────
  await new Promise(r => setTimeout(r, 1000));
  const clientProfile = await getClientProfile(testClientName, 'kouider');
  ok('client créé → exists=true', clientProfile.exists, `exists=${clientProfile.exists}`);
  ok('client créé → 1 réservation', clientProfile.profile?.total_bookings === 1, `bookings=${clientProfile.profile?.total_bookings}`);
  ok('client créé → total_spent=240', Number(clientProfile.profile?.total_spent) === 240, `spent=${clientProfile.profile?.total_spent}`);
  ok('client créé → BMW dans preferred_cars', clientProfile.profile?.preferred_cars.includes('BMW Série 3') ?? false);
  ok('client context non vide', clientProfile.context.length > 0);
  console.log('  Context:', clientProfile.context.split('\n').slice(0, 2).join(' | '));

  // ── 7. Top clients ────────────────────────────────────────────────
  const top = await getTopClients('kouider', 3);
  ok('getTopClients retourne array', Array.isArray(top));

  // ── Nettoyage ─────────────────────────────────────────────────────
  await supabase.from('client_intelligence').delete().ilike('client_name', testClientName);
  await supabase.from('mood_sessions').delete().eq('session_id', sessionId);

  // ── Résultat ──────────────────────────────────────────────────────
  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`Deep Memory: ✅ ${passed} passés | ❌ ${failed} échoués`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
