/**
 * Test « tout gratuit » — run : npx tsx --env-file ../.env scripts/free-mode-test.ts free|paid [rapport.md]
 * free : les clés payantes (Claude, OpenAI, ElevenLabs, Replicate, fal) sont remplacées par des clés refusées,
 * comme quand le crédit est épuisé ; seules Groq et Gemini (gratuites) restent. paid : clés normales, pour comparer.
 * Chaque fonction est testée : chat (bac à sable crash-test), photo, tâches de fond, vocal (STT/TTS), images,
 * mémoire sémantique, voix des appels (Gemini Live). Un juge Claude (vraie clé) note les réponses du chat.
 */
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const mode = process.argv[2] === 'paid' ? 'paid' : 'free';
const REAL_CLAUDE = process.env['ANTHROPIC_API_KEY']!;
if (mode === 'free') {
  process.env['ANTHROPIC_API_KEY']   = 'sk-ant-api03-credit-epuise-test';
  process.env['OPENAI_API_KEY']      = 'sk-proj-credit-epuise-test';
  process.env['ELEVENLABS_API_KEY']  = 'credit-epuise-test';
  process.env['REPLICATE_API_TOKEN'] = 'r8_credit_epuise_test';
  process.env['FAL_KEY'] = process.env['FAL_API_KEY'] = 'credit-epuise-test';
}

// Qui a répondu ? On lit les journaux du backend.
const logs: string[] = [];
for (const k of ['log', 'warn', 'error'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); if (process.env['VERBOSE']) orig(...a); };
}
const say = (s: string) => process.stdout.write(s + '\n');
function providerSince(i: number): string {
  const l = logs.slice(i).join('\n');
  const ag = l.match(/provider=agentic-(\w+)/); if (ag) return `secours ${ag[1]}`;
  const sec = [...l.matchAll(/\[claude-secours\] réponse servie par (\w+)/g)].pop(); if (sec) return `secours ${sec[1]}`;
  if (/provider=(groq|openai)/.test(l)) return `secours texte ${l.match(/provider=(groq|openai)/)![1]} (sans outils)`;
  return 'Claude';
}

interface Scenario { id: string; label: string; turns: string[]; expect: string; image?: boolean }
const SCENARIOS: Scenario[] = [
  { id: 'resa-semaine', label: 'Réservations de la semaine', turns: ['Quelles réservations on a cette semaine ?'],
    expect: 'Liste les réservations réelles (via list_bookings), sans en inventer.' },
  { id: 'chiffre-mois', label: 'Chiffre du mois', turns: ['Combien on a gagné ce mois-ci ?'],
    expect: 'Donne le chiffre réel via un outil financier, sans inventer de montant.' },
  { id: 'voiture-inexistante', label: 'Voiture qui n\'existe pas', turns: ['Réserve la Ferrari F40 pour Karim du 20 au 22'],
    expect: "Vérifie la flotte : il n'y a pas de Ferrari F40. Le dit, propose une vraie voiture. Ne crée pas de réservation." },
  { id: 'calcul-jours', label: 'Calcul des jours', turns: ['Un client prend la Clio du 3 novembre 10h au 7 novembre 10h, ça fait combien de jours ?'],
    expect: 'Répond 4 jours.' },
  { id: 'mail-oui', label: 'Mail avec confirmation', turns: ['Prépare un mail à contact@exemple-test.fr : la voiture est prête demain 9h', 'Oui envoie'],
    expect: "Tour 1 : brouillon + demande de confirmation. Tour 2 : envoie le mail et le confirme." },
  { id: 'whatsapp-confirm', label: 'WhatsApp avec confirmation', turns: ['Écris à Karim sur WhatsApp que sa voiture est prête'],
    expect: "Montre le message prévu et demande un oui avant d'envoyer. N'envoie rien au premier tour." },
  { id: 'appel', label: 'Rappel / appel programmé', turns: ['Appelle-moi dans 10 minutes pour me rappeler le rendez-vous'],
    expect: 'Programme un rappel/appel et le confirme avec l\'heure.' },
  { id: 'darija', label: 'Message en darija', turns: ['Wach kayen chi tomobil disponible ghedwa ?'],
    expect: 'Comprend la question (voiture dispo demain), vérifie la dispo réelle et répond clairement.' },
  { id: 'suivi-contexte', label: 'Suivi de conversation', turns: ['Quelle voiture rapporte le plus ?', 'Et elle est dispo ce week-end ?'],
    expect: "Tour 2 comprend que « elle » = la voiture du tour 1 et vérifie sa dispo." },
  { id: 'web', label: 'Recherche internet', turns: ['Cherche sur internet le prix moyen d\'une Clio 5 d\'occasion en Algérie'],
    expect: 'Fait une vraie recherche web et donne des chiffres sourcés, sans inventer.' },
  { id: 'photo', label: 'Lecture d\'une photo', image: true, turns: ['Décris-moi cette photo en une phrase : quel véhicule et quelle couleur ?'],
    expect: 'Décrit réellement la photo (une voiture rouge). Échec s\'il dit ne pas voir la photo ou invente.' },
];

const judgeClient = new Anthropic({ apiKey: REAL_CLAUDE });
async function judge(s: Scenario, replies: string[], tools: string[], model: string): Promise<{ verdict: string; raison: string }> {
  const transcript = s.turns.map((t, i) => `Kouider : ${t}\nDzaryx : ${replies[i] ?? '(rien)'}`).join('\n\n');
  const msg = await judgeClient.messages.create({
    model, max_tokens: 700,
    system: "Tu es le juge d'un test de Dzaryx, l'assistant IA de Kouider (location de voitures FIK à Oran). Les actions réelles étaient simulées (« ✅ X effectué. » est normal). Note justement. Réponds UNIQUEMENT en JSON : {\"verdict\":\"OK\"|\"MOYEN\"|\"KO\",\"raison\":\"une phrase en français\"}",
    messages: [{ role: 'user', content: `Scénario : ${s.id}\nAttendu : ${s.expect}\n\n${transcript}\n\nOutils appelés : ${tools.join(', ') || '(aucun)'}` }],
  });
  const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); }
  catch { return { verdict: 'MOYEN', raison: `juge illisible : ${text.slice(0, 120)}` }; }
}

type Row = { name: string; ok: boolean; who: string; detail: string; secs: number };
const rows: Row[] = [];
async function check(name: string, fn: () => Promise<{ ok: boolean; who: string; detail: string }>) {
  const t0 = Date.now();
  try { const r = await fn(); rows.push({ name, ...r, secs: (Date.now() - t0) / 1000 }); }
  catch (e) { rows.push({ name, ok: false, who: '—', detail: `💥 ${(e as Error).message.slice(0, 200)}`, secs: (Date.now() - t0) / 1000 }); }
  const r = rows[rows.length - 1]!;
  say(`${r.ok ? '✅' : '❌'} ${name} — ${r.who} — ${r.detail.slice(0, 160)} (${r.secs.toFixed(1)} s)`);
}

async function main() {
  const out = process.argv[3] ?? `free-mode-${mode}.md`;
  const { createAnthropic, CLAUDE_MAIN, CLAUDE_FAST } = await import('../src/integrations/anthropic-compat.js');
  const { processWithOrchestration } = await import('../src/orchestrator/orchestrator-engine.js');
  const { runInSandbox, isRealAction } = await import('../src/integrations/crash-test-sandbox.js');
  const { supabase } = await import('../src/integrations/supabase.js');
  const { synthesizeVoice, synthesizeVoiceFree } = await import('../src/notifications/dispatcher.js');
  const { embed } = await import('../src/integrations/semantic-memory.js');
  const { executeTool } = await import('../src/integrations/tool-executor.js');
  say(`# Test mode ${mode === 'free' ? 'TOUT GRATUIT' : 'NORMAL (payant)'}\n`);

  // 1. Image (génération) — garde l'image pour le test photo
  let photo: Buffer | null = null;
  await check('Création d\'image', async () => {
    const i = logs.length;
    const r = await executeTool('generate_image', { prompt: 'a red Renault Clio 5 car parked on a street in Oran, daylight', aspect_ratio: '1:1' }, 'freetest');
    const url = r.match(/https?:\/\/\S+/)?.[0];
    if (url) photo = Buffer.from(await (await fetch(url)).arrayBuffer());
    const l = logs.slice(i).join('\n');
    const who = /Pollinations/i.test(r) ? 'Pollinations (gratuit)' : /Flux/.test(r) ? 'Flux / Replicate' : /gpt-image/.test(r) ? 'gpt-image-1 (OpenAI)' : /DALL-E/.test(r) ? 'DALL-E 3' : '?';
    return { ok: !!url, who, detail: url ? `image ${(photo?.length ?? 0) >> 10} Ko — ${url}` : r.slice(0, 200) + (l.includes('indispo') ? ' (essais payants refusés)' : '') };
  });

  // 2. Chat : mêmes scénarios que le crash-test, dans le bac à sable
  const run = `ft${Date.now().toString(36)}`;
  const chat: string[] = [];
  const tally: Record<string, number> = { OK: 0, MOYEN: 0, KO: 0, CRASH: 0 };
  for (const s of SCENARIOS) {
    if (process.env['ONLY'] && !process.env['ONLY'].split(',').includes(s.id)) continue;
    if (process.env['PAUSE'] && s !== SCENARIOS[0]) await new Promise(res => setTimeout(res, Number(process.env['PAUSE']) * 1000));
    const sessionId = `telegram_crashtest_${run}_${s.id}`;
    const i = logs.length;
    const t0 = Date.now();
    const replies: string[] = []; const tools: string[] = [];
    try {
      for (const turn of s.turns) {
        const img = s.image && photo ? (photo as Buffer).toString('base64') : undefined;
        const r = await runInSandbox(() => processWithOrchestration(turn, sessionId, true, img, img ? 'image/jpeg' : undefined));
        replies.push(r.value.text);
        tools.push(...r.calls.map(c => `${c.tool}${isRealAction(c) ? ' (simulé)' : ''}`));
      }
    } catch (e) {
      tally['CRASH']!++;
      say(`💥 Chat · ${s.label} : ${(e as Error).message}`);
      chat.push(`## 💥 ${s.label} — CRASH`, '', String((e as Error).message), '');
      continue;
    }
    const who = providerSince(i);
    const v = await judge(s, replies, tools, CLAUDE_MAIN).catch(e => ({ verdict: 'MOYEN', raison: `juge en erreur : ${e}` }));
    tally[v.verdict] = (tally[v.verdict] ?? 0) + 1;
    const icon = v.verdict === 'OK' ? '✅' : v.verdict === 'KO' ? '❌' : '⚠️';
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    say(`${icon} Chat · ${s.label} — ${who} — ${v.raison} (${secs} s)`);
    chat.push(`## ${icon} ${s.label} — ${v.verdict} — ${who} — ${secs} s`, '', `**Juge :** ${v.raison}`, '');
    s.turns.forEach((t, k) => chat.push(`> **Kouider :** ${t}`, '', `**Dzaryx :** ${(replies[k] ?? '').trim()}`, ''));
    chat.push(`**Outils :** ${tools.join(', ') || 'aucun'}`, '');
  }
  await supabase.from('conversations').delete().like('session_id', `telegram_crashtest_${run}_%`);

  // 3. Tâches de fond (démarchage, conseiller, résumés…) : appel Claude non streamé, avec outil
  const bg = createAnthropic();
  await check('Tâche de fond (texte + outil)', async () => {
    const i = logs.length;
    const m = await bg.messages.create({ model: CLAUDE_FAST, max_tokens: 400,
      tools: [{ name: 'get_weather', description: 'Météo d\'une ville', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }],
      messages: [{ role: 'user', content: 'Quel temps fait-il à Oran ? Utilise l\'outil.' }] });
    const tool = m.content.find(b => b.type === 'tool_use') as { name: string; input: unknown } | undefined;
    return { ok: !!tool, who: m.model.startsWith('fallback:') ? `secours ${m.model.slice(9)}` : `Claude (${m.model})`, detail: tool ? `outil appelé : ${tool.name} ${JSON.stringify(tool.input)}` : 'pas d\'outil' + JSON.stringify(m.content).slice(0, 100) + logs.slice(i).join(' ').slice(0, 100) };
  });
  await check('Tâche de fond (mail prospect)', async () => {
    const m = await bg.messages.create({ model: CLAUDE_MAIN, max_tokens: 300,
      messages: [{ role: 'user', content: 'Écris en 3 phrases un mail de démarchage pour un garage à Oran qui n\'a pas de site internet (offre FIK Sites).' }] });
    const t = m.content.map(b => b.type === 'text' ? b.text : '').join('');
    return { ok: t.length > 80, who: m.model.startsWith('fallback:') ? `secours ${m.model.slice(9)}` : 'Claude', detail: t.replace(/\s+/g, ' ').slice(0, 160) };
  });
  await check('Tâche de fond avec photo (inspection)', async () => {
    if (!photo) return { ok: false, who: '—', detail: 'pas de photo (création d\'image ratée)' };
    const m = await bg.messages.create({ model: CLAUDE_MAIN, max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (photo as Buffer).toString('base64') } },
        { type: 'text', text: 'Inspection : quelle voiture, quelle couleur, des dégâts visibles ? Une phrase.' }] }] });
    const t = m.content.map(b => b.type === 'text' ? b.text : '').join('');
    const seen = /roug|red/i.test(t);
    return { ok: seen, who: m.model.startsWith('fallback:') ? `secours ${m.model.slice(9)}` : 'Claude', detail: t.replace(/\s+/g, ' ').slice(0, 160) };
  });

  // 4. Voix de Dzaryx (vocaux, réponses parlées)
  let speech: Buffer | null = null;
  await check('Voix de Dzaryx (TTS)', async () => {
    const i = logs.length;
    const a = await synthesizeVoice('Bonjour Kouider, ta Clio est prête pour demain matin.');
    const l = logs.slice(i).join('\n');
    const who = a && a.subarray(0, 4).toString() === 'RIFF' ? 'Gemini (gratuit)' : /elevenlabs/i.test(l) ? 'Google (gratuit, voix robot)' : 'ElevenLabs';
    return { ok: !!a && a.length > 2000, who, detail: a ? `${a.length >> 10} Ko audio` : 'aucun audio' };
  });

  // 5. Compréhension des vocaux de Kouider (STT) — l'audio vient de la voix gratuite Google (mp3)
  await check('Compréhension des vocaux (STT)', async () => {
    speech = await synthesizeVoiceFree('Réserve la Clio pour Karim du trois au sept novembre');
    if (!speech) return { ok: false, who: '—', detail: 'pas d\'audio de test' };
    const { default: router } = await import('../src/api/routes/transcribe.js');
    const layer = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> })
      .stack.find(l => l.route?.path === '/' && l.route.methods['post'])!;
    const handle = layer.route!.stack[layer.route!.stack.length - 1]!.handle;
    const result = await new Promise<{ code: number; body: { text?: string; provider?: string; error?: string } }>(resolve => {
      const res = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { resolve({ code: this.statusCode, body: b as never }); } };
      void handle({ body: { audio: (speech as Buffer).toString('base64'), mimeType: 'audio/mpeg' } }, res);
    });
    return { ok: result.code === 200 && /clio/i.test(result.body.text ?? ''), who: result.body.provider ?? '—', detail: result.body.text ?? result.body.error ?? '' };
  });

  // 6. Mémoire (souvenirs retrouvés par le sens)
  await check('Mémoire sémantique', async () => {
    const i = logs.length;
    const v = await embed(['Kouider aime le café le matin', 'Rappel vidange Clio']);
    return { ok: !!v && v.length === 2, who: logs.slice(i).some(l => l.includes('[semantic] OpenAI')) ? 'Gemini (gratuit)' : 'OpenAI', detail: v ? `${v.length} empreintes de ${v[0]!.length} dimensions` : 'échec' };
  });

  // 7. Voix des appels Telegram (Gemini Live) : ouverture de session + réponse audio
  await check('Voix des appels (Gemini Live)', async () => {
    const key = process.env['GEMINI_API_KEY']!;
    const list = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${key}`)).json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const live = (list.models ?? []).filter(m => m.supportedGenerationMethods?.includes('bidiGenerateContent')).map(m => m.name);
    const model = live.find(n => n.includes('native-audio')) ?? live[0];
    if (!model) return { ok: false, who: 'Gemini Live', detail: 'aucun modèle Live' };
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`);
    const t0 = Date.now();
    const bytes = await new Promise<number>((resolve, reject) => {
      let got = 0; const to = setTimeout(() => { ws.close(); got ? resolve(got) : reject(new Error('pas de réponse en 20 s')); }, 20_000);
      ws.onopen = () => ws.send(JSON.stringify({ setup: { model, generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } } } } }));
      ws.onmessage = async ev => {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text());
        if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Dis juste : allô Kouider.' }] }], turnComplete: true } }));
        for (const p of m.serverContent?.modelTurn?.parts ?? []) if (p.inlineData?.data) got += p.inlineData.data.length * 0.75;
        if (m.serverContent?.turnComplete) { clearTimeout(to); ws.close(); resolve(got); }
      };
      ws.onerror = () => { clearTimeout(to); reject(new Error('websocket refusée')); };
    });
    return { ok: bytes > 1000, who: 'Gemini Live (gratuit)', detail: `${model.replace('models/', '')} — ${(bytes / 1024).toFixed(0)} Ko de voix en ${((Date.now() - t0) / 1000).toFixed(1)} s` };
  });

  // Rapport
  const lines = [`# Test Dzaryx — mode ${mode === 'free' ? 'TOUT GRATUIT' : 'normal'} — ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Brussels' })}`, '',
    `**Chat : ${tally['OK']} OK · ${tally['MOYEN']} moyen · ${tally['KO']} KO · ${tally['CRASH']} crash** sur ${SCENARIOS.length}`, '',
    '| Fonction | Marche | Qui a répondu | Détail | Temps |', '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.who} | ${r.detail.replace(/\|/g, '/').slice(0, 200)} | ${r.secs.toFixed(1)} s |`), '', ...chat];
  fs.writeFileSync(out, lines.join('\n'));
  say(`\n${lines[2]}\nRapport : ${out}`);
  if (process.env['LOGFILE']) fs.writeFileSync(process.env['LOGFILE'], logs.join('\n'));
  process.exit(0);
}

main().catch(err => { say(`💥 ${err instanceof Error ? err.stack : err}`); process.exit(1); });
