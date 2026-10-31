import { apiFetch, BACKEND_URL } from '../services/api.ts';
import { isAr } from './i18n.ts';

// Types renvoyés par /api/forme (backend/src/integrations/forme.ts)
export interface Profile {
  onboarded: boolean; name: string; lang: 'fr' | 'ar'; shareWithDzaryx: boolean; goal: 'perte' | 'muscle' | 'recompo'; sex: 'h' | 'f'; age: number; heightCm: number; weightKg: number; targetKg: number;
  sessionsPerWeek: number; gym: string; stores: string[]; mealsPerDay: number; budgetWeek: number; likes: string[]; dislikes: string[]; vegetarian: boolean;
  wegovy: { on: boolean; dose: string; day: number; hour: string; start?: string; doses?: Array<{ date: string; dose: string }> };
  photoEveryDays: number; weighDaily: boolean; notif: { meals: boolean; water: boolean; injection: boolean; photo: boolean; weigh: boolean; telegram?: boolean }; waterGoal: number;
  fasting: 'off' | 'ramadan' | 'sunna'; reminders: Array<{ id: string; label: string; time: string; days: number[] }>; stepsGoal: number;
  restDays: number[]; favorites: string[];
}
export interface Targets { kcal: number; p: number; c: number; f: number; tdee: number; bmr: number; fiber: number; waterL: number }
export interface Food { name: string; kcal: number; p: number; c: number; f: number; at?: number; src?: string }
export interface Day { sleep?: number; steps?: number; meals: Record<string, boolean>; extra: Food[]; water: number; weight?: number; measures?: Record<string, number>; injection?: { at: number; site: string; dose?: string }; sides?: Array<{ what: string; level: number; at: number }> }
export interface Recipe { id: string; title: string; photo: string; minutes: number; kcal: number; p: number; c: number; f: number; tags: string[]; ingredients: Array<{ name: string; qty: string }>; steps: string[]; tip: string }
export interface ShopItem { label?: string; name: string; qty: string; aisle: string; store: string; price: number; halal?: boolean; img?: string | null; brand?: string | null; checked?: boolean }
export interface Week { monday: string; at: number; note: string; wishes?: string; budget: number; total: number; recipes: Recipe[]; days: Array<{ date: string; meals: Array<{ slot: string; recipe: string; portion: string }> }>; shopping: ShopItem[] }
export interface Zone { label: string; x: number; y: number; r: number; bx?: number; by?: number; br?: number; trend: 'mieux' | 'pareil' | 'à travailler'; note: string }
export interface Analysis { at: number; vs: string | null; summary: string; zones: Zone[]; advice: string[]; focus: string[]; score: number }
export interface Photo { id: string; date: string; pose: 'face' | 'profil' | 'dos'; weight?: number; analysis?: Analysis; url: string | null }
export interface HouseItem extends ShopItem { key: string; who: Array<{ uid: string; name: string; qty: string }>; by?: string; at?: number }
export interface House { items: HouseItem[]; total: number; budget: number; shared: boolean }
export interface Overview {
  uid: 'kouider' | 'femme'; doses: string[]; femme?: { active: boolean; name: string };
  today: string; profile: Profile; targets: Targets; day: Day; eaten: { kcal: number; p: number; c: number; f: number };
  week: Week | null; week7: Array<{ date: string; kcal: number; p: number; c: number; f: number; water: number; sleep: number | null; steps: number | null }>; streak: number;
  badges: Array<{ id: string; label: string; emoji: string; ok: boolean }>;
  weights: Array<{ date: string; kg: number }>; measures: Array<Record<string, number | string>>;
  injections: Array<{ date: string; at: number; site: string; dose?: string }>; sides: Array<{ date: string; what: string; level: number; at: number }>;
  nextInjection: { date: string; hour: string; inDays: number; site: string; last: { date: string; site: string } | null } | null;
  photos: Photo[]; photoDue: boolean; weightRate: number | null; tooFast: boolean;
  challenge: { id: string; e: string; text: string; goal: number; got: number }; eta: string | null;
  favs: Array<Recipe & { savedAt: number }>;
}
export interface AgendaDay { date: string; rest: boolean; sport: { label: string; time?: string; custom?: string; done: boolean } | null; meals: Array<{ slot: string; title: string; key: string; eaten: boolean }>; injection: { hour: string; site: string; done: boolean } | null; reminders: Array<{ time: string; label: string }>; fasting: boolean }
export interface LibItem { id: string; name: string; fr: string; p: string[]; s: string[]; eq: string; level: string; cat: string; img: string[] }
export interface LibDetail extends LibItem { steps: string[]; mistakes: string[]; breathing: string }
export interface SwipeMeal { id: string; name: string; cat: string; area: string; photo: string }
export interface Product { code: string; name: string; brand: string | null; img: string | null; stores: string[]; kcal: number | null; p: number | null }
export interface Barcode { code: string; name: string; brand: string | null; img: string | null; quantity: string | null; serving: string | null; per100: { kcal: number | null; p: number | null; c: number | null; f: number | null; sugar: number | null; fiber: number | null }; halal: string; haram: boolean }

// Sa femme n'a pas de session Dzaryx : son lien d'invitation donne un jeton FORME (valable seulement pour /api/forme)
export const FORME_TOKEN = 'forme:token';
export const formeToken = () => { try { return localStorage.getItem(FORME_TOKEN); } catch { return null; } };
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = formeToken();
  if (!t) return apiFetch<T>(path, init);
  const r = await fetch(`${BACKEND_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'x-forme-token': t, ...(init.headers ?? {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`API ${r.status}: ${txt}`);
  return JSON.parse(txt) as T;
}
export interface ProgramView { session: (import('../services/api.ts').SportSession & { index: number }) | null; todayPlanned: boolean; doneToday: boolean; week: Array<{ date: string; planned: boolean; done: boolean }>; total: number; sessions: Array<{ label: string; emoji: string; focus: string }>; days: number[] }
const post = <T,>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const get = <T,>(path: string) => call<T>(path);

export interface MachineEx { id: string | null; name: string; muscles: string[]; tip: string; img: string[]; video: string }
export interface MachineScan { id: string; at: number; date: string; machine: string; what: string; setup: string; exercises: MachineEx[]; thumb?: string }
export interface ExSet { at: number; date: string; kg?: number; reps?: number }

export const forme = {
  machine: (image: string, thumb?: string) => post<{ scan: MachineScan }>('/api/forme/machine', { image, thumb }),
  machines: () => call<{ machines: MachineScan[] }>('/api/forme/machines'),
  delMachine: (id: string) => call<{ machines: MachineScan[] }>(`/api/forme/machines/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exFavs: () => call<{ ids: string[] }>('/api/forme/exfav'),
  exFav: (id: string, on: boolean) => post<{ ids: string[] }>('/api/forme/exfav', { id, on }),
  exLog: (id: string) => call<{ sets: ExSet[] }>(`/api/forme/exlog/${encodeURIComponent(id)}`),
  exAdd: (id: string, kg?: number, reps?: number) => post<{ sets: ExSet[] }>('/api/forme/exlog', { id, kg, reps }),
  exDel: (id: string, at: number) => post<{ sets: ExSet[] }>('/api/forme/exlog', { id, del: at }),
  overview: () => call<Overview>('/api/forme'),
  profile: (p: Partial<Profile>) => post<{ profile: Profile; targets: Targets }>('/api/forme/profile', p),
  translate: (texts: string[]) => post<{ map: Record<string, string> }>('/api/forme/translate', { texts }),
  program: () => call<ProgramView>('/api/forme/program'),
  newProgram: () => post<ProgramView>('/api/forme/program', {}),
  invite: (name: string, lang: 'fr' | 'ar') => post<{ link: string }>('/api/forme/invite', { name, lang }),
  revoke: () => call<{ ok: boolean }>('/api/forme/invite', { method: 'DELETE' }),
  log: (kind: string, body: Record<string, unknown> = {}) => post<Overview>('/api/forme/log', { kind, ...body }),
  bodyPhoto: (image: string, pose: string, goal = '', adapt = false) => post<{ photo: Photo; analysis: Analysis | { error: string }; adapted: { date: string; text: string } | null }>('/api/forme/body-photo', { image, pose, goal, adapt }),
  doctor: () => call<{ text: string }>('/api/forme/doctor'),
  analyze: (id: string) => post<{ analysis: Analysis }>('/api/forme/analyze', { id }),
  adapt: (focus: string) => post<{ date: string; text: string }>('/api/forme/adapt', { focus }),
  ask: (question: string, mode = '') => post<{ answer: string }>('/api/forme/ask', { question, mode }),
  push: (sub: PushSubscriptionJSON) => post<{ ok: boolean }>('/api/forme/push', sub),
};

export const errText = (e: unknown) => { const m = e instanceof Error ? e.message : 'Erreur'; try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; } };

/** Photo → JPEG compressé (≤ maxPx) en data URL, pour l'envoi au serveur. */
export async function compressImage(file: Blob, maxPx = 1280, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const DAYS = new Proxy(DAYS_FR, { get: (t, k) => (isAr() ? DAYS_AR : t)[k as unknown as number] ?? Reflect.get(t, k) });
const SHORT_FR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'], SHORT_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const SHORT_DAYS = new Proxy(SHORT_FR, { get: (t, k) => (isAr() ? SHORT_AR : t)[k as unknown as number] ?? Reflect.get(t, k) });
export const dayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
export const fmtLong = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(isAr() ? 'ar' : 'fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const weekNo = (d: string) => { const t = new Date(`${d}T00:00:00Z`); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7); };
export const vibrate = (ms = 30) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
