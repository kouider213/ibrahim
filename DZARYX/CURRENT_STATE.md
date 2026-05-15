# DZARYX — État Actuel du Projet

> **CE FICHIER EST MIS À JOUR À CHAQUE FIN DE SESSION.**
> Tout agent AI lit ce fichier EN PREMIER pour savoir où en est le projet.
> Dernière mise à jour : 2026-05-15 (soir)

---

## Où en est le projet (maintenant)

**Phase active : Anti-hallucination — TERMINÉE ✅. Phase 6 (Mobile) — TERMINÉE ✅. Phase 5 (Finance) — TERMINÉE ✅.**

Système financier normalisé. 12 agents spécialisés opérationnels. Recherche web réelle (SearXNG+Jina). Documents clients récupérés + envoyés Telegram. Réservations créées directement. Vidéo marketing 720×1280 active. Planning Kouider embarqué. Revenus prorabilisés corrects. Dashboard mobile : 10 panels complets. **Anti-hallucination : 7 gates bloquants + fastPathGuard — Dzaryx ne ment plus, ne fabrique plus de données.**

---

## Ce qui fonctionne ✅

### Finance & Revenus
- ✅ Calculs financiers : vrais prix (client_price_per_day × nb_days), zéro catalogue
- ✅ Profit Kouider : calculé depuis Supabase, null si données manquantes (jamais inventé)
- ✅ Revenus **prorabilisés** : today = 1 jour × tarif, semaine = overlap 7 jours, mois = overlap mois
- ✅ "Donne moi les revenu" : FINANCE_AGENT + Claude-Sonnet + outils réels (B006 fixé)
- ✅ Fast-mode exclu pour finance : tous les mots FR (revenu/bénéfice/profit...) → full Claude + tools
- ✅ Anti-hallucination Gates 1/2/3/4/4b/4c : bloquants (pas log-only)
- ✅ fastPathGuard : Groq/Gemini/OpenAI bloqués si claims business data sans outils
- ✅ System prompt : RÈGLE ABSOLUE CONNAISSANCE EN TEMPS RÉEL

### Réservations
- ✅ `create_booking` : crée directement sans confirmation, stocke vrais prix financiers
- ✅ `car_id` résolu depuis `car_name` (plus d'UUID demandé à Claude)
- ✅ `payment_status` normalisé UNPAID par défaut
- ✅ Suppression réservation → suppression événement Google Calendar automatique
- ✅ Gate 2 exemptée pour create/update_booking (opérations légitimes)

### Documents Clients
- ✅ `get_client_document` : récupère passeport/permis/contrat depuis Supabase (service key)
- ✅ Envoi automatique document dans Telegram (buffer multipart, pas URL privée)
- ✅ Filtres ilike Supabase corrigés (URLSearchParams + `*` bien encodé)
- ✅ `passeport` dans TOOL_KEYWORDS → route Claude avec outils

### Recherche Web & Veille
- ✅ `web_search` : cascade SearXNG → Jina Reader → fallback (vraies données, pas hallucination)
- ✅ Jina Reader : fonctionne sur YouTube, TikTok, sites normaux
- ✅ GENERAL_AGENT : minimum 2 recherches, jamais de demande permission
- ✅ NETWORK_ANALYST : veille concurrents multi-sources avec hashtags contextuels
- ✅ Queries concurrents routées vers Claude agentic loop (pas Groq/Gemini sans tools)

### Marketing & Médias
- ✅ Création vidéo marketing : TIKTOK_AGENT → FFmpeg 720×1280 (zoompan retiré, OOM résolu)
- ✅ Livraison Telegram : `sendPhotoBuffer` buffer direct (jamais URL Supabase privée)
- ✅ `get_car_photo` : photos réelles du parc depuis Supabase/Cloudinary
- ✅ Images Cloudinary envoyées directement dans Telegram

### Planning & Proactivité
- ✅ `KOUIDER_SCHEDULE` embarqué : 7 jours × (wake/travail Belgique/business Algérie/famille)
- ✅ Notifications proactives : heure réveil par jour (pas heure fixe), message personnalisé
- ✅ Notifications business/famille envoyées même pendant heures travail Belgique
- ✅ Dzaryx sait : employé gère remise physique véhicules en Algérie (pas Kouider)

### Agents & Routing
- ✅ 12 agents spécialisés : routing automatique par keywords + priority
- ✅ Historique conversation : ne hijacke plus les agents (priority override retiré)
- ✅ CODE_AGENT : "créer" retiré des keywords (ne vole plus les requêtes vidéo/image)
- ✅ Vision cascade : Gemini Flash → OpenAI GPT-4o Vision → Claude Haiku

### Infrastructure
- ✅ Bot Telegram : répond, full opérationnel
- ✅ Nexus PC Agent : streaming SSE terminal live (asyncio par ligne)
- ✅ Nonce anti-replay : Redis NX EX 600
- ✅ document_access_logs : table OK, logs écrits, catch non-silencieux
- ✅ Google Calendar : lecture + création + suppression événements
- ✅ Scan caméra live, OCR passeport, Voucher PDF
- ✅ TypeScript : 0 erreurs | Railway déployé | Netlify déployé

### Dashboard Mobile (Phase 6)
- ✅ **BookingForm** : création réservation depuis mobile (voiture, client, dates, prix, profit live)
- ✅ **CalendarView** : heatmap mois réservations (4 niveaux), stats mois, état parc
- ✅ **ClientsView** : liste scorée VIP/FREQUENT/REGULAR/NEW, search, filtre, tel: cliquable
- ✅ **BottomNav** : 10 items, overflow-x scroll masqué, min-width par bouton
- ✅ Build Netlify : 12 chunks propres, 0 erreurs TS, déployé commit `bc06bc4`

---

## Ce qui ne fonctionne pas / incomplet ❌

### Aucun bug critique connu ✅

Tous les bugs B001–B006 sont fixés. Anti-hallucination complet (Gates 1-4c + fastPathGuard). Voir `BUGS.md` pour détails.

---

## Prochaine priorité (à faire maintenant si tu reprends)

- **Backfill `owner_price_per_day`** dans Supabase (SQL Editor) pour les réservations existantes → profits non null. Voir plan SQL dans `HANDOFF.md`.
- **Phase 7** : à définir selon besoins Kouider.
- Tester Dzaryx en prod : demander "tes revenus ce mois" sans tool → doit refuser proprement.

---

## Dernières sessions (2026-05-14 + 2026-05-15)

**14 mai — travail effectué (20+ commits) :**
- Système documents clients complet (get_client_document, service key, envoi Telegram)
- Réservations : car_id depuis nom, payment_status normalisé, création directe sans confirmation
- Recherche web réelle : SearXNG + Jina Reader + Jina YouTube/TikTok
- GENERAL_AGENT : web_search toujours actif, min 2 tentatives, sans permission
- Veille concurrents multi-sources avec vrais résultats web
- `get_car_photo` : photos réelles parc dans marketing
- Vidéo 720×1280 livrée dans Telegram via buffer (B005 fixé)
- Routing : history priority override retiré, CODE_AGENT keywords nettoyés
- Google Calendar : delete événement sur suppression réservation

**15 mai — travail effectué :**
- Planning Kouider 7 jours embarqué dans system prompt
- Notifications proactives per-day (heure réveil réelle, pas fixe)
- Business/famille prioritaires même pendant travail Belgique
- Revenus prorabilisés : today/week/month = jours réels × tarif journalier
- B006 fixé : "Donne moi les revenu" → FINANCE_AGENT + Claude-Sonnet + vrais outils
- Fast-mode exclu pour tous mots finance FR
- B002 fixé : Redis TTL 1800→300s + endpoint POST /api/bi/cache/clear
- B003 fixé : checkAnomalies() overlap date filter correct
- **Phase 6 Mobile** : BookingForm + CalendarView + ClientsView + BottomNav 10 items

**Dernier commit** : `71d2b1c` fix(anti-hallucination): Gates 4/4b/4c + fastPathGuard

---

## Stack rapide

```
Backend   : Node.js TypeScript / Express / Railway (auto-deploy push main)
DB        : Supabase (PostgreSQL)
Cache     : Upstash Redis
AI        : Claude Sonnet 4.6 (primary) + OpenAI/Gemini/Groq fallback
Mobile    : React 18 PWA (Vite + Tailwind) — Netlify
PC Agent  : Python Nexus (nexus/) — tourne sur PC Kouider, namespace /nexus
PC Agent2 : TypeScript pc-agent (pc-agent/) — namespace /pc
Telegram  : canal principal Kouider
Flight Bot: Python séparé (flight-bot/) — vols personnels Kouider
```

## État des composants

| Composant | Statut | Notes |
|---|---|---|
| backend/ | ✅ Déployé Railway | TypeScript 0 erreurs |
| nexus/ (Python) | ✅ Tourne sur PC | Streaming SSE OK |
| mobile/ (React) | ✅ Déployé Netlify | Dashboard + Chat |
| pc-agent/ (TS) | ❓ Non vérifié | Alternative à Nexus |
| flight-bot/ | ❓ Non vérifié | Indépendant |

---

## Comment mettre à jour ce fichier

À la fin de chaque session, mettre à jour :
- La date en haut
- La section "Ce qui fonctionne"
- La section "Ce qui ne fonctionne pas"
- La section "Prochaine priorité"
- La section "Dernière session"
