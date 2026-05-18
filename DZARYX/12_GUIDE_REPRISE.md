# 12 — Guide Reprise Projet

> Pour un développeur (ou un agent AI) qui reprend le projet à zéro.
> Lis ce guide en entier avant de toucher quoi que ce soit.

---

## Étape 1 — Lire ces fichiers dans l'ordre

1. `DZARYX/CURRENT_STATE.md` ← ce que le projet fait MAINTENANT
2. `DZARYX/BUGS.md` ← bugs ouverts (travailler là-dessus en priorité)
3. `DZARYX/ROADMAP.md` ← feuille de route
4. `DZARYX/00_INDEX.md` ← vue d'ensemble + liens
5. `CLAUDE.md` (racine) ← règles que l'agent AI DOIT suivre

---

## Étape 2 — Comprendre la structure

```
ibrahim/
├── backend/         ← API Node.js TypeScript (PRINCIPAL) — Railway
├── mobile/          ← React PWA (dashboard + chat) — Netlify
├── simulator/       ← Simulateur Android web — à déployer Netlify
├── dzaryx-native/   ← App React Native Expo — APK Android
├── nexus/           ← Agent Python PC Kouider
├── pc-agent/        ← Agent TypeScript PC (alternative)
├── flight-bot/      ← Bot Telegram vols (indépendant)
├── supabase/        ← Migrations SQL
├── scripts/         ← Utilitaires
└── DZARYX/          ← Cette documentation
```

---

## Étape 3 — Vérifier que tout tourne

```bash
# Backend Railway → doit répondre
curl https://ibrahim-backend-production.up.railway.app/health

# App Web Netlify → doit s'ouvrir
# https://ibrahim-fik-conciergerie.netlify.app/

# Simulateur local → si tu veux tester
cd simulator && npm install && npm run dev
# → http://localhost:5174
```

---

## Étape 4 — Tâches en attente (priorité)

1. **EAS Build APK** (à partir du 1 juin 2026) :
   ```bash
   cd dzaryx-native
   EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 \
   npx eas build --platform android --profile preview --non-interactive
   ```

2. **Déployer simulateur sur Netlify** :
   - Créer nouveau site Netlify (≠ ibrahim-fik-conciergerie)
   - Base = `simulator`, Build = `npm run build`, Publish = `dist`
   - Vars env : `VITE_BACKEND_URL`, `VITE_WS_URL`, `VITE_ACCESS_TOKEN`

3. **Railway** : Ajouter MOBILE_TOKEN_HOUARI + Twilio vars :
   ```
   MOBILE_TOKEN_HOUARI = 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
   ```

4. **Google Cloud** : Restreindre Maps API key `AIzaSyAv7s2qAJiHwsAzVmeA25UEOmo8p6FIsyo`
   → Distance Matrix API uniquement

---

## Règles absolues à ne jamais oublier

### Code
```
1. npx tsc --noEmit → 0 ERREURS avant tout commit
2. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
3. NE JAMAIS committer .env ou fichiers secrets
4. Profit = (client_price_per_day - owner_price_per_day) × nb_days
   JAMAIS catalog.benefit, jamais de valeur inventée
```

### Sécurité
```
- EXPO_TOKEN G7nmf_... → révoquer sur expo.dev quand builds terminés
- Google Maps API key → restreindre à Distance Matrix API
- MOBILE_TOKEN_HOUARI → jamais logguer
```

### Après chaque modification
```
| Action        | Fichier à mettre à jour            |
|---------------|-------------------------------------|
| Bug fixé      | DZARYX/BUGS.md → 🔴 → ✅            |
| Feature       | DZARYX/ROADMAP.md + CHANGELOG.md    |
| Fin session   | DZARYX/CURRENT_STATE.md             |
| Journal       | DZARYX/11_JOURNAL.md                |
```

---

## Déploiement

```bash
# Backend (Railway auto-deploy)
git push origin main  ← Railway détecte et redéploie automatiquement

# Mobile PWA (Netlify auto-deploy)
# Modifs dans mobile/ → push → Netlify redéploie automatiquement

# Nexus PC Agent (manuel)
# Modifier nexus/ → copier sur PC Kouider → redémarrer nexus.py
```

---

## Variables d'environnement importantes

| Variable | Service | Note |
|----------|---------|------|
| `EXPO_PUBLIC_BACKEND_URL` | EAS | URL Railway |
| `EXPO_PUBLIC_MOBILE_TOKEN` | EAS | Token Kouider |
| `EXPO_PUBLIC_MOBILE_TOKEN_HOUARI` | EAS | Token Houari |
| `VITE_BACKEND_URL` | Netlify simulateur | URL Railway |
| `VITE_WS_URL` | Netlify simulateur | URL WSS Railway |
| `MOBILE_TOKEN_HOUARI` | Railway | `99c3dba3...` (à ajouter) |

---

## Pièges à éviter

1. **EAS build sans env** → app cassée (backend URL undefined) → toujours utiliser profile avec `"environment": "production"` dans eas.json ✅ (déjà fait)
2. **Supabase maybeSingle()** → throw si plusieurs résultats → utiliser `select().limit(1)` ou gérer array
3. **Groq/Gemini sans outils** → hallucinations finance → fastPathGuard bloque ✅ (déjà fait)
4. **`git add .`** → peut inclure .env → JAMAIS

---

## Questions fréquentes

**Q: L'app mobile répond pas au micro ?**
R: Vérifier dans Paramètres Android → Permissions → Microphone → Dzaryx = Autorisé

**Q: La vision marche pas ?**
R: Vérifier quota Gemini Flash. Fallback → OpenAI → Claude Haiku. Vérifier backend logs Railway.

**Q: Le bot Telegram répond pas ?**
R: Vérifier Railway → bouton "Redeploy". Vérifier `health` endpoint.

**Q: Où voir les logs Railway ?**
R: https://railway.app → projet → service backend → Logs

**Q: Comment ajouter un écran dans l'app native ?**
R: 1. Créer `dzaryx-native/app/mon-ecran.tsx` 2. Ajouter `<Stack.Screen name="mon-ecran" />` dans `_layout.tsx` 3. `router.push('/mon-ecran')`

---

#guide #reprise #onboarding #documentation
