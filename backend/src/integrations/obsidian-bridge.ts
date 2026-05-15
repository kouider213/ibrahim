/**
 * Obsidian Brain — reads/writes markdown notes in Kouider's Obsidian vault via Nexus PC agent.
 * Vault path: OBSIDIAN_VAULT_PATH env var, or auto-detected via nexus:find_obsidian_vault.
 *
 * Vault structure expected:
 *   <vault>/Dzaryx/clients/<ClientName>.md
 *   <vault>/Dzaryx/preferences.md
 *   <vault>/Dzaryx/<any-note>.md
 */
import { isNexusOnline, emitToNexusWithAck } from '../actions/handlers/nexus-relay.js';

// ── Vault path resolution ────────────────────────────────────────────────────

let _cachedVaultPath: string | null = null;
let _vaultDetectionAttempted = false;

export async function getVaultPath(): Promise<string | null> {
  if (_cachedVaultPath) return _cachedVaultPath;
  const envPath = process.env['OBSIDIAN_VAULT_PATH'];
  if (envPath) { _cachedVaultPath = envPath; return envPath; }

  // Auto-detect via Nexus (once per session)
  if (_vaultDetectionAttempted || !isNexusOnline()) return null;
  _vaultDetectionAttempted = true;

  try {
    const res = await emitToNexusWithAck<{ ok: boolean; vault?: string }>(
      'nexus:find_obsidian_vault', {}, 20000,
    );
    if (res.ok && res.vault) {
      _cachedVaultPath = res.vault;
      console.log(`[obsidian] vault auto-detected: ${res.vault}`);
      return res.vault;
    }
    console.warn('[obsidian] vault not found via Nexus — set OBSIDIAN_VAULT_PATH env var');
    return null;
  } catch (e) {
    console.warn('[obsidian] vault detection failed:', e);
    return null;
  }
}

export function resetVaultCache(): void {
  _cachedVaultPath = null;
  _vaultDetectionAttempted = false;
}

// ── Path helpers ─────────────────────────────────────────────────────────────

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

async function clientPath(clientName: string): Promise<string | null> {
  const vault = await getVaultPath();
  if (!vault) return null;
  return `${vault}\\Dzaryx\\clients\\${sanitizeName(clientName)}.md`;
}

async function notePath(noteName: string): Promise<string | null> {
  const vault = await getVaultPath();
  if (!vault) return null;
  return `${vault}\\Dzaryx\\${sanitizeName(noteName)}.md`;
}

// ── Nexus response types ─────────────────────────────────────────────────────

interface NexusFileResp  { ok: boolean; content?: string | null; error?: string; size?: number }
interface NexusWriteResp { ok: boolean; error?: string }
interface NexusListResp  { ok: boolean; files?: string[]; error?: string }

// ── Public API ───────────────────────────────────────────────────────────────

export async function readClientNote(clientName: string): Promise<string | null> {
  if (!isNexusOnline()) return null;
  const path = await clientPath(clientName);
  if (!path) return null;
  try {
    const res = await emitToNexusWithAck<NexusFileResp>('nexus:read_file', { path }, 7000);
    return res.ok && res.content ? res.content : null;
  } catch {
    return null;
  }
}

export async function writeClientNote(clientName: string, content: string): Promise<boolean> {
  if (!isNexusOnline()) return false;
  const path = await clientPath(clientName);
  if (!path) return false;
  try {
    const res = await emitToNexusWithAck<NexusWriteResp>('nexus:write_file', { path, content }, 7000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listClientNotes(): Promise<string[]> {
  if (!isNexusOnline()) return [];
  const vault = await getVaultPath();
  if (!vault) return [];
  const dir = `${vault}\\Dzaryx\\clients`;
  try {
    const res = await emitToNexusWithAck<NexusListResp>('nexus:list_files', { path: dir, ext: '.md' }, 7000);
    return res.ok && res.files ? res.files.map(f => f.replace(/\.md$/, '')) : [];
  } catch {
    return [];
  }
}

export async function readNote(noteName: string): Promise<string | null> {
  if (!isNexusOnline()) return null;
  const path = await notePath(noteName);
  if (!path) return null;
  try {
    const res = await emitToNexusWithAck<NexusFileResp>('nexus:read_file', { path }, 7000);
    return res.ok && res.content ? res.content : null;
  } catch {
    return null;
  }
}

export async function writeNote(noteName: string, content: string): Promise<boolean> {
  if (!isNexusOnline()) return false;
  const path = await notePath(noteName);
  if (!path) return false;
  try {
    const res = await emitToNexusWithAck<NexusWriteResp>('nexus:write_file', { path, content }, 7000);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Client note builder ──────────────────────────────────────────────────────

export function buildClientNote(data: {
  name:         string;
  phone?:       string;
  status?:      'VIP' | 'FREQUENT' | 'REGULAR' | 'NEW';
  preferredCar?: string;
  totalRentals?: number;
  notes?:       string;
  lastRental?:  string;
}): string {
  const today = new Date().toLocaleDateString('fr-FR');
  return [
    `# ${data.name}`,
    ``,
    `Téléphone: ${data.phone ?? 'inconnu'}`,
    `Statut: ${data.status ?? 'REGULAR'}`,
    `Véhicule préféré: ${data.preferredCar ?? 'non défini'}`,
    `Total locations: ${data.totalRentals ?? 0}`,
    `Dernière location: ${data.lastRental ?? 'inconnue'}`,
    ``,
    `## Notes`,
    data.notes ?? '',
    ``,
    `---`,
    `Mis à jour: ${today}`,
  ].join('\n');
}
