import { Router } from 'express';
import { z } from 'zod';
import { processMessage } from '../../conversation/orchestrator.js';

const router = Router();

const sirisSchema = z.object({
  message:   z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(128).default('siri-shortcut'),
});

// POST /api/siri — endpoint simplifié pour Siri Shortcut iOS
// Retourne du texte brut (pas de JSON) pour que Siri puisse le lire
router.post('/', async (req, res) => {
  const token = req.headers['x-ibrahim-token'] as string | undefined;
  if (token !== process.env['MOBILE_ACCESS_TOKEN']) {
    res.status(401).type('text').send('Non autorisé');
    return;
  }

  const parsed = sirisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).type('text').send('Message invalide');
    return;
  }

  try {
    const response = await processMessage(parsed.data.message, parsed.data.sessionId);
    // Retourne le texte brut pour que Siri puisse le lire directement
    res.type('text').send(response.text);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    res.status(500).type('text').send(`Erreur: ${error}`);
  }
});

// GET /api/siri/setup — page HTML avec instructions pour créer le raccourci
router.get('/setup', (_req, res) => {
  const appUrl = 'https://ibrahim-fik-conciergerie.netlify.app';

  res.type('html').send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ibrahim — Raccourci Siri</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:20px;background:#0a0a0a;color:#f0f0f0}
  h1{color:#6366f1;margin-bottom:6px;font-size:22px}
  .sub{color:#888;font-size:14px;margin-bottom:20px}
  .step{background:#111827;border-radius:14px;padding:16px;margin:12px 0;border-left:4px solid #6366f1}
  .step h3{color:#818cf8;font-size:15px;margin-bottom:10px}
  .step p{font-size:14px;line-height:1.6;color:#ccc}
  .action-box{background:#1e293b;border-radius:10px;padding:12px;margin:8px 0;font-size:13px}
  .action-title{color:#38bdf8;font-weight:600;margin-bottom:6px}
  code{background:#374151;padding:2px 7px;border-radius:5px;font-size:12px;color:#fde68a;word-break:break-all}
  .btn{display:block;background:#6366f1;color:white;border:none;padding:14px;border-radius:12px;font-size:16px;font-weight:600;text-align:center;text-decoration:none;margin:20px 0;cursor:pointer;width:100%}
  .warn{background:#1a1200;border:1px solid #fbbf24;border-radius:10px;padding:12px;color:#fcd34d;font-size:13px;margin:12px 0}
  .num{background:#6366f1;color:white;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-right:8px;flex-shrink:0}
</style>
</head>
<body>
<h1>🎙️ Raccourci Siri Ibrahim</h1>
<p class="sub">Configure "Hey Siri Ibrahim" → l'app s'ouvre et écoute automatiquement</p>

<div class="warn">
  ⚠️ <strong>Étape préalable</strong> : Ouvre d'abord <a href="${appUrl}" style="color:#fcd34d">${appUrl}</a> dans Safari → Partager → <strong>Sur l'écran d'accueil</strong>. L'app doit être installée comme une vraie app.
</div>

<div class="step">
  <h3><span class="num">1</span>Ouvre l'app Raccourcis sur iPhone</h3>
  <p>Appuie sur <strong>"+"</strong> en haut à droite pour créer un nouveau raccourci</p>
</div>

<div class="step">
  <h3><span class="num">2</span>Ajoute UNE SEULE action</h3>
  <div class="action-box">
    <div class="action-title">📱 Ouvrir des URL</div>
    <p>Recherche <strong>"Ouvrir des URL"</strong> (ou "Open URL")<br><br>
    URL : <code>${appUrl}?auto=1</code></p>
  </div>
  <p style="margin-top:8px;font-size:13px;color:#888">C'est tout ! Une seule action suffit. Le <code>?auto=1</code> démarre le micro automatiquement.</p>
</div>

<div class="step">
  <h3><span class="num">3</span>Nomme le raccourci "Ibrahim"</h3>
  <p>Appuie sur le nom en haut → tape <strong>Ibrahim</strong> → terminé</p>
</div>

<div class="step">
  <h3><span class="num">4</span>Ajoute à Siri</h3>
  <p>Dans le raccourci → appuie sur <strong>···</strong> (3 points) → <strong>"Ajouter à Siri"</strong><br><br>
  Enregistre la phrase : dis <strong>"Ibrahim"</strong> quand demandé</p>
</div>

<div class="step">
  <h3>✅ Test final</h3>
  <p>Dis <strong>"Hey Siri Ibrahim"</strong><br>
  → L'app s'ouvre<br>
  → Le globe devient vert et écoute automatiquement<br>
  → Parle ton message<br>
  → Ibrahim répond avec sa voix</p>
</div>

<a href="${appUrl}?auto=1" class="btn">🧪 Tester maintenant (ouvre l'app)</a>
</body>
</html>`);
});

export default router;
