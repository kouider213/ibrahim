# 00 — INDEX PROJET DZARYX

> Note principale. Liens vers toutes les autres notes.
> Statut global : **Phase Mobile Terminée ✅ | Simulateur Web ✅ | APK pending EAS (June 1)**

---

## Liens rapides

| Note | Sujet | Statut |
|------|-------|--------|
| [[01_ARCHITECTURE]]    | Schéma système complet | ✅ |
| [[02_BACKEND_RAILWAY]] | Endpoints API, WebSocket, variables env | ✅ |
| [[03_SUPABASE_DB]]     | Schéma BDD, tables, RLS | ✅ |
| [[04_APP_MOBILE_DZARYX]] | React Native Expo, build APK | 🟡 |
| [[05_SIMULATEUR_WEB]]  | Simulateur Android navigateur | ✅ |
| [[06_APP_WEB_NETLIFY]] | Ibrahim web app (Netlify) | ✅ |
| [[07_BOT_TELEGRAM]]    | Bot Telegram, commandes | ✅ |
| [[08_INTEGRATIONS_IA]] | Claude, Gemini, Groq, ElevenLabs | ✅ |
| [[09_NEXUS_PC]]        | Agent Python PC Kouider | ✅ |
| [[10_BUSINESS_FIK]]    | Logique métier conciergerie | ✅ |
| [[11_JOURNAL]]         | Journal de développement par session | EN COURS |
| [[12_GUIDE_REPRISE]]   | Guide pour reprendre le projet | ✅ |

---

## Présentation du projet

**Dzaryx** est l'assistant IA personnel de Kouider, gérant de **Fik Conciergerie Oran** (location de voitures de luxe en Algérie).

Dzaryx est accessible depuis :
- **Bot Telegram** (`/mobile` namespace) — principal canal
- **App Web Ibrahim** — `https://ibrahim-fik-conciergerie.netlify.app/`
- **App Native Android** — APK Expo (dzaryx-native/)
- **Simulateur Web** — nouvel outil de test (simulator/)

---

## Ce que sait faire Dzaryx

### Business Fik Conciergerie
- Voir/créer/modifier/supprimer réservations
- Calcul bénéfices Kouider/Houari en temps réel (Supabase live)
- Anti double-réservation
- Gestion flotte véhicules
- Génération contrats PDF + vouchers
- OCR passeport/permis (vision Gemini)
- Suivi client complet + intelligence VIP
- Rappels automatiques (retards, impayés, arrivées)
- Sync Google Calendar

### IA & Vision
- Analyse caméra en temps réel (Gemini Flash → OpenAI → Claude)
- Scan documents avec extraction de données
- Recherche web réelle (SearXNG + Jina Reader)
- Création vidéo marketing TikTok (FFmpeg)

### Vocal
- Voice Activity Detection (VAD) automatique
- Transcription Groq Whisper (FR/AR/darija)
- Réponse TTS ElevenLabs
- Barge-in possible

### Contrôle PC
- Nexus agent Python sur PC Kouider
- Commandes terminal + streaming live
- Screenshot PC envoyé Telegram
- Wake-on-LAN

---

## Architecture résumée

```
[Telegram/Mobile/Web] → [Railway Backend Node.js] → [Supabase PostgreSQL]
                                ↓                          ↓
                         [Claude AI Agents]         [Upstash Redis]
                                ↓
                    [ElevenLabs TTS / Groq / Gemini]
                                ↓
                         [Nexus PC Agent]
```

---

## URLs importantes

| Service | URL |
|---------|-----|
| Backend Railway | `https://ibrahim-backend-production.up.railway.app` |
| App Web (Netlify) | `https://ibrahim-fik-conciergerie.netlify.app/` |
| Expo Project | `https://expo.dev/accounts/fikdzaryx/projects/dzaryx` |

---

#dzaryx #index #projet
