# 09 — Environnement & Déploiement

> Où c'est hébergé, comment déployer, quelles variables. Retour : [[🏠 HUB]]

---

## Hébergement (qui tourne où)

| Morceau | Plateforme | Déploiement | Auto ? |
|---------|-----------|-------------|--------|
| Backend Dzaryx | **Railway** | push `main` du repo `ibrahim` | ✅ auto |
| Site | **Vercel** | push `main` du repo `autolux-location` | ✅ auto |
| PWA mobile | **Netlify** | `npm run build` + push | ✅ auto (Netlify détecte) |
| Simulateur | **GitHub Pages** | `npm run build` → branche `gh-pages` | ❌ **manuel** |
| App native | APK Expo | build EAS | ❌ manuel |
| Nexus | PC Kouider | `python nexus.py` | ❌ manuel (watchdog) |
| Base | **Supabase** | migrations SQL via SQL Editor | ❌ manuel |
| Redis | **Upstash** | — | — |
| Médias | **Cloudinary** + Supabase Storage | — | — |

---

## Procédures de déploiement

### Backend (Railway)
```powershell
cd ibrahim/backend
node_modules\.bin\tsc --noEmit          # 0 erreur OBLIGATOIRE
cd ..
git add backend/src/<fichiers précis>
git commit -m "type: description"        # finir par Co-Authored-By
git push origin main                     # Railway redéploie
```

### Site (Vercel)
```powershell
cd rental-system
npm run build                            # vérifier avant push
git add <fichiers précis>
git commit -m "..."
git push origin main                     # Vercel redéploie
```

### Simulateur (GitHub Pages — manuel)
```powershell
cd ibrahim/simulator
npm run build
# puis publier le build sur la branche gh-pages
```

### PWA mobile (Netlify)
```powershell
cd ibrahim/mobile
npm run build
git add ... && git commit && git push    # Netlify détecte
```

---

## Variables d'environnement backend (`backend/src/config/env.ts`)

Validées par **Zod** au démarrage — si une obligatoire manque, le backend **refuse de démarrer**.

### Obligatoires
| Var | Rôle |
|-----|------|
| `ANTHROPIC_API_KEY` | Claude (cerveau IA) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Base (service key = accès total) |
| `REDIS_URL` | Queue BullMQ (Upstash) |
| `MOBILE_ACCESS_TOKEN` (≥16) | Auth app Kouider |
| `PC_AGENT_TOKEN` (≥16) | Auth Nexus |
| `WEBHOOK_SECRET` (≥16) | Webhook site → backend |
| `SESSION_SECRET` (≥16) | Sessions |
| `PUSHOVER_USER_KEY` + `PUSHOVER_APP_TOKEN` | Notifications Pushover |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | Voix (voice ID `pNInz6obpgDQGcFmaJgB`) |

### Optionnelles importantes
| Var | Rôle |
|-----|------|
| `MOBILE_TOKEN_HOUARI` | Auth app Houari (associé) |
| `OWNER_NAME=Kouider` / `PARTNER_NAME=Houari` / `BUSINESS_NAME` | Identité |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Fallbacks LLM |
| `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_DEFAULT_REPO=ibrahim` | L'IA modifie le code |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `PERSONAL_GCAL_ID` / `HOUARI_GCAL_ID` | Google Calendar |
| `CLOUDINARY_*` | Hébergement médias |
| `REPLICATE_API_TOKEN` / `FAL_KEY` / `KLING_API_KEY` / `RUNWAY_API_KEY` | Génération image/vidéo IA |
| `APIFY_API_KEY` | Scraping TikTok concurrents |
| `JINA_API_KEY` / `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` | Recherche web |
| `GOOGLE_MAPS_API_KEY` | Distances/cartes |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `TELEGRAM_ADMIN_IDS` | Bot Telegram |
| `TIKTOK_ACCESS_TOKEN` / `TIKTOK_OPEN_ID` | Publication TikTok |
| `VAPID_*` | Web Push |
| `NEXUS_PROACTIVE_ENABLED` | `'true'` = proactifs Nexus (défaut OFF) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Push FCM natif (pas encore configuré) |
| `RAILWAY_*` / `VERCEL_TOKEN` / `NETLIFY_TOKEN` / `SUPABASE_ACCESS_TOKEN` | L'IA déploie |
| `SAAS_JWT_SECRET` (≥32) | JWT SaaS (futur) |
| `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` | Bot WhatsApp (désactivé) |

### Fichiers .env (sur le PC)
```
ibrahim/.env                 ← backend (SUPABASE_URL, SUPABASE_SERVICE, ...)
ibrahim/dzaryx-native/.env   ← app native
ibrahim/mobile/.env.local + .env.production
ibrahim/nexus/.env           ← Nexus
ibrahim/simulator/.env.local
```

---

## Site — variables d'env (Vercel)

| Var | Rôle |
|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase (anon, RLS) |
| `IBRAHIM_BACKEND_URL` | URL backend Railway (webhook) |
| `IBRAHIM_WEBHOOK_SECRET` | = `WEBHOOK_SECRET` backend (header `x-webhook-secret`) |
| `CLOUDINARY_*` | Upload images |

---

## ⚠️ À faire / dette technique

- [ ] Révoquer l'ancien token GitHub exposé (`ghp_d8Vch6X9...`) — github.com/settings/tokens
- [ ] SMTP Railway non configuré (`SMTP_USER/PASS/FROM`) → emails registration KO
- [ ] Firebase FCM natif non configuré → attendre APK
- [ ] Resserrer le CORS backend
- [ ] GPS live flotte = nécessite trackers hardware (~25-50€/voiture)
