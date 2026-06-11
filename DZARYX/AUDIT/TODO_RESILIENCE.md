---
tags: [todo, resilience, failover, checklist]
aliases: [TODO jamais-mort, Reprise résilience]
---
# ✅ TODO — Système "jamais mort" (à finir à la maison)

> Objectif : quand les abonnements/crédits payants finissent, tout bascule
> automatiquement sur du gratuit — site + app jamais morts, puissance conservée.
> Démarré 2026-06-11. Retour : [[🏠 HUB]] · détail : [[10_JOURNAL_SESSION]]

---

## 🟢 DÉJÀ FAIT (code déployé + testé)
- [x] Cerveau de secours **agentique** : Claude mort → mêmes 151 outils sur Groq/Gemini (`agentic-fallback.ts`)
- [x] **TTS jamais muet** : ElevenLabs → Gemini TTS → voix device
- [x] **Failover backend** côté app (simulateur), mobile, site (Railway → Render auto)
- [x] **`render.yaml`** + **`supabase-backup.yml`** (workflow backup hebdo) committés/poussés
- [x] Backend backup créé sur **Render** (blueprint appliqué)
- [x] Variables d'env collées dans Render (52 variables, JSON corrigés)
- [x] Doublon `JOBS_ENABLED` retiré dans Render
- [x] Secret GitHub `SUPABASE_DB_URL` créé (⚠️ mais mot de passe FAUX — voir plus bas)

---

## 🔴 À FINIR — étapes exactes

### 1. Backup base de données (Supabase) — bloqué : mauvais mot de passe
> Le mot de passe `Kamikaz1080!` a été **testé = REFUSÉ** par la base. À refaire proprement.

- [ ] **a.** Supabase → projet `febrrgqpyqqrewcohomx` → ⚙️ Settings → **Database**
- [ ] **b.** Bouton **Reset database password** → choisir un mot de passe **lettres+chiffres SEULEMENT**
      (ex : `Backupdz2026oran`) — surtout PAS de `! @ # $` (casse l'URL). **Bien cliquer Confirmer.**
- [ ] **c.** Noter le mot de passe exact.
- [ ] **d.** (Optionnel — me le donner, je teste la connexion en 5 sec avant de continuer)
- [ ] **e.** GitHub → https://github.com/kouider213/ibrahim/settings/secrets/actions → cliquer
      **`SUPABASE_DB_URL`** → **Update secret** → coller :
      `postgresql://postgres.febrrgqpyqqrewcohomx:<MOT_DE_PASSE>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`
- [ ] **f.** Tester : https://github.com/kouider213/ibrahim/actions/workflows/supabase-backup.yml →
      **Run workflow** → attendre ~1 min → doit passer **VERT** ✅
> ⚠️ Ce mot de passe sert UNIQUEMENT au backup. L'app utilise les clés API → aucun risque de casse.

### 2. Backend backup Render — ne démarre pas (Live KO après 25 min)
> Le service `dzaryx-backend-backup` ne répond pas sur `/health`. Crash au démarrage.

- [ ] **a.** dashboard.render.com → service **dzaryx-backend-backup** → onglet **Logs**
- [ ] **b.** Repérer la **dernière erreur rouge** (variable manquante ? crash code ? build ?) → me l'envoyer (screenshot)
- [ ] **c.** Je corrige selon l'erreur (souvent une variable d'env manquante/mal collée)
- [ ] **d.** Vérifier que ça répond : https://dzaryx-backend-backup.onrender.com/health → doit afficher du JSON
- [ ] **e.** (Une fois Live) ré-ouvrir l'app à FOND + rouvrir (SW v85)

### 3. UptimeRobot — surveillance + garder Render éveillé (gratuit, 3 min)
- [ ] **a.** Créer compte sur **uptimerobot.com** (gratuit)
- [ ] **b.** Add Monitor (HTTP) → `https://ibrahim-backend-production.up.railway.app/health`
- [ ] **c.** Add Monitor (HTTP) → `https://dzaryx-backend-backup.onrender.com/health`
- [ ] **d.** Add Monitor (HTTP) → `https://autolux-location.vercel.app` (le site)
- [ ] **e.** (Optionnel) brancher l'alerte sur email/Telegram
> Effet : alerte si panne + le ping garde Render réveillé (sinon il dort après 15 min = réveil lent).

---

## 🔒 SÉCURITÉ — à faire quand possible (pas bloquant)
- [ ] Révoquer le **vieux token GitHub** exposé `ghp_d8Vch...` → github.com/settings/tokens → Delete (bug [[BUGS|B025]])
- [ ] **Régénérer un GITHUB_TOKEN** valide (l'actuel sur Railway est périmé = je ne peux plus créer de secrets/API à ta place)
      → github.com/settings/tokens → Generate (classic, scope `repo`) → le mettre dans Railway Variables `GITHUB_TOKEN`
- [ ] **Changer une dernière fois le mot de passe Supabase** (le mdp a transité dans le chat Claude) → puis mettre à jour le secret
- [ ] **Restreindre la clé Google Maps** (console.cloud.google.com → APIs → Credentials → restrict)

---

## 🧠 Comment ça marche (rappel — pour comprendre)
| Brique morte | Bascule auto vers | Fichier |
|---|---|---|
| Backend Railway | Render backup (`VITE_BACKEND_BACKUPS`) | `simulator/src/services/api.ts` |
| Crédits Claude | Groq → Gemini (mêmes outils) | `backend/src/integrations/agentic-fallback.ts` |
| ElevenLabs (voix) | Gemini TTS → voix téléphone | `backend/src/notifications/dispatcher.ts` |
| Supabase (si perte) | Restaurer le dump hebdo GitHub | `.github/workflows/supabase-backup.yml` |

**Coût cible quand tout le payant est coupé : ~0 €/mois.**
