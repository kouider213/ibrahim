# DZARYX — Variables d'Environnement

> Fichier `.env` à la racine du projet — JAMAIS committer dans git.
> En production : configurer dans Railway Dashboard.

---

## Backend (`.env` à la racine)

### AI
| Variable | Description | Requis |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Claude (Anthropic) | ✅ |

### Base de données
| Variable | Description | Requis |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | ✅ |
| `SUPABASE_SERVICE_KEY` | Clé service role Supabase | ✅ |

### Cache / Queue
| Variable | Description | Requis |
|---|---|---|
| `REDIS_URL` | URL Redis Upstash (format: `rediss://...`) | ✅ |

### Authentification
| Variable | Description | Requis |
|---|---|---|
| `MOBILE_ACCESS_TOKEN` | Token auth app mobile | ✅ |
| `PC_AGENT_TOKEN` | Token auth Nexus PC agent | ✅ |
| `WEBHOOK_SECRET` | Secret validation webhooks | ✅ |
| `SESSION_SECRET` | Secret chiffrement sessions | ✅ |

### Notifications
| Variable | Description | Requis |
|---|---|---|
| `PUSHOVER_USER_KEY` | User key Pushover (iPhone) | ✅ |
| `PUSHOVER_APP_TOKEN` | App token Pushover | ✅ |
| `ELEVENLABS_API_KEY` | API text-to-speech ElevenLabs | ✅ |
| `ELEVENLABS_VOICE_ID` | ID voix ElevenLabs | ✅ |

### Intégrations
| Variable | Description | Requis |
|---|---|---|
| `GITHUB_TOKEN` | Token GitHub API | Optionnel |
| `GITHUB_OWNER` | Compte GitHub propriétaire | Optionnel |
| `GITHUB_DEFAULT_REPO` | Repo GitHub par défaut | Optionnel |
| `NETLIFY_TOKEN` | Token déploiement Netlify | Optionnel |
| `RAILWAY_TOKEN` | Token Railway | Optionnel |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram | ✅ |
| `TELEGRAM_ADMIN_IDS` | IDs admins Telegram (séparés par virgule) | ✅ |

### Serveur
| Variable | Description | Requis |
|---|---|---|
| `PORT` | Port API (défaut: 3000) | Optionnel |
| `NODE_ENV` | `development` ou `production` | ✅ |
| `BACKEND_URL` | URL publique du backend | ✅ |

---

## Nexus PC Agent (`nexus/.env`)

| Variable | Description |
|---|---|
| `BACKEND_URL` | URL backend Railway |
| `PC_AGENT_TOKEN` | Même token que côté backend |
| `NEXUS_HTTP_PORT` | Port HTTP local (défaut: 7777) |
| `NEXUS_WS_PORT` | Port WebSocket local (défaut: 7778) |

---

## Notes

- Railway gère les vars d'env en production — pas besoin de `.env` sur le serveur
- Pour dev local : copier `.env.example` → `.env` et remplir les valeurs
- `TELEGRAM_ADMIN_IDS` est critique pour la sécurité (seuls ces IDs ont accès admin)
