// Piloter le PC (Nexus) depuis le téléphone : appels Telegram, app, Telegram écrit.
// + mise à jour automatique de Nexus quand le PC se rallume avec une version en retard.
import { env } from '../config/env.js';
import { kvGet, kvSet } from './app-store.js';
import {
  isNexusOnline, isLauncherOnline, wakeNexus, triggerWol, nexusCommandSync,
  nexusScreenshotJpeg, nexusSysinfo, nexusRunCommand, getLauncherStatus,
} from '../actions/handlers/nexus-relay.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

const REPO = `${env.GITHUB_OWNER ?? 'kouider213'}/${env.GITHUB_DEFAULT_REPO ?? 'ibrahim'}`;
const AUTO_UPDATE_KEY = 'nexus:autoupdate';          // « off » = jamais de mise à jour automatique
const AUTO_UPDATE_LAST = 'nexus:autoupdate:last';    // dernier commit visé (pas de boucle si échec)

// Actions qui ne se défont pas (ou coupent le PC) : relecture + oui avant de les faire
const RISKY = /(?:[eé]teins|arr[eê]te|ferme|red[eé]marre|reboot)\s+(?:le\s+)?(?:pc|ordi)|en\s+veille|corbeille|supprime|efface|d[eé]sinstalle|formate|tue\s+|kill/i;

async function lastSeenText(): Promise<string> {
  try {
    const last = JSON.parse((await kvGet('nexus:last_seen')) ?? '{}') as { at?: string };
    if (!last.at) return '';
    const d = new Date(last.at).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', hour: '2-digit', minute: '2-digit' });
    return ` Dernière connexion : ${d}.`;
  } catch { return ''; }
}

/** Commande en français pour le PC, avec la réponse de Nexus. */
export async function pcCommand(input: Record<string, unknown>): Promise<string> {
  const command = String(input['command'] ?? '').trim();
  if (!command) return 'Quelle commande pour le PC ?';
  if (!isNexusOnline()) return `Le PC n'est pas connecté.${await lastSeenText()} Dis « réveille le PC » pour essayer de le rallumer.`;
  if (RISKY.test(command) && input['confirmed'] !== true) {
    return `Pas encore fait : relis-lui « ${command} » et attends son oui, puis rappelle l'outil avec confirmed:true.`;
  }
  const r = await nexusCommandSync(command, Number(input['wait_s']) || 20);
  if (!r.ok) return `Nexus n'a pas réussi : ${r.error ?? 'erreur inconnue'}.`;
  if (r.legacy) return 'Commande envoyée au PC (ancienne version de Nexus : le résultat arrivera en notification). Dis « mets à jour Nexus » pour avoir les réponses directes.';
  if (!r.done) return `${r.text ? `${r.text}\n` : ''}C'est en cours sur le PC, le résultat arrivera en notification.`;
  return r.text || 'Fait sur le PC.';
}

export async function pcStatus(): Promise<string> {
  const nexus = isNexusOnline();
  const launcher = isLauncherOnline();
  if (!nexus && !launcher) return `Le PC est éteint, en veille ou sans internet.${await lastSeenText()}`;
  const parts = [nexus ? 'Nexus est connecté' : 'Le PC est allumé mais Nexus est arrêté (dis « réveille Nexus »)'];
  if (launcher) {
    const st = await getLauncherStatus().catch(() => ({} as Record<string, unknown>));
    if (st['hostname']) parts.push(`PC ${String(st['hostname'])}`);
    if (st['uptime']) parts.push(`allumé depuis ${String(st['uptime'])}`);
  }
  if (nexus) {
    const behind = await nexusBehind().catch(() => null);
    if (behind?.files.length) parts.push(`Nexus a une mise à jour en attente (${behind.files.length} fichiers)`);
  }
  return `${parts.join(', ')}.`;
}

/** Réveiller : Nexus arrêté → Launcher ; PC en veille/éteint → paquet de réveil réseau (si la box le laisse passer). */
export async function pcWake(): Promise<string> {
  if (isNexusOnline()) return 'Le PC et Nexus sont déjà allumés.';
  if (isLauncherOnline()) {
    const r = await wakeNexus().catch(e => ({ success: false, message: (e as Error).message }));
    return r.success ? 'Nexus démarre sur le PC, il sera là dans quelques secondes.' : `Le PC est allumé mais Nexus ne démarre pas : ${r.message}`;
  }
  const wol = await triggerWol().catch(() => ({ sent: false, mac: '', ip: '' }));
  const tip = 'Astuce : avant de partir, dis « mets le PC en veille et réveille-le demain à 8h » : il se rallumera tout seul à l\'heure dite.';
  if (!wol.sent) return `Le PC est éteint ou en veille et je n'ai pas son adresse réseau pour le réveiller.${await lastSeenText()} ${tip}`;
  return `Le PC dort. J'ai envoyé le signal de réveil à ta box : s'il est en veille et que la box le laisse passer, Nexus revient dans une minute (je te préviens).${await lastSeenText()} ${tip}`;
}

export async function pcLookJpeg(): Promise<{ ok: boolean; image?: string; error?: string }> {
  if (!isNexusOnline()) return { ok: false, error: 'PC pas connecté' };
  const r = await nexusScreenshotJpeg(60, 0.5, 20_000).catch(e => ({ ok: false, error: (e as Error).message } as const));
  return r.ok && 'image_base64' in r && r.image_base64 ? { ok: true, image: r.image_base64 } : { ok: false, error: ('error' in r && r.error) || 'capture vide' };
}

export async function pcScreenToTelegram(actor = 'kouider'): Promise<string> {
  if (!isNexusOnline()) return `Le PC n'est pas connecté.${await lastSeenText()}`;
  const r = await nexusScreenshotJpeg(70, 0.75, 25_000).catch(() => null);
  if (!r?.ok || !r.image_base64) return 'La capture d\'écran du PC a échoué.';
  await queueTelegramMessage(`🖥️ Écran du PC — ${new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' })}`, r.image_base64, actor);
  return 'Capture de l\'écran du PC envoyée sur Telegram.';
}

// ── Mise à jour automatique ──────────────────────────────────────────────────

/** Fichiers de nexus/ modifiés sur GitHub depuis la version installée sur le PC. */
export async function nexusBehind(): Promise<{ pcSha: string; mainSha: string; files: string[] } | null> {
  const info = await nexusSysinfo();
  if (!info.ok || !info.cwd) return null;
  const head = await nexusRunCommand('git rev-parse HEAD', info.cwd, 20_000);
  const pcSha = head.ok ? head.stdout.trim().split(/\s+/)[0] ?? '' : '';
  if (!/^[0-9a-f]{40}$/.test(pcSha)) return null;
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/compare/${pcSha}...main`, { headers });
  if (!res.ok) return null;
  const data = await res.json() as { status?: string; files?: Array<{ filename: string }>; commits?: Array<{ sha: string }> };
  const mainSha = data.commits?.at(-1)?.sha ?? pcSha;
  const files = data.status === 'ahead' || data.status === 'diverged'
    ? (data.files ?? []).map(f => f.filename).filter(f => f.startsWith('nexus/'))
    : [];
  return { pcSha, mainSha, files };
}

let _autoUpdating = false;
let _lastCheck = 0;

export async function onNexusRegistered(): Promise<void> {
  if (_autoUpdating || Date.now() - _lastCheck < 10 * 60_000) return;   // une vérification par 10 min (reconnexions Railway)
  _lastCheck = Date.now();
  if ((await kvGet(AUTO_UPDATE_KEY).catch(() => null)) === 'off') return;
  _autoUpdating = true;
  try {
    await new Promise(r => setTimeout(r, 15_000));                     // laisser Nexus finir de démarrer
    if (!isNexusOnline()) return;
    const behind = await nexusBehind();
    if (!behind?.files.length) return;
    if ((await kvGet(AUTO_UPDATE_LAST).catch(() => null)) === behind.mainSha) return;   // déjà tenté (échec) pour cette version
    await kvSet(AUTO_UPDATE_LAST, behind.mainSha, 7 * 24 * 3600);
    console.log(`[NEXUS] auto-update ${behind.pcSha.slice(0, 7)} → ${behind.mainSha.slice(0, 7)} (${behind.files.length} fichiers)`);
    const { executeTool } = await import('./tool-executor.js');
    const result = await executeTool('update_nexus', {}, 'nexus_autoupdate');
    const ok = !/arrêtée|impossible|❌/.test(result);
    const text = `🖥️ PC rallumé — ${ok ? 'Nexus mis à jour automatiquement ✅' : 'la mise à jour automatique de Nexus a échoué ❌'}\n\n${result.replace(/\*\*/g, '')}`;
    emitProactive(text.slice(0, 120), ok ? 'info' : 'alert', text, 'kouider');
    await queueTelegramMessage(text);
  } catch (err) {
    console.error('[NEXUS] auto-update:', err instanceof Error ? err.message : err);
  } finally {
    _autoUpdating = false;
  }
}
