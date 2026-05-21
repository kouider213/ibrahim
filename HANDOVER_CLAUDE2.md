# DZARYX (Ibrahim) — Handover Complet pour Prochain Agent AI
# Date: 2026-05-21 | État: PRODUCTION ✅ | Sessions: 15+

---

## QUI ES-TU / CONTEXTE

Tu continues le travail sur **Dzaryx** (anciennement Ibrahim), un assistant IA autonome pour
**Fik Conciergerie Oran** — société de location de voitures à Oran, Algérie.

**Propriétaire:** Kouider (vit à Bruxelles, Belgique — travaille pour employeur belge lun-ven)
**Associé terrain:** Houari (à Oran, gère les opérations physiques)
**Business:** Location voitures haut de gamme à Oran

**Règle absolue:** Travaille en autonomie. Simulateur d'abord, APK ensuite. Pas de confirmation inutile.

---

## PHILOSOPHIE DU PROJET

Dzaryx = un vrai AI Operating System pour Fik Conciergerie.
- **1 seule app** avec plusieurs logins (Kouider + Houari)
- **Même business partagé** (véhicules, réservations, paiements)
- **Dzaryx personnalisé par utilisateur** (langue, style, mémoire séparée)
- **Simulateur GitHub Pages = zone de test principale** → APK ensuite
- **Telegram = backup/admin** (plus canal principal)

---

## INFRASTRUCTURE

| Service | URL / Info |
|---|---|
| Backend (Railway) | https://ibrahim-backend-production.up.railway.app |
| Simulateur (GitHub Pages) | https://kouider213.github.io/ibrahim/ |
| Mobile PWA (Netlify) | https://ibrahim-fik-conciergerie.netlify.app |
| GitHub repo | https://github.com/kouider213/ibrahim |
| Supabase project | febrrgqpyqqrewcohomx |
| Railway auto-deploy | chaque push sur `main` → deploy automatique |

---

## STACK TECHNIQUE

- **Backend**: Node.js + TypeScript + Express + Socket.IO → Railway
- **Frontend/Mobile**: React + Vite (PWA) → Netlify
- **Simulateur**: React + Vite + Tailwind → GitHub Pages (branch `gh-pages`)
- **DB**: Supabase (PostgreSQL)
- **Queue**: BullMQ + Redis (Upstash)
- **Voice**: ElevenLabs (voice ID: pNInz6obpgDQGcFmaJgB)
- **STT**: Groq Whisper / Google STT fallback
- **AI**: Claude Sonnet 4.6 pour chat, Haiku pour détection d'intention
- **Maps**: Google Distance Matrix API
- **Vision**: Gemini Flash → GPT-4o Vision → Claude Haiku cascade
- **Push**: Expo Push + Firebase FCM (firebase-admin)
- **Telegram**: canal backup/admin (pas canal principal)
- **Cloudinary**: traitement images/vidéos
- **Google Calendar**: compte fikconciergerie@gmail.com (service account)

---

## LOGINS SIMULATEUR

| Acteur | Login | Password | Couleur |
|---|---|---|---|
| Kouider | kouider | kouider31 | Cyan #00e5ff |
| Houari | houari | houari31 | Violet #7c3aed |

---

## COMMENT DÉPLOYER LE SIMULATEUR SUR GITHUB PAGES

**IMPORTANT:** Le simulateur ne se déploie PAS automatiquement. Il faut le faire manuellement.

```bash
# 1. Modifier code dans simulator/src/
# 2. Build
cd simulator && npm run build

# 3. Copier dist sur branch gh-pages via worktree
cd ..  # racine ibrahim/
git worktree add ../gh-pages-deploy gh-pages
cp simulator/dist/index.html ../gh-pages-deploy/index.html
rm -rf ../gh-pages-deploy/assets
cp -r simulator/dist/assets ../gh-pages-deploy/assets
cd ../gh-pages-deploy
git add index.html assets/
git commit -m "deploy: description"
git push origin gh-pages

# 4. Nettoyer worktree (souvent Permission denied sous Windows — ignorer)
cd ../ibrahim
git worktree remove --force ../gh-pages-deploy
git worktree prune
```

---

## PHASES COMPLÉTÉES ✅ (historique complet)

| Phase | Contenu | Date |
|---|---|---|
| Phase 1 | Backend Railway + Mobile Netlify + Chat vocal ElevenLabs | Avril 2026 |
| Phase 2 | Streaming Claude + tables Supabase | Avril 2026 |
| Phase 3 | BullMQ jobs + alertes proactives + Telegram | Avril 2026 |
| Phase 4 | Mémoire permanente + universel | Avril 2026 |
| Phase Widget | AutoLux widget | Avril 2026 |
| Phase Jarvis | Interface mobile redesign | Avril 2026 |
| Phase 5 | Finance (paiements, CA, PDF invoices, alertes) | Avril 2026 |
| Phase 6 | WhatsApp structure (code prêt, Twilio non configuré) | Avril 2026 |
| Phase 6 Mobile | BookingForm + CalendarView + ClientsView + BottomNav 10 items | Mai 2026 |
| Phase 7 | Renommage Ibrahim→Dzaryx (UI), Fleet dashboard, OCR passeport, Voucher PDF | Avril 2026 |
| Phase 13 | Learning (feedback continu, rapport mensuel) | Avril 2026 |
| Phase 14 | Media (Cloudinary images/vidéos) | Avril 2026 |
| Vision Scan | Caméra live + SCAN temps réel | Avril 2026 |
| Fast Mode | Extended Thinking + Prompt caching 80% réduction coûts | Avril 2026 |
| Documents | get_client_document, envoi Telegram, web_search réelle | Mai 2026 |
| Engine V2 | Normalizer + entity-extractor + pending-action + 41 tests | Mai 2026 |
| Native App | 9 écrans complets (bookings, fleet, revenue, reminders, clients, docs...) | Mai 2026 |
| Simulateur | 12 onglets, design cyberpunk HUD, multi-acteur | Mai 2026 |
| Phase 8 | learned_rules + contrat PDF + Excel export + Nexus Redis + Google STT + FCM | Mai 2026 |
| GPS | Distance Matrix + calculate_delivery_fee + panel simulateur | Mai 2026 |

---

## CE QUI FONCTIONNE EN DÉTAIL (2026-05-21)

### Chat & IA
- Parler à Dzaryx en français/darija/arabe → réponse vocale ElevenLabs
- 14 agents spécialisés avec routing automatique
- Anti-hallucination : 7 gates bloquants — Dzaryx ne ment jamais
- Mémoire long terme : `ibrahim_memory` + `learned_rules` + `memory_facts`
- "Dzaryx retiens que..." → sauvegarde règle immédiate
- Règles injectées automatiquement dans chaque conversation

### Réservations
- "Ahmed Sandero 22 au 26 mai 40€/j" → crée directement dans Supabase
- Vérifie disponibilité avant création (anti double réservation)
- Sync Google Calendar automatique
- Voucher PDF envoyé Telegram sur demande

### Finance
- CA jour/semaine/mois calculés depuis vraies données Supabase
- Profit Kouider séparé (jamais inventé si données manquantes)
- Export Excel 3 feuilles : resas, bilan, par voiture
- Alertes impayés automatiques (BullMQ)

### GPS & Livraison
- "Livraison chez le client à Bir El Djir" → distance + temps + frais DZD + Waze + GMaps
- Dépôt : Es Sénia (coordonnées hardcodées — à modifier si garage ailleurs)
- Tarif : 200 DZD/km (configurable dans l'outil)
- Landmarks Oran préchargés : aéroport, centre, port, Bir El Djir, Ain Turk, Arzew
- Avec GOOGLE_MAPS_API_KEY (configuré) : trafic temps réel
- Sans clé : estimation vol d'oiseau ±20%

### Documents
- "Passeport de Sofiane" → récupère depuis Supabase + envoie Telegram
- "Génère contrat pour Ahmed Mansouri Jogger 22-26 mai" → PDF signable avec CGV
- OCR passeport via caméra (scan live)

### Nexus PC
- Terminal streaming live depuis téléphone
- Screenshots PC → envoyés dans chat
- Contrôle fichiers, git, processus
- Health check : CPU/RAM/OS/UPTIME en temps réel dans simulateur CONFIG

### Proactif automatique (sans rien demander)
- 7h30 : Briefing matinal (CA, retours, impayés, météo Oran)
- 9h : Rappels retours du jour
- Toutes les 6h : vérif impayés
- 18h30 : Bilan journée
- Lundi 8h : Rapport hebdo

---

## CE QUI N'EST PAS ENCORE FAIT

### APK Android — Reset 1er juin 2026
```bash
EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build --platform android --profile preview --non-interactive
```

### Firebase FCM natif
- Attendre APK d'abord
- Ensuite : Google Cloud → Service Account → JSON → Railway `FIREBASE_SERVICE_ACCOUNT_JSON`

### WhatsApp bot vitrine — Août 2026
- Bot simple : liste voitures dispo + tarifs + promos
- PAS de réservation automatique (juste info)
- Besoin : compte Twilio + TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM Railway

### Suivi flotte GPS live
- Requires hardware GPS trackers (~25-50€/voiture + SIM 4G 5€/mois)
- Software côté backend : à faire quand hardware acheté

### DÉCISIONS DE KOUIDER (ne pas revenir dessus sans qu'il le demande)
- iOS : NE PAS faire
- Chargily (paiement algérien) : NE PAS faire
- Telegram : backup/admin SEULEMENT

---

## MÉTHODE DE TRAVAIL OBLIGATOIRE

```
1. Simulateur d'abord → tester → valider
2. Ensuite seulement APK Android
3. Jamais modifier APK pour chaque petite feature
4. Toujours npx tsc --noEmit → 0 erreurs avant commit
5. Profit = (client_price_per_day - owner_price_per_day) × nb_days — JAMAIS catalogue
6. git add <fichiers spécifiques> — JAMAIS git add -A
7. Tool executor : retourner string uniquement
```

---

## FICHIERS CRITIQUES À CONNAÎTRE

| Fichier | Rôle |
|---|---|
| `DZARYX/CURRENT_STATE.md` | État exact — lire EN PREMIER |
| `backend/src/conversation/orchestrator.ts` | Point entrée AI + Guards 1-4 |
| `backend/src/integrations/finance.ts` | `computeBookingFinancials()` |
| `backend/src/integrations/maps.ts` | GPS Distance Matrix |
| `backend/src/integrations/tool-executor.ts` | Tous les outils Claude |
| `backend/src/integrations/tools.ts` | Définitions outils (schemas) |
| `backend/src/notifications/mobile-push.ts` | `emitProactive()` Socket.IO + FCM |
| `backend/src/queue/jobs/proactive-jobs.ts` | 12 jobs BullMQ |
| `simulator/src/components/Phone.tsx` | Simulateur — tabs + login |
| `nexus/modules/ws_client.py` | Events Socket.IO Nexus |

---

## VARIABLES RAILWAY — ÉTAT COMPLET

### Configurées ✅
```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
REDIS_URL
MOBILE_ACCESS_TOKEN          (Kouider)
MOBILE_TOKEN_HOUARI          ← ajouté 2026-05-21
PC_AGENT_TOKEN
WEBHOOK_SECRET
SESSION_SECRET
PUSHOVER_USER_KEY
PUSHOVER_APP_TOKEN
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID          = pNInz6obpgDQGcFmaJgB
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
BACKEND_URL                  = https://ibrahim-backend-production.up.railway.app
GOOGLE_MAPS_API_KEY          ← ajouté 2026-05-21
GOOGLE_SERVICE_ACCOUNT_JSON  (Google Calendar)
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
GROQ_API_KEY
OPENAI_API_KEY
GEMINI_API_KEY
ASSEMBLYAI_API_KEY
```

### Manquantes ❌
```
FIREBASE_SERVICE_ACCOUNT_JSON  ← attendre APK juin 2026
TWILIO_ACCOUNT_SID             ← août 2026
TWILIO_AUTH_TOKEN              ← août 2026
TWILIO_WHATSAPP_FROM           ← août 2026
```

---

## TABLES SUPABASE COMPLÈTES

```
cars                    — véhicules (id, name, base_price, resale_price, category, available...)
bookings                — réservations (status: PENDING/CONFIRMED/REJECTED/ACTIVE/COMPLETED)
profiles                — admins
payments                — paiements
reviews                 — avis clients
pricing                 — tarification
document_access_logs    — logs accès documents
payment_logs            — logs paiements
ibrahim_memory          — mémoire permanente Dzaryx
conversations           — historique conversations
ibrahim_rules           — règles métier anciennes
integrations            — config intégrations
notifications           — notifications
tasks / task_runs       — tâches schedulées
validations             — validations en attente
user_preferences        — préférences utilisateur
projects                — projets
learned_rules           ← Phase 8 — règles apprises conversations
assistant_profiles      ← Phase 8 — profil Dzaryx par acteur (Kouider/Houari)
user_behavior           ← Phase 8
conversation_patterns   ← Phase 8
contracts               ← Phase 8 — contrats PDF
payment_links           ← Phase 8 — liens Chargily (futur)
whatsapp_messages       ← Phase 8 — log WhatsApp (futur)
vehicle_states          — inspection avant/après location
client_intelligence     — score VIP/FREQUENT/REGULAR/NEW
memory_facts            — mémoire structurée longue durée
user_profile            — profil Kouider + Houari

RPC: check_car_availability, check_vehicle_availability, create_booking_safe, get_booking_summary
```

---

*Généré 2026-05-21 — session complète GPS + Phase 8 + Simulateur GitHub Pages*
*Commits: c5c4589 (dernier) — feat(gps): Distance Matrix + calculate_delivery_fee*
