import type { Job } from 'bullmq';
import { redis } from '../queue/queue.js';
import { getUserProfile } from '../integrations/supabase.js';
import { sendMessage } from '../integrations/telegram.js';
import { notifyOwner } from '../notifications/pushover.js';
import { getOranWeather } from '../integrations/web-search.js';
import { env } from '../config/env.js';

export interface TriggerResult {
  trigger: string;
  status:  'SENT' | 'SKIPPED' | 'ERROR';
  reason?: string;
}

function ownerChatId(): string {
  return env.TELEGRAM_CHAT_ID ?? '809747124';
}

async function tg(text: string): Promise<void> {
  if (env.TELEGRAM_CHAT_ID) await sendMessage(ownerChatId(), text);
}

// Redis daily lock (TTL 24h) — returns true if lock was acquired (first caller)
async function acquireDailyLock(name: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await redis.set(`p12c:${name}:${today}`, '1', 'EX', 86400, 'NX');
  return result === 'OK';
}

// Redis weekly lock (TTL 7 days) — keyed on ISO week's Monday
async function acquireWeeklyLock(name: string): Promise<boolean> {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
  const result = await redis.set(`p12c:${name}:week:${monday}`, '1', 'EX', 604800, 'NX');
  return result === 'OK';
}

export function clearDailyLocks(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  return redis.del(
    `p12c:pre-work:${today}`,
    `p12c:after-work:${today}`,
    `p12c:heat-alert:${today}`,
  );
}

export async function clearWeeklyLocks(): Promise<number> {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
  return redis.del(`p12c:tiktok-reminder:week:${monday}`);
}

// Parse "HH:MM" or "HH:MM:SS" → total minutes
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Get local {hour, minute, dayOfWeek(0=Sun)} for a given timezone
function getLocalTime(tz: string): { hour: number; minute: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '0';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour:       parseInt(get('hour'),   10) % 24,
    minute:     parseInt(get('minute'), 10),
    dayOfWeek:  dayMap[get('weekday')] ?? 0,
  };
}

// ── Trigger 1: Pre-work commute reminder ─────────────────────────
// Fires once daily, ~15min before ideal departure time
async function triggerPreWorkReminder(
  workDays: number[], workStart: string, commute: number, tz: string,
): Promise<TriggerResult> {
  const { hour, minute, dayOfWeek } = getLocalTime(tz);
  if (!workDays.includes(dayOfWeek)) {
    return { trigger: 'pre-work', status: 'SKIPPED', reason: 'pas un jour de travail' };
  }
  const nowMin    = hour * 60 + minute;
  const departMin = timeToMinutes(workStart) - commute;
  if (nowMin < departMin - 15 || nowMin > departMin + 15) {
    const dH = Math.floor(departMin / 60);
    const dM = String(departMin % 60).padStart(2, '0');
    return { trigger: 'pre-work', status: 'SKIPPED', reason: `fenêtre ${dH}h${dM} ±15min (actuel ${hour}h${String(minute).padStart(2,'0')})` };
  }
  if (!await acquireDailyLock('pre-work')) {
    return { trigger: 'pre-work', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  const dH = Math.floor(departMin / 60);
  const dM = String(departMin % 60).padStart(2, '0');
  await tg(`🚗 *Rappel trajet Bruxelles*\nDépart idéal : *${dH}h${dM}* (trajet ~${commute}min)\nPrise en charge : ${workStart.slice(0, 5)} ✅`);
  return { trigger: 'pre-work', status: 'SENT' };
}

// ── Trigger 2: After-work rest / famille ─────────────────────────
// Fires once daily, 0–30min after work_end
async function triggerAfterWorkRest(
  workDays: number[], workEnd: string, tz: string,
): Promise<TriggerResult> {
  const { hour, minute, dayOfWeek } = getLocalTime(tz);
  if (!workDays.includes(dayOfWeek)) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'pas un jour de travail' };
  }
  const nowMin = hour * 60 + minute;
  const endMin = timeToMinutes(workEnd);
  if (nowMin < endMin || nowMin > endMin + 30) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'hors fenêtre post-travail' };
  }
  if (!await acquireDailyLock('after-work')) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  await tg(`🏠 *Bonne soirée Kouider !*\nTravail terminé — profite de ta famille. 👨‍👩‍👦\nDzaryx surveille Fik Conciergerie. 🛡️`);
  return { trigger: 'after-work', status: 'SENT' };
}

// ── Trigger 3: Oran heat alert (>35°C) ───────────────────────────
// Fires once daily if temp > threshold between 10h–20h Algiers
async function triggerHeatAlert(): Promise<TriggerResult> {
  const { hour } = getLocalTime('Africa/Algiers');
  if (hour < 10 || hour > 20) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'hors fenêtre 10h–20h Oran' };
  }
  let weather;
  try {
    weather = await getOranWeather();
  } catch {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'météo non disponible' };
  }
  if (weather.temperature < 35) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: `${weather.temperature}°C < 35°C` };
  }
  if (!await acquireDailyLock('heat-alert')) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  const msg = [
    `🌡️ *Alerte chaleur Oran : ${weather.temperature}°C* (ressenti ${weather.apparent_temp}°C)`,
    ``,
    `💡 Rappelle aux clients :`,
    `  • Stationnement ombragé obligatoire`,
    `  • Vérifier les niveaux avant sorties longues`,
    `  • Prévoir eau + clim en marche`,
  ].join('\n');
  await tg(msg);
  await notifyOwner(`🌡️ Chaleur Oran ${weather.temperature}°C`, 'Conseille stationnement ombragé aux clients', false);
  return { trigger: 'heat-alert', status: 'SENT' };
}

// ── Trigger 4: TikTok weekly reminder ────────────────────────────
// Fires once per week on Wednesday ≥14h or Friday ≥14h (Algiers)
async function triggerTikTokReminder(): Promise<TriggerResult> {
  const { hour, dayOfWeek } = getLocalTime('Africa/Algiers');
  if (dayOfWeek !== 3 && dayOfWeek !== 5) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'pas mercredi/vendredi' };
  }
  if (hour < 14) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'avant 14h Algiers' };
  }
  if (!await acquireWeeklyLock('tiktok-reminder')) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'déjà rappelé cette semaine' };
  }
  const day = dayOfWeek === 3 ? 'mercredi' : 'vendredi';
  await tg([
    `📱 *Rappel TikTok — ${day}*`,
    `Objectif : 2 vidéos minimum cette semaine (Fik Conciergerie)`,
    ``,
    `💡 Dis "génère une idée TikTok" ou déclenche une vidéo depuis l'app.`,
    `📊 Jobs auto disponibles : mercredi-content / friday-content`,
  ].join('\n'));
  return { trigger: 'tiktok-reminder', status: 'SENT' };
}

// ── Main orchestrator ─────────────────────────────────────────────
export async function runProactiveEngine(_job?: Job, force = false): Promise<TriggerResult[]> {
  if (force) {
    await Promise.all([clearDailyLocks(), clearWeeklyLocks()]);
    console.log('[p12c] Force mode — locks cleared');
  }

  const profile = await getUserProfile().catch(() => null);
  if (!profile) {
    console.log('[p12c] SKIP — user_profile non disponible');
    return [{ trigger: 'all', status: 'SKIPPED', reason: 'user_profile non disponible' }];
  }

  const workDays  = profile.work_days          ?? [1, 2, 3, 4, 5];
  const workStart = profile.work_start         ?? '09:00';
  const workEnd   = profile.work_end           ?? '17:30';
  const commute   = profile.commute_minutes_avg ?? 25;
  const tzWork    = profile.timezone_primary    ?? 'Europe/Brussels';

  const [r1, r2, r3, r4] = await Promise.all([
    triggerPreWorkReminder(workDays, workStart, commute, tzWork).catch(err => ({
      trigger: 'pre-work',        status: 'ERROR' as const, reason: (err as Error).message,
    })),
    triggerAfterWorkRest(workDays, workEnd, tzWork).catch(err => ({
      trigger: 'after-work',      status: 'ERROR' as const, reason: (err as Error).message,
    })),
    triggerHeatAlert().catch(err => ({
      trigger: 'heat-alert',      status: 'ERROR' as const, reason: (err as Error).message,
    })),
    triggerTikTokReminder().catch(err => ({
      trigger: 'tiktok-reminder', status: 'ERROR' as const, reason: (err as Error).message,
    })),
  ]);

  const results = [r1, r2, r3, r4];
  for (const r of results) {
    console.log(`[p12c:${r.trigger}] ${r.status}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  return results;
}
