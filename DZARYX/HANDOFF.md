# DZARYX — Handoff Agent AI COMPLET

> **VERSION COMPLÈTE 2026-05-20** — Ce fichier permet à un agent AI qui n'a JAMAIS vu ce projet
> de reprendre exactement là où on s'est arrêté, comme s'il avait tout construit lui-même.
> LIS CE FICHIER ENTIER avant de toucher au code.

---

## 1. C'est quoi Dzaryx ?

**Dzaryx** (ex-Ibrahim) = assistant AI complet pour Kouider, gérant de **Fik Conciergerie Oran** (location de voitures en Algérie).

Kouider travaille en Belgique comme employé. Son ami/associé Houari gère les voitures physiquement à Oran.
Kouider manage tout à distance via Dzaryx : réservations, finances, clients, documents, marketing.

**Le vrai business :**
- Houari possède les voitures → prix "propriétaire" (ex: Jumpy 44€/j)
- Kouider loue au client à prix plus élevé (ex: 55€/j)
- Profit Kouider = (prix client - prix Houari) × nb jours
- RÈGLE ABSOLUE : ce profit se calcule UNIQUEMENT depuis Supabase, JAMAIS depuis un catalogue

**Canaux actuels (à remplacer par l'APK) :**
- Telegram Bot → canal principal Kouider (BIENTÔT REMPLACÉ par APK)
- PWA React → `mobile/` sur Netlify (interface secondaire)
- Simulateur web → `simulator/` sur Netlify (demo + tests avant APK)
- APK natif → `dzaryx-native/` (code prêt, build bloqué EAS jusqu'au 1er juin 2026)

---

## 2. Lire dans cet ordre

1. **CURRENT_STATE.md** ← État exact maintenant, ce qui marche, prochaine priorité
2. **BUGS.md** ← Bugs ouverts (PRIORITÉ)
3. **ROADMAP.md** ← Phases terminées + planifiées
4. **ARCHITECTURE.md** ← Comment le code est structuré
5. **DATABASE.md** ← Schéma Supabase complet

---

## 3. Stack technique

| Composant | Techno | URL / Notes |
|---|---|---|
| Backend API | Node.js TypeScript / Express | Railway — auto-deploy sur push `main` |
| Base de données | Supabase (PostgreSQL) | RLS activé, clé service pour docs |
| Cache / Queue | Upstash Redis | Nonces anti-replay, BullMQ jobs |
| AI principal | Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| AI fallback | OpenAI GPT-4o / Gemini / Groq | via LLM Router |
| Voix STT | Groq Whisper | auto-detect fr/ar/darija |
| Voix TTS | ElevenLabs | voix de Dzaryx |
| Telegram Bot | Bot Python (telegraf) | Canal principal Kouider |
| Mobile PWA | React 18 + Vite + Tailwind | Netlify |
| Simulateur | React + TS + Vite | Netlify — https://dzaryx-simulator.netlify.app |
| APK Natif | Expo SDK 54 / React Native | `dzaryx-native/` — EAS build reset 1er juin |
| PC Agent | Python + Socket.IO | `nexus/` — tourne PC Kouider, namespace `/nexus` |
| Storage fichiers | Supabase Storage | bucket `client-documents` (privé, URLs signées) |
| Vidéo marketing | FFmpeg sur Railway | 720×1280, voiceover ElevenLabs |
| Search web | SearXNG + Jina Reader | Hébergés séparément, sans clé API |

---

## 4. Règles absolues de développement

### Calcul financier — RÈGLE FONDAMENTALE
```
profit_kouider = (client_price_per_day - owner_price_per_day) × nb_days

JAMAIS :
- catalog.benefit × nb_days     ← FAUX — utilise des prix inventés
- catalog.kouiderPrice           ← FAUX
- catalog.houariPrice            ← FAUX

SI owner_price_per_day = NULL :
→ profit = null  (JAMAIS inventé, JAMAIS catalogue)
→ Afficher : "Impossible de calculer sans données financières réelles"
```

**Fonctions à utiliser :**
- `computeBookingFinancials()` → `backend/src/integrations/finance.ts`
- `resolveFinancials()` → `backend/src/integrations/phase5-finance.ts`

### Sécurité Git
```bash
# TOUJOURS
git add <fichiers spécifiques>      # JAMAIS git add -A ni git add .
npx tsc --noEmit                    # DOIT retourner 0 erreurs avant commit

# JAMAIS
git add -A  / git add .             # risque inclure .env secrets
--no-verify                         # ne jamais bypasser hooks
--force push                        # interdit sur main
```

### Variables sensibles — JAMAIS dans le code
```
MOBILE_TOKEN_HOUARI = 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
  → Ajouter manuellement dans Railway Dashboard (action Kouider)
EAS Token = G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6
  → Révoquer sur expo.dev après APK build
Maps API Key = AIzaSyAv7s2qAJiHwsAzVmeA25UEOmo8p6FIsyo
  → Restreindre Google Cloud Console → Distance Matrix API only
Netlify Site ID = 4734de84-0223-4bec-ba6c-d3e1eb87217e
  → Token dans .env (jamais committer)
```

---

## 5. Architecture — 1 paragraphe

Message arrive Telegram/Mobile → `orchestrator.ts` construit contexte via `context-builder.ts` → route vers 1 des 14 agents via `core-router.ts` → `orchestrator-engine.ts` appelle Claude API avec outils → `tool-executor.ts` exécute les outils Supabase → 4 Gates filtrent la réponse (Gate1: Phantom Guard, Gate2: Finance anti-hallucination, Gate3: State claims, Gate4: Scope) → réponse envoyée. Le simulateur `simulator/` connecte via Socket.IO `/mobile` + REST API Railway.

---

## 6. Déploiement

### Backend (Railway — auto)
```bash
git add backend/src/<fichiers>
git commit -m "fix: description\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main    # Railway redéploie en ~2min
```

### Simulateur (Netlify — manuel)
```bash
cd simulator && npm run build && node make-zip.mjs
# Puis PowerShell :
$token = (Get-Content "../.env" | Where-Object { $_ -match "NETLIFY_TOKEN" } | ForEach-Object { ($_ -split "=", 2)[1] })
$bytes = [System.IO.File]::ReadAllBytes("dist.zip")
Invoke-RestMethod -Uri "https://api.netlify.com/api/v1/sites/4734de84-0223-4bec-ba6c-d3e1eb87217e/deploys" -Method Post -Headers @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/zip" } -Body $bytes
```

### APK (EAS — reset 1er juin 2026)
```bash
cd dzaryx-native
EXPO_TOKEN=G7nmf_7VE1RreEeM3E5orMQJiVvGhLYt7Ze1jCN6 npx eas build --platform android --profile preview --non-interactive
```

---

## 7. Fichiers critiques

| Fichier | Rôle |
|---|---|
| `backend/src/conversation/orchestrator.ts` | Point d'entrée AI, Guards 1-4, routing agents |
| `backend/src/agents/agent-registry.ts` | Les 14 agents : id, keywords, toolNames, LLM config |
| `backend/src/agents/core-router.ts` | Routing automatique par keywords + priority |
| `backend/src/orchestrator/anti-hallucination.ts` | Gates 2+3 bloquants (finance + state) |
| `backend/src/integrations/finance.ts` | `computeBookingFinancials()` — calculs réels |
| `backend/src/integrations/phase5-finance.ts` | `resolveFinancials()` — dashboard |
| `backend/src/integrations/tool-executor.ts` | Exécution outils Claude → Supabase |
| `backend/src/integrations/supabase.ts` | Client Supabase + interfaces TypeScript |
| `backend/src/bi/revenue-intelligence.ts` | Revenus semaine/mois, scoring clients |
| `simulator/src/components/Phone.tsx` | Coque téléphone + boot/login/logout/power-off |
| `simulator/src/services/api.ts` | API layer simulateur (business.* + actor management) |
| `nexus/modules/ws_client.py` | Events Socket.IO Nexus |
| `dzaryx-native/app/chat.tsx` | Chat vocal natif + Socket.IO `/mobile` |
| `dzaryx-native/lib/store.ts` | Zustand store : mobileToken, sessionId, actorId |

---

## 8. Les 14 Agents (résumé)

| Agent | Keywords clés | LLM |
|---|---|---|
| 📋 Booking | réservation, louer, disponib, voiture, agenda | Claude Sonnet |
| 💰 Finance | revenu, profit, impayé, CA, encaissé, rapport | Claude Sonnet |
| 👤 Clients | passeport, document, permis, WhatsApp, profil | Claude Sonnet |
| 📅 Planning | calendrier, rappel, météo, news, demain | Claude Haiku |
| 🎨 Marketing | image, photo, pub, fond, Instagram, overlay | Gemini Flash |
| 🎬 TikTok | vidéo, viral, hashtag, fais une vidéo, TikTok | Claude Sonnet |
| 🧠 Mémoire | souviens, mémorise, préférence, habitude | Claude Haiku |
| ⚙️ Code | github, deploy, railway, typescript, debug | Claude Sonnet |
| ✨ Designer | ui, design, css, interface, composant | Gemini Flash |
| 🔍 Code Reviewer | review, audit, faille, sécurité, refactor | OpenAI GPT-4o |
| 📡 Veille | concurrent, benchmark, veille, marché Oran | Claude Sonnet |
| 🎞️ Créateur Vidéo | pipeline vidéo, script, capcut, voiceover | Claude Sonnet |
| 📓 Obsidian | obsidian, vault, profil client, note | Claude Sonnet |
| 🌐 Général | catch-all (tout le reste) | Claude Sonnet |

---

## 9. Proactivité Dzaryx

Dzaryx envoie des messages automatiquement, sans que Kouider ne demande rien :

| Heure | Message |
|---|---|
| 07:00 | Briefing matinal : CA jour, retours, impayés, météo |
| 08:15 | Alertes impayés (48h → normal, 72h+ → urgent) |
| J-1h retour | Rappel retour voiture + montant à encaisser |
| 17:00 | Alerte docs manquants |
| 18:30 | Bilan journée : encaissé, nouvelles résas, résumé |
| Veille soir | Liste arrivées lendemain |
| Temps réel | Anomalies : perte, grande résa > 2000€, voiture surutilisée |

---

## 10. Simulateur — Mode d'emploi

URL : **https://dzaryx-simulator.netlify.app**

**Boot :**
1. Téléphone affiché en mode verrouillé
2. Clic n'importe où OU bouton power droit → écran d'accueil (HomeScreen)
3. Tap sur l'icône Dzaryx → login (kouider/kouider31 ou houari/houari31)
4. L'app s'ouvre → 13 onglets scrollables en bas

**Onglets :**
- VOIX : robot animé, microphone, scan OCR, vision caméra
- CHAT : conversation texte avec Dzaryx (données réelles Railway)
- TELEGRAM : simulation Telegram avec 6 canaux de messages Dzaryx
- DZARYX : tous les 14 agents, moteur proactif, liste capacités
- RESAS : liste réservations réelles avec KPI
- PARC : état parc avec toggle dispo/indispo
- CA : revenus mensuel/annuel avec split K/H
- CLIENTS : liste scorée VIP/FREQUENT/REGULAR/NEW
- AGENDA : calendrier mensuel avec dots réservations
- ALERTES : rappels HIGH/MEDIUM/LOW avec dismiss
- RAPPELS : rappels proactifs
- DOCS : documents clients + scan OCR
- CONFIG : acteur, statut système

**Power-off :**
Bouton droit du téléphone (quand app ouverte) → animation fond noir → logo Dzaryx → "ARRÊT EN COURS" → retour lock screen

---

## 11. APK natif — État du code

Dossier `dzaryx-native/` — Expo SDK 54 / React Native 0.81.5

**Écrans :**
- `app/chat.tsx` — chat vocal + text + SCAN OCR
- `app/voice.tsx` — mode voix (hold mic, car mode, acteur-scoped token)
- `app/bookings.tsx` — liste + search réservations
- `app/new-booking.tsx` — créer réservation (client+voiture+dates+PPD)
- `app/booking-detail.tsx` — détail + édition + appel + suppression
- `app/fleet.tsx` — parc avec toggle dispo
- `app/revenue.tsx` — CA aujourd'hui/semaine/mois
- `app/reminders.tsx` — rappels HIGH/MEDIUM/LOW
- `app/clients.tsx` — liste clients scorée
- `app/documents.tsx` — fetch docs + scan caméra OCR
- `app/settings.tsx` — backend ping, version, logout

**Multi-acteur :**
- `lib/store.ts` — Zustand : mobileToken (acteur-scoped), sessionId, actorId
- Kouider = token Railway `MOBILE_TOKEN`
- Houari = token Railway `MOBILE_TOKEN_HOUARI` (À AJOUTER dans Railway)

---

## 12. Base de données — Tables principales

```sql
bookings         ← réservations (client_price_per_day, owner_price_per_day, profit_kouider, rented_by)
cars             ← parc véhicules (name, available, image_url, base_price)
profiles         ← clients (scoring VIP, intelligence, historique)
payments         ← paiements (PENDING/PARTIAL/PAID)
reviews          ← avis clients
client_documents ← passeports/permis/contrats (storage_path pour URLs signées)
document_access_logs ← audit trail accès documents
memory_facts     ← mémoire long terme Dzaryx (user_id='kouider' ou 'houari')
```

---

## 13. Après chaque modification (obligatoire)

| Action | Fichier à mettre à jour |
|---|---|
| Bug fixé | `DZARYX/BUGS.md` → 🔴 → ✅ FIXÉ + date |
| Feature ajoutée | `DZARYX/ROADMAP.md` → 🔵 → ✅ |
| N'importe quoi | `DZARYX/CHANGELOG.md` → entrée en haut (date, commit, description) |
| Fin de session | `DZARYX/CURRENT_STATE.md` → mettre à jour tout |

---

## 14. Si quelque chose ne marche pas

```
1. Railway logs → backend crash ?
2. Supabase → table existe ? (RLS bloque ?)
3. Redis Upstash → UP ?
4. cd backend && npx tsc --noEmit → lire erreurs
5. Chercher dans BUGS.md
6. Ajouter dans BUGS.md si nouveau
```

---

## 15. État système au 2026-05-20

| Composant | Statut | Dernière action |
|---|---|---|
| backend/ | ✅ Railway déployé | TypeScript 0 erreurs |
| nexus/ (Python) | ✅ PC Kouider | Streaming SSE OK |
| mobile/ (React PWA) | ✅ Netlify | Dashboard + Chat |
| simulator/ | ✅ Netlify 364KB | 13 tabs, Telegram démo, Capacités |
| dzaryx-native/ | 🟡 Code prêt | APK bloqué EAS → reset 1er juin |
| Telegram Bot | ✅ Opérationnel | Canal principal Kouider |
| Proactivité | ✅ Active | Briefing 07:00, alertes impayés, retours |
| Anti-hallucination | ✅ 4 Gates bloquants | Finance + State + Phantom + Scope |

---

## Contacts

- **Propriétaire** : Kouider (kouiderpablo@gmail.com) — Belgique + Oran
- **Associé** : Houari — gère les voitures physiquement à Oran
- **Repo GitHub** : `kouider213/ibrahim`
- **Railway** : compte Kouider
- **Supabase** : compte Kouider
