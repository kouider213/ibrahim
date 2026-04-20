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
  const backendUrl = process.env['BACKEND_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
  const token = process.env['MOBILE_ACCESS_TOKEN'] ?? '';

  res.type('html').send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ibrahim — Raccourci Siri</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #f0f0f0; }
  h1 { color: #6366f1; }
  .step { background: #1a1a2e; border-radius: 12px; padding: 16px; margin: 12px 0; border-left: 4px solid #6366f1; }
  .step h3 { margin: 0 0 8px; color: #818cf8; }
  code { background: #2d2d2d; padding: 4px 8px; border-radius: 6px; font-size: 13px; word-break: break-all; }
  .copy-btn { background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; margin-top: 8px; }
  .token { color: #fbbf24; }
</style>
</head>
<body>
<h1>🎙️ Ibrahim — Raccourci Siri</h1>
<p>Crée le raccourci "Hey Siri Ibrahim" en 2 minutes.</p>

<div class="step">
  <h3>Étape 1 — Ouvre l'app Raccourcis</h3>
  <p>Sur ton iPhone → Raccourcis → "+" pour créer un nouveau raccourci</p>
</div>

<div class="step">
  <h3>Étape 2 — Ajoute 3 actions</h3>
  <p><strong>Action 1 :</strong> Recherche "Dicter du texte" → ajoute-la</p>
  <p><strong>Action 2 :</strong> Recherche "Obtenir le contenu" → sélectionne "Obtenir le contenu d'une URL"<br>
    • Méthode : <code>POST</code><br>
    • URL : <code>${backendUrl}/api/siri</code><br>
    • Corps de la requête : JSON<br>
    • Ajoute les champs :<br>
    &nbsp;&nbsp;- <code>message</code> = Texte dicté (variable de l'étape 1)<br>
    &nbsp;&nbsp;- <code>sessionId</code> = <code>siri-main</code><br>
    • En-têtes :<br>
    &nbsp;&nbsp;- <code>x-ibrahim-token</code> = <code class="token">${token}</code>
  </p>
  <p><strong>Action 3 :</strong> Recherche "Dicter le texte" → "Énoncer le texte"<br>
    • Texte : Résultat de l'URL (variable de l'étape 2)
  </p>
</div>

<div class="step">
  <h3>Étape 3 — Nomme le raccourci</h3>
  <p>Appelle-le <strong>"Ibrahim"</strong> exactement</p>
  <p>Puis va dans Réglages → Siri → Mes raccourcis → Ibrahim → enregistre la phrase vocale</p>
</div>

<div class="step">
  <h3>✅ Test</h3>
  <p>Dis <strong>"Hey Siri Ibrahim"</strong> et parle-lui !</p>
</div>
</body>
</html>`);
});

export default router;
