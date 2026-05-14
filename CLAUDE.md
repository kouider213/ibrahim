# DZARYX — Instructions Agent AI (CLAUDE.md)

> Ce fichier est lu automatiquement par Claude Code à chaque session.
> Tout agent AI (Claude, Codex, Cursor) doit suivre ces règles SANS EXCEPTION.

---

## ÉTAPE 1 — LIRE EN PREMIER (obligatoire)

Avant d'écrire une seule ligne de code, lire dans l'ordre :

1. `DZARYX/CURRENT_STATE.md` ← **état exact du projet maintenant**
2. `DZARYX/BUGS.md` ← bugs ouverts (priorité travail)
3. `DZARYX/ROADMAP.md` ← feuille de route
4. `DZARYX/ARCHITECTURE.md` ← si tu ne connais pas le projet

---

## ÉTAPE 2 — RÈGLES DE CODE (jamais déroger)

```
1. npx tsc --noEmit → 0 erreurs AVANT tout commit
2. Profit = (client_price_per_day - owner_price_per_day) × nb_days
   JAMAIS catalog.benefit / catalog.kouiderPrice / catalog.houariPrice
3. Si owner_price_per_day NULL → profit = null (jamais inventé)
4. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
5. Tests obligatoires après changements financiers :
   npx tsx --env-file ../.env src/tests/financial-calculations.test.ts
```

---

## ÉTAPE 3 — APRÈS CHAQUE MODIFICATION (obligatoire)

### Si bug fixé → mettre à jour `DZARYX/BUGS.md`
- Changer `🔴 OUVERT` → `✅ FIXÉ`
- Ajouter date et description du fix

### Si feature ajoutée → mettre à jour `DZARYX/ROADMAP.md`
- Changer `🔵 Planifié` → `✅ Terminé`
- Ajouter notes

### Toujours → mettre à jour `DZARYX/CHANGELOG.md`
```
## YYYY-MM-DD
### Commit `xxxxx` — description
- Fichiers modifiés : ...
- Résumé : ...
- Tests : X/X passent
```

### Toujours → mettre à jour `DZARYX/CURRENT_STATE.md`
- Mettre à jour "Dernière session"
- Mettre à jour "Prochaine priorité"
- Mettre à jour "Ce qui fonctionne / ne fonctionne pas"

---

## Projet en 5 lignes

**Dzaryx** = assistant AI pour Kouider (Fik Conciergerie Oran, location voitures).
Backend TypeScript sur Railway. DB Supabase. Cache Redis Upstash.
Canal principal : Telegram. Mobile : React PWA. PC : Python Nexus agent.
AI : Claude (primary) + OpenAI/Gemini/Groq (fallback via LLM Router).
Push sur `main` = déploiement Railway automatique.

---

## Fichiers critiques

| Fichier | Rôle |
|---|---|
| `backend/src/conversation/orchestrator.ts` | Point entrée AI + Guards 1-4 |
| `backend/src/integrations/finance.ts` | Calculs financiers (computeBookingFinancials) |
| `backend/src/integrations/phase5-finance.ts` | Dashboard (resolveFinancials) |
| `backend/src/bi/revenue-intelligence.ts` | Revenus semaine/mois |
| `backend/src/orchestrator/anti-hallucination.ts` | Gates 2+3 bloquants |
| `backend/src/integrations/tool-executor.ts` | Outils Claude → Supabase |
| `DZARYX/HANDOFF.md` | Guide complet pour agent AI |

---

## Déploiement

```bash
git add <fichiers>
git commit -m "type: description\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main   # → Railway redéploie automatiquement
```
