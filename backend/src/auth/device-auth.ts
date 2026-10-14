/**
 * Connexion par appareil (2026-10-14).
 *
 * Avant : l'app contenait en clair le code d'accès de l'API et les mots de passe (« kouider31 ») —
 * n'importe qui lisant la page publique kouider213.github.io/ibrahim pouvait piloter Dzaryx et le PC.
 * Maintenant : l'app demande identifiant + mot de passe, le serveur les vérifie (hash scrypt dans app_kv)
 * et remet un jeton propre à l'appareil (32 octets aléatoires, seul son hash SHA-256 est stocké).
 *
 * app_kv :
 *   auth:pw:<actor>   = "scrypt$<sel hex>$<hash hex>"
 *   auth:devices      = [{ h, actor, label, created, last }]   (jetons actifs)
 *   auth:legacy       = 'off' → les anciens codes statiques (MOBILE_ACCESS_TOKEN / MOBILE_TOKEN_HOUARI)
 *                       ne sont plus acceptés. À couper quand le service d'appels Telegram (tgcall/.env ACCESS_TOKEN)
 *                       a reçu son propre jeton d'appareil — sinon les appels s'arrêtent.
 *
 * Les vérifications (validateToken / identifyMobileActor) sont synchrones : la liste des appareils est
 * gardée en mémoire et relue toutes les 30 s (sert aussi au backend de secours sur le VPS).
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { kvGet, kvSet } from '../integrations/app-store.js';

export type DeviceActor = 'kouider' | 'houari';
export interface DeviceRecord { h: string; actor: DeviceActor; label: string; created: string; last?: string }

const DEVICES_KEY = 'auth:devices';
const LEGACY_KEY  = 'auth:legacy';
const pwKey = (actor: DeviceActor) => `auth:pw:${actor}`;

let devices = new Map<string, DeviceRecord>();
let legacyOff = false;
let loaded = false;
const pendingLast = new Map<string, string>();   // h → dernière utilisation, à écrire

export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

async function refresh(): Promise<void> {
  try {
    const raw = await kvGet(DEVICES_KEY);
    const list = raw ? (JSON.parse(raw) as DeviceRecord[]) : [];
    devices = new Map(list.map(d => [d.h, d]));
    legacyOff = (await kvGet(LEGACY_KEY)) === 'off';
    loaded = true;
  } catch (err) {
    console.warn('[auth] lecture appareils:', err instanceof Error ? err.message : err);
  }
}

async function saveDevices(): Promise<void> {
  await kvSet(DEVICES_KEY, JSON.stringify([...devices.values()]));
}

/** À appeler au démarrage du serveur. */
export function startDeviceAuthSync(): void {
  void refresh();
  setInterval(() => {
    void (async () => {
      await refresh();
      // « dernière utilisation » : écrite au plus toutes les 30 s, réappliquée après relecture
      if (pendingLast.size) {
        for (const [h, at] of pendingLast) { const d = devices.get(h); if (d) d.last = at; }
        pendingLast.clear();
        await saveDevices().catch(() => {});
      }
    })();
  }, 30_000).unref?.();
}

/** Acteur du jeton d'appareil, ou null. Synchrone (liste en mémoire). */
export function deviceActor(token: string): DeviceActor | null {
  if (!token || token.length < 40) return null;
  const d = devices.get(sha256(token));
  if (!d) return null;
  const now = new Date().toISOString();
  if (!d.last || Date.parse(now) - Date.parse(d.last) > 3_600_000) { d.last = now; pendingLast.set(d.h, now); }
  return d.actor;
}

/** Les anciens codes statiques de l'app sont-ils encore acceptés ? */
export function legacyMobileAllowed(): boolean {
  return !legacyOff;
}

export function deviceAuthLoaded(): boolean { return loaded; }

// ── Mots de passe ─────────────────────────────────────────────────────────────

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 32).toString('hex')}`;
}

export function checkPassword(pw: string, stored: string): boolean {
  const [kind, saltHex, hashHex] = stored.split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function setPassword(actor: DeviceActor, pw: string): Promise<void> {
  await kvSet(pwKey(actor), hashPassword(pw));
}

export async function verifyPassword(actor: DeviceActor, pw: string): Promise<boolean> {
  const stored = await kvGet(pwKey(actor));
  return !!stored && checkPassword(pw, stored);
}

// ── Appareils ─────────────────────────────────────────────────────────────────

export async function issueDeviceToken(actor: DeviceActor, label: string): Promise<string> {
  await refresh();
  const token = randomBytes(32).toString('hex');
  const rec: DeviceRecord = { h: sha256(token), actor, label: label.slice(0, 80), created: new Date().toISOString() };
  devices.set(rec.h, rec);
  await saveDevices();
  return token;
}

export async function revokeDeviceToken(token: string): Promise<boolean> {
  await refresh();
  const ok = devices.delete(sha256(token));
  if (ok) await saveDevices();
  return ok;
}

export async function revokeAllDevices(actor: DeviceActor, exceptToken?: string): Promise<number> {
  await refresh();
  const keep = exceptToken ? sha256(exceptToken) : '';
  let n = 0;
  for (const [h, d] of devices) if (d.actor === actor && h !== keep && !d.label.startsWith('service:')) { devices.delete(h); n++; }
  if (n) await saveDevices();
  return n;
}

export function listDevices(actor?: DeviceActor): DeviceRecord[] {
  return [...devices.values()].filter(d => !actor || d.actor === actor);
}

export async function setLegacyOff(off: boolean): Promise<void> {
  await kvSet(LEGACY_KEY, off ? 'off' : 'on');
  legacyOff = off;
}
