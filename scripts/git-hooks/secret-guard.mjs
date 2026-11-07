#!/usr/bin/env node
/**
 * Garde-fou anti-fuite (pre-commit) — le repo est PUBLIC.
 * Veille 07/11 : Hermes Agent v0.21 demande une validation avant d'écrire dans les fichiers protégés et le SDK
 * Claude Agent ajoute `onFailure: "block"` : même idée ici, l'atelier de nuit (Claude Code autonome) ou une séance
 * de dev ne peut plus committer un secret ou une donnée de santé par erreur.
 *
 * Bloque le commit si les lignes AJOUTÉES contiennent :
 *  1. une vraie valeur des fichiers .env du VPS (comparaison exacte, jamais affichée) qui n'est pas déjà dans le repo ;
 *  2. un mot de PRIVATE_MED_TERMS (noms privés, lus dans l'env, jamais écrits dans le code) ;
 *  3. une forme connue de clé (Anthropic, OpenAI, GitHub, Google, Slack, HF, Replicate, JWT, clé privée…) ;
 * ou si un fichier .env / credentials / clé privée est ajouté.
 * Faux positif assumé : ajoute `secret-guard:ok` sur la ligne. Contourner avec --no-verify est INTERDIT à l'atelier.
 * Usage manuel : node scripts/git-hooks/secret-guard.mjs [--test | --range HEAD~50..HEAD]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ROOT = git('rev-parse', '--show-toplevel').trim();

const ENV_FILES = ['.env', 'backend/.env', 'tgcall/.env', 'mobile/.env', 'mobile/.env.production', 'nexus/.env'];
// Valeurs d'env qui ne sont pas des secrets (réglages, URLs publiques, identifiants publics)
const NOT_SECRET_NAME = /^(PORT|NODE_ENV|JOBS_ENABLED|.*_URL|.*_OWNER|.*_REPO|GITHUB_DEFAULT_REPO|.*_VOICE_ID|.*_TEAM_ID|.*_MODEL|TZ|LANG|TG_DEBUG|PRIVATE_MED_TERMS)$/;

export const PATTERNS = [
  ['clé Anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['clé OpenAI', /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['jeton GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['clé Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['jeton Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['jeton Hugging Face', /\bhf_[A-Za-z0-9]{30,}/],
  ['jeton Replicate', /\br8_[A-Za-z0-9]{30,}/],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['clé privée', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['jeton JWT (clé Supabase ?)', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/],
  ['jeton bot Telegram', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/],
];
export const BAD_FILE = /(^|\/)(\.env(\.(?!example$|sample$)[\w.-]+)?|[^/]*credentials[^/]*\.json|id_(rsa|ed25519|ecdsa)|[^/]*\.(pem|p12|pfx|key)|\.git-credentials|tg_session[^/]*|[^/]*\.session)$/i;

function parseEnv(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    out.push([m[1], v]);
  }
  return out;
}

function loadSecrets() {
  const secrets = new Map();   // valeur → nom de variable
  let med = [];
  for (const f of ENV_FILES) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const [name, v] of parseEnv(p)) {
      if (name === 'PRIVATE_MED_TERMS') { med = med.concat(v.split(',').map(s => s.trim()).filter(s => s.length >= 3)); continue; }
      const creds = v.match(/^[a-z]+:\/\/[^/@\s]*:([^@\s]{8,})@/i);   // redis://user:MOTDEPASSE@host → le mot de passe est secret
      if (creds) { secrets.set(creds[1], name); continue; }
      if (NOT_SECRET_NAME.test(name) || v.length < 12 || /^(true|false|\d+)$/i.test(v) || /^[a-z]+:\/\//i.test(v)) continue;
      secrets.set(v, name);
    }
  }
  if (process.env.PRIVATE_MED_TERMS) med = med.concat(process.env.PRIVATE_MED_TERMS.split(',').map(s => s.trim()).filter(s => s.length >= 3));
  return { secrets, med: [...new Set(med.map(s => s.toLowerCase()))] };
}

/** Lignes ajoutées du diff indexé : [{ file, line, text }] */
export function addedLines(diff) {
  const out = []; let file = null; let ln = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); continue; }
    const h = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/); if (h) { ln = Number(h[1]); continue; }
    if (raw.startsWith('+')) { out.push({ file, line: ln, text: raw.slice(1) }); ln++; }
  }
  return out;
}

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Problèmes trouvés (sans jamais recopier la valeur). alreadyTracked(v) = la valeur est déjà dans le repo (acceptée avant). */
export function scan(lines, files, { secrets, med }, alreadyTracked = () => false) {
  const issues = [];
  for (const f of files) if (BAD_FILE.test(f)) issues.push(`${f} : fichier secret (.env / clé / session) — ne jamais le committer`);
  const medRe = med.length ? new RegExp(`(^|[^a-z0-9])(${med.map(m => norm(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z0-9]|$)`) : null;
  const known = [...secrets.entries()];
  const trackedCache = new Map();
  const isTracked = v => { if (!trackedCache.has(v)) trackedCache.set(v, alreadyTracked(v)); return trackedCache.get(v); };
  for (const { file, line, text } of lines) {
    if (!file || /secret-guard:ok/.test(text)) continue;
    const at = `${file}:${line}`;
    for (const [v, name] of known) if (text.includes(v) && !isTracked(v)) issues.push(`${at} : valeur réelle de ${name} (fichier .env)`);
    for (const [label, re] of PATTERNS) {
      const m = text.match(re);
      if (m && !isTracked(m[0])) issues.push(`${at} : ${label}`);
    }
    if (medRe && medRe.test(norm(text))) issues.push(`${at} : nom privé (PRIVATE_MED_TERMS) — donnée de santé, repo public`);
  }
  return [...new Set(issues)];
}

function selfTest() {
  const ctx = { secrets: new Map([['zz-real-secret-value-123456', 'FAKE_API_KEY']]), med: ['medicx'] };
  const fakeAnt = 'sk-ant-' + 'a'.repeat(30);
  const lines = addedLines([
    '+++ b/backend/src/a.ts', '@@ -1,0 +1,5 @@',
    `+const k = "zz-real-secret-value-123456";`, `+const a = "${fakeAnt}";`, '+// je prends du Médicx le matin', '+const ok = 1;', `+const t = "${fakeAnt}"; // secret-guard:ok`,
  ].join('\n'));
  const r = scan(lines, ['backend/src/a.ts', 'tgcall/.env', 'backend/.env.example'], ctx);
  const expect = [/tgcall\/\.env/, /a\.ts:1 : valeur réelle de FAKE_API_KEY/, /a\.ts:2 : clé Anthropic/, /a\.ts:3 : nom privé/];
  const bad = expect.filter(e => !r.some(x => e.test(x)));
  const extra = r.filter(x => /a\.ts:[45]|\.env\.example/.test(x));
  const r2 = scan(lines.slice(0, 1), [], ctx, v => v === 'zz-real-secret-value-123456');
  if (bad.length || extra.length || r2.length) { console.error('❌ auto-test secret-guard', { r, bad, extra, r2 }); process.exit(1); }
  console.log(`✅ auto-test secret-guard OK (${r.length} problèmes attendus trouvés, 0 faux positif)`);
}

function main() {
  if (process.argv.includes('--test')) return selfTest();
  const ri = process.argv.indexOf('--range');   // audit manuel : node secret-guard.mjs --range HEAD~50..HEAD
  if (ri > 0) {
    const range = process.argv[ri + 1];
    const issues = scan(addedLines(git('diff', '-U0', '--no-color', '--no-ext-diff', range)), git('diff', '--name-only', '--diff-filter=ACMR', range).split('\n').filter(Boolean), loadSecrets());
    for (const i of issues) console.log('  • ' + i);
    console.log(issues.length ? `${issues.length} problème(s) dans ${range}` : `✅ rien dans ${range}`);
    if (issues.length) process.exitCode = 1;
    return;
  }
  const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
  if (!files.length) return;
  const diff = git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR');
  const ctx = loadSecrets();
  const tracked = v => { try { execFileSync('git', ['grep', '-q', '-F', '-e', v, 'HEAD', '--'], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };
  const issues = scan(addedLines(diff), files, ctx, tracked);
  if (!issues.length) return;
  console.error('\n🛑 COMMIT BLOQUÉ par le garde-fou anti-fuite (repo PUBLIC) :');
  for (const i of issues.slice(0, 30)) console.error('  • ' + i);
  console.error('\n→ Enlève la valeur (mets-la dans .env / Railway et lis process.env.X), puis recommence.');
  console.error('→ Faux positif certain : ajoute « secret-guard:ok » en commentaire sur la ligne. Jamais --no-verify.\n');
  process.exit(1);
}
main();
