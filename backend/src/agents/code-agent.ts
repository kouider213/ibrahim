import Anthropic from '@anthropic-ai/sdk';
import { getFileContent, updateFile, listDirectory } from '../integrations/github.js';
import { sendMessage as sendTelegram } from '../integrations/telegram.js';
import { waitForDeploy } from '../integrations/railway.js';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const AGENT_SYSTEM = `Tu es un agent de développement expert TypeScript/Node.js/React.
Tu travailles sur le projet Dzaryx — assistant IA pour Fik Conciergerie Oran.

STACK:
- Backend: Node.js + TypeScript strict + Express + BullMQ + Supabase + ioredis
- Frontend: React + Vite (mobile/src/)
- Déploiement: Railway (backend auto-deploy) + Netlify (frontend)
- Repo GitHub: ibrahim (owner: kouider213)

FICHIERS CLÉS (toujours lire avant modifier):
- backend/src/integrations/tools.ts         → définitions des outils Dzaryx
- backend/src/integrations/tool-executor.ts → switch/case des outils
- backend/src/queue/scheduler.ts            → jobs cron BullMQ
- backend/src/queue/jobs/proactive-jobs.ts  → logique des jobs
- backend/src/config/constants.ts           → system prompt Dzaryx
- backend/src/config/env.ts                 → variables d'environnement
- backend/src/index.ts                      → serveur Express + routes

RÈGLES TYPESCRIPT ABSOLUES:
- Imports TOUJOURS en .js: import x from './module.js' (jamais .ts)
- Callbacks TOUJOURS typés: (item: Type) pas (item)
- async/await: toute fonction qui await doit être déclarée async
- Supabase: try/catch obligatoire, jamais .catch() sur queries
- Nouveau tool tools.ts → case OBLIGATOIRE dans tool-executor.ts
- Variables non utilisées → supprimer ou préfixer _
- tool-executor: retourner TOUJOURS string (JSON.stringify si objet)
- Optional chaining: utiliser ?. si valeur peut être undefined/null

PROCÉDURE OBLIGATOIRE:
1. list_files pour explorer la structure si besoin
2. read_file sur CHAQUE fichier à modifier (copie l'extrait EXACT pour apply_patch)
3. apply_patch pour modifications chirurgicales (old_string copié MOT POUR MOT)
4. create_file uniquement pour les nouveaux fichiers
5. verify_deploy après TOUS les changements → attendre Railway
6. Si ERREUR TypeScript dans les logs → re-patcher → re-vérifier
7. Ne JAMAIS abandonner sur une erreur — corriger jusqu'au ✅

POUR LES NOUVEAUX PROJETS (sites clients):
- Créer les fichiers dans un nouveau dossier client/ ou dans le repo cible
- Stack recommandée: HTML/CSS/JS vanilla (rapide) ou React+Vite (complexe)
- Toujours inclure: index.html, styles.css, fichier JS principal
- Déploiement: utiliser Netlify via NETLIFY_TOKEN déjà configuré`;

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Lire un fichier GitHub. OBLIGATOIRE avant tout apply_patch — copier l\'extrait exact depuis ce résultat.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin ex: backend/src/integrations/tools.ts' },
        repo: { type: 'string', description: 'Repo: ibrahim (défaut), autolux-location, fik-conciergerie' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'Lister les fichiers dans un répertoire GitHub.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin du répertoire (vide = racine)' },
        repo: { type: 'string', description: 'Repo: ibrahim (défaut)' },
      },
      required: [],
    },
  },
  {
    name: 'apply_patch',
    description: 'Modifier CHIRURGICALEMENT un fichier: remplace un extrait précis. old_string doit être copié MOT POUR MOT depuis read_file (espaces + indentation inclus). Doit être unique dans le fichier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:       { type: 'string',  description: 'Chemin du fichier à patcher' },
        repo:       { type: 'string',  description: 'Repo: ibrahim (défaut)' },
        old_string: { type: 'string',  description: 'Extrait EXACT à remplacer (copié depuis read_file)' },
        new_string: { type: 'string',  description: 'Nouveau texte qui remplace old_string' },
        message:    { type: 'string',  description: 'Message de commit' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'create_file',
    description: 'Créer un NOUVEAU fichier (inexistant). Pour fichiers existants, utiliser apply_patch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:    { type: 'string', description: 'Chemin du nouveau fichier' },
        repo:    { type: 'string', description: 'Repo: ibrahim (défaut)' },
        content: { type: 'string', description: 'Contenu complet du fichier' },
        message: { type: 'string', description: 'Message de commit' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'verify_deploy',
    description: 'OBLIGATOIRE après tous les patches — attend Railway et retourne ✅ succès ou ❌ erreur avec logs TypeScript. Si erreur → lire les logs → corriger avec apply_patch → re-appeler verify_deploy.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

async function runTool(
  name: string,
  input: Record<string, unknown>,
  chatId: string,
): Promise<string> {
  const repo = (input['repo'] as string | undefined) ?? 'ibrahim';

  switch (name) {
    case 'read_file': {
      const result = await getFileContent(input['path'] as string, repo);
      if (!result) return `❌ Fichier non trouvé: ${input['path']} dans ${repo}`;
      return result.content;
    }

    case 'list_files': {
      const path  = (input['path'] as string | undefined) ?? '';
      const files = await listDirectory(path, repo);
      if (!files.length) return `Répertoire vide ou non trouvé: ${path || '/'}`;
      return files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n');
    }

    case 'apply_patch': {
      const path      = input['path']       as string;
      const oldString = input['old_string'] as string;
      const newString = input['new_string'] as string;
      const message   = (input['message']   as string | undefined) ?? 'patch: code agent edit';

      const file = await getFileContent(path, repo);
      if (!file) return `❌ Fichier non trouvé: ${path}`;

      const occurrences = file.content.split(oldString).length - 1;
      if (occurrences === 0) {
        return `❌ Extrait non trouvé dans ${path}.\nUtilise read_file pour récupérer l'extrait exact (indentation incluse).`;
      }
      if (occurrences > 1) {
        return `❌ Extrait trouvé ${occurrences} fois — ambigu.\nAjoute des lignes de contexte pour le rendre unique.`;
      }

      const newContent  = file.content.replace(oldString, newString);
      const writeResult = await updateFile(path, newContent, message, repo);
      if (!writeResult) return `❌ Impossible de commiter ${path}`;

      const preview = oldString.split('\n')[0]?.trim().slice(0, 50) ?? '';
      await sendTelegram(chatId, `🔧 _Patch → ${path}_\n\`${preview}...\``);
      return `✅ Patch appliqué dans ${path} (commit: ${writeResult.commitSha})`;
    }

    case 'create_file': {
      const path    = input['path']    as string;
      const content = input['content'] as string;
      const message = (input['message'] as string | undefined) ?? 'feat: new file';

      const writeResult = await updateFile(path, content, message, repo);
      if (!writeResult) return `❌ Impossible de créer ${path}`;

      await sendTelegram(chatId, `📄 _Créé → ${path}_`);
      return `✅ Fichier créé: ${path} (commit: ${writeResult.commitSha})`;
    }

    case 'verify_deploy': {
      await sendTelegram(chatId, `⏳ _Vérification déploiement Railway..._`);
      const result = await waitForDeploy(240_000);
      await sendTelegram(chatId, result.startsWith('✅') ? result : `❌ ${result}`);
      return result;
    }

    default:
      return `Outil inconnu: ${name}`;
  }
}

export async function runCodeAgent(
  task:   string,
  chatId: string,
  repo    = 'ibrahim',
): Promise<void> {
  await sendTelegram(chatId,
    `🤖 *Code Agent démarré*\n_Tâche: ${task.slice(0, 120)}_\n\n⏳ En cours...`);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Repo cible: ${repo}\n\nTâche: ${task}` },
  ];

  const MAX = 30;

  for (let i = 0; i < MAX; i++) {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8096,
      system:     AGENT_SYSTEM,
      tools:      AGENT_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      await sendTelegram(chatId, `✅ *Code Agent terminé*\n\n${text.slice(0, 600)}`);
      return;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const result = await runTool(block.name, block.input as Record<string, unknown>, chatId);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  await sendTelegram(chatId,
    `⚠️ Code Agent: limite d'itérations atteinte. Vérifie l'état du repo sur GitHub.`);
}
