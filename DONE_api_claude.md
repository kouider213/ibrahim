# Phase 5 — Ibrahim Autonome ✅

## Accès configurés

### GitHub (3 repos)
- **ibrahim** → backend + frontend Ibrahim (Railway auto-déploie après push)
- **autolux-location** → site AutoLux Oran
- **fik-conciergerie** → site Fik Conciergerie
- Token: `GITHUB_TOKEN` (déjà configuré Railway)
- Owner: `GITHUB_OWNER` (déjà configuré Railway)

### Railway (logs + status)
- Logs du dernier déploiement via GraphQL API
- Token requis: `RAILWAY_TOKEN` → Railway > Settings > Tokens > New Token
- Projet requis: `RAILWAY_PROJECT_ID` → URL du projet Railway
- Service requis: `RAILWAY_SERVICE_ID` → Railway > Service > Settings

### Supabase (SQL complet)
- SELECT/INSERT/UPDATE/ALTER TABLE/CREATE TABLE
- Token requis: `SUPABASE_ACCESS_TOKEN` → app.supabase.com > Account > Access Tokens

### Netlify
- Déclenchement builds manuels
- Token: `NETLIFY_TOKEN` (déjà configuré Railway)

### ElevenLabs + Telegram
- Déjà fonctionnels depuis phases précédentes

## Variables à ajouter dans Railway

| Variable | Source | Obligatoire |
|---|---|---|
| `GITHUB_TOKEN` | GitHub > Settings > Developer settings > PAT | Déjà là |
| `RAILWAY_TOKEN` | Railway > Settings > Tokens > New token | Nouveau |
| `RAILWAY_PROJECT_ID` | URL Railway: railway.app/project/XXXX | Nouveau |
| `RAILWAY_SERVICE_ID` | Railway > Service > Settings > Service ID | Nouveau |
| `SUPABASE_ACCESS_TOKEN` | supabase.com > Account > Access Tokens | Nouveau |

## Nouveaux outils Ibrahim (6)

| Outil | Usage |
|---|---|
| `github_read_file` | Lire code source (n'importe quel repo) |
| `github_write_file` | Modifier code → Railway redéploie auto |
| `github_list_files` | Naviguer dans le codebase |
| `railway_get_logs` | Vérifier logs après déploiement |
| `supabase_execute` | SQL arbitraire sur la base de données |
| `netlify_deploy` | Déclencher build Netlify |

## Limites augmentées

- `max_tokens`: 1024 → **8192** (pour écrire du code long)
- `maxRounds`: 5 → **15** (pour tâches multi-étapes)

## Règles de sécurité (immuables)

❌ Jamais supprimer données client sans confirmation Kouider  
❌ Jamais contacter client externe sans confirmation  
❌ Jamais dépense/abonnement sans confirmation  
❌ Jamais modifier clés API/tokens sans confirmation  
✅ Tout le reste: autonomie totale  

## Test rapide

Envoyer sur Telegram:
1. `"Ibrahim liste les fichiers du dossier backend/src/integrations du repo ibrahim"`
2. `"Ibrahim lis le fichier backend/src/config/constants.ts du repo ibrahim"`
3. `"Ibrahim montre-moi les derniers logs Railway"` (si RAILWAY_TOKEN configuré)

## Commit

Déployé via GitHub main → Railway auto-deploy
