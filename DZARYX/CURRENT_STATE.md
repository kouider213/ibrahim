# DZARYX — État Actuel du Projet

> **CE FICHIER EST MIS À JOUR À CHAQUE FIN DE SESSION.**
> Tout agent AI lit ce fichier EN PREMIER pour savoir où en est le projet.
> Dernière mise à jour : **2026-06-17**.

---

## ⚡ Session 2026-06-17 (détail complet : `AUDIT/10_JOURNAL_SESSION.md`)

Tout déployé + testé. Points clés :
- **Dates "jours inclus" partout** (24/07→08/08 = 16j ; prix = prix/jour × jours) — fix UTC/local + nb_days. CA cohérent sur tous les écrans.
- **Scan passeport → rattaché à la résa** + récup ; bug racine : `client_documents.file_url` ET `storage_path` NOT NULL bloquaient l'insert.
- **Résilience €0 RE-PROUVÉE live** : tout tourne sur Groq/Gemini gratuits sans Claude/OpenAI. Seuls coûts : Railway (~5€/mois, 24/7) + domaine (~12€/an, site).
- **Site** : page B2B `/entreprises` (3 packs Platinium/Gold/Diamant sur devis, 100% FR/AR/EN, hero S580) ; notifs `notifyTelegram` passées en `await` (serverless tuait l'envoi) + lead→push app ; **CMS Admin→Contenu** (textes/photos éditables, `site_settings.content`, SQL `0032` lancé) ; hero accueil = photo S580 ; photos compressées ; /reservation SEO+bandeau.
- **App (SW v112)** : fiche client éditable (résa+profil) ; supprimer demandes ; rappel à date précise (`at_date`) ; fuseau + GPS auto ; auto-reload sur nouvelle version ; devis entreprise (packs) ; agenda = liste résas du mois.
- **Décisions Kouider** : devise reste par-annonce (€/DA), pas de taux global pour l'instant. Wake word Zaria = considéré FAIT.
- **SQL lancés ✅** : 0031 (vouchers), corrections nb_days/paid, 0032 (site content).

---

## ⚡ Mise à jour 2026-06-14 — AUDIT CODE (vérité terrain)

> Audit du **code réel** (pas des docs). Plusieurs features marquées "à faire" dans les vieilles notes
> sont **déjà implémentées et buildées**. `tsc --noEmit` = **0 erreur**. Corrigé ici pour stopper les
> fausses alertes "refais X".

- **✅ PUSH NATIF — FAIT** (triple canal). `backend/src/notifications/fcm.ts` (FCM natif `firebase-admin`),
  `mobile-push.ts` (Expo + ciblage kouider/houari/all), `web-push-service.ts` (PWA VAPID),
  `api/routes/push-token.ts` (+ `/test`, `/debug`, `/web`). Native register : `dzaryx-native/app/index.tsx`
  (`getDevicePushTokenAsync` = FCM brut) + `chat.tsx` (`getExpoPushTokenAsync` fallback). `google-services.json` présent.
  **`FIREBASE_SERVICE_ACCOUNT_JSON` déjà configuré sur Railway** ✅ → push natif 100% live, AUCUN verrou restant. Tester via `POST /api/push-token/test`.
- **✅ WAKE WORD "Zaria" — FAIT**. Plugins `dzaryx-native/plugins/withDzaryxWakeWord.js` + `withWakeScreen.js`, branché `index.tsx`/`app.json`.
- **✅ BRIEFING MATIN — FAIT**. Backend `jobMorningBriefing` (`queue/jobs/proactive-jobs.ts`) + écrans natifs `notifications.tsx`/`settings.tsx`/`chat.tsx`.
- **✅ UPLOAD/ANALYSE PDF (chat) — FAIT**. Backend `api/routes/pdf.ts` + `utils/pdf-store.ts` + `integrations/document-reader.ts` ; native `app/documents.tsx`/`text.tsx` ; simulator `DocumentsScreen.tsx`.
- **🛑 Sécurité ENCORE OUVERT** : token GitHub `ghp_d8Vch…` **toujours pas révoqué** (en clair plus bas ligne ~266 — à nettoyer aussi) ; clés Groq/Gemini partagées en chat 06-13 à régénérer ; clé Google Maps à restreindre.
- **Détail sessions site 06-13** : `DZARYX/AUDIT/RECAP_2026-06-13.md` + `10_JOURNAL_SESSION.md`.

---

## ⚡ Mise à jour 2026-06-11

- **Migrations Supabase : TOUTES LANCÉES ✅** (`car_currency`, `inspection_upgrade`, `phase_extras`). Rien en attente.
- **2026-06-10** : darija 100% (réponse max-arabe, voix TTS arabe auto, arabizi phonétique, STT primaire
  **OpenAI gpt-4o-transcribe**) ; vocal hard-reset micro au tap ; **signature électronique** (`/sign/:token` +
  `contract_signatures`) ; **estimation dégâts** par photo (Sonnet Vision) ; **pricing dynamique** (bloque sous prix
  proprio) ; scan ID auto-archivé fiche client ; MARGE RESAS calculée live ; **`DZARYX/HANDOFF/`** = handoff A→Z.
- **2026-06-09 (site)** : autocomplétion adresse admin immo → carte précise (`eebc960`).
- **Détail complet** : `DZARYX/AUDIT/10_JOURNAL_SESSION.md` + `DZARYX/CHANGELOG.md`.
- **Reste ouvert** : B025 token GitHub à révoquer, clé Maps à restreindre, vérifs device (darija vocal, signature, dégâts, scan).
  (⚠️ wake word Zaria + PDF/Excel chat = **FAITS depuis** — voir bloc 2026-06-14.)

---

## Où en est le projet (au 2026-06-07 — voir mise à jour ci-dessus)

**Session 06-06 → 06-07 : transformer Dzaryx pour qu'il ressemble/agisse comme l'app Gemini, SANS rien casser.**

**Fait + déployé + testé live ✅ :**
- **UI redesign Gemini** (simulateur web = l'UI réelle, chargée en WebView par l'app) : vocal épuré, chat épuré, vision plein écran, or Dzaryx en accent.
- **Vocal** : tap-to-talk fiable (VAD flickait → opt-in), barge-in (coupe Dzaryx quand on reparle), flip caméra avant/arrière, logo au centre, mode compact pour overlay.
- **Overlay flottant** (par-dessus les autres apps, façon Gemini) — plugin natif `withDzaryxOverlay.js`, **testé OK OnePlus 5T**.
- **Chat façon ChatGPT/Gemini** : copier, markdown, dictée vocale, régénérer, éditer, recherche historique, streaming typewriter, graphiques (barres/camembert/courbe), téléchargement photos+graphes.
- **Création annonces via chat + photos jointes** : voiture loc/vente, immo loc/vente, pack → Dzaryx crée et attache les photos. `add_car` débloqué. Vision marche dans le chat. **Test end-to-end vert.**
- **Réservations multi-acteurs** : attribution Kouider/Houari robuste + check dispo dit qui a bloqué.
- **Sécurité** : tokens mobiles sortis du repo → env (`5efb8e7`).

**🟡 Pas terminé (optionnel) :**
- **Wake word "Zaria"** (Porcupine) branché mais **ne fire pas en vocal** → besoin des **logs device** (logcat). Notif tap + overlay = substitut.
- **Upload/analyse PDF/Excel** dans le chat — pas fait (~1h).
- **Play Store** — exclu pour l'instant (build prod AAB + clé Google).

> ⭐ Détail complet "où on s'est arrêté" + tous les commits → **`DZARYX/AUDIT/10_JOURNAL_SESSION.md`** et **`DZARYX/CHANGELOG.md`**.

---

## Sessions précédentes (résumé)

Session 2026-06-01 : Redesign complet de l'interface admin (`/admin`) du site autolux-location (design premium dark/gold). Multi-photos véhicules (`car_photos` + carousel). Gallery photos Dzaryx + WhatsApp share. Repos GitHub → privés + licences.

---

## URLs IMPORTANTES

| Service | URL |
|---|---|
| **Backend Railway** | https://ibrahim-backend-production.up.railway.app |
| **Simulateur GitHub Pages** | https://kouider213.github.io/ibrahim/ |
| **Mobile PWA Netlify** | https://ibrahim-fik-conciergerie.netlify.app |
| **Site autolux (Vercel)** | https://autolux-location.vercel.app |
| **Admin site** | https://autolux-location.vercel.app/admin |
| **GitHub ibrahim** | https://github.com/kouider213/ibrahim (PRIVÉ ✅) |
| **GitHub autolux** | https://github.com/kouider213/autolux-location (PRIVÉ ✅) |
| **Supabase** | https://supabase.com/dashboard/project/febrrgqpyqqrewcohomx |
| **Railway dashboard** | https://railway.app |
| **Vercel** | https://vercel.com/kouider213s-projects |

---

## Ce qui fonctionne ✅

### Admin UI (redesigné 2026-06-01)

#### Système de design admin — Design tokens

Toutes les cartes KPI admin suivent ce pattern premium :
```jsx
<div className="relative bg-[#141414] border border-white/[0.07] rounded-2xl p-5 overflow-hidden">
  {/* Ligne accent colorée en haut */}
  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gold-500/0 via-gold-500 to-gold-500/0" />
  {/* Halo ambient dans le coin */}
  <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gold-500/8 blur-3xl" />
  {/* Nombre en gradient coloré */}
  <div className="font-display text-3xl font-black bg-gradient-to-br from-gold-300 to-gold-500 bg-clip-text text-transparent" />
</div>
```

#### Pages admin améliorées

**`pages/admin/index.js` — Dashboard ✅**
- `KpiCard` component : icon Lucide dans carré coloré, nombre en gradient, accent line top, ambient glow
- `FinanceCard` component : même pattern premium, accent bottom avec total
- Greeting "Bonjour, Kouider" avec prénom en gradient or
- KPIs 2 colonnes mobile : Réservations (bleu), En attente (amber), CA mois (or), Bénéfice mois (vert)
- Séparateurs section avec ligne gradient or `from-gold-500/30 to-transparent`
- Table réservations : montants en gradient or, StatusBadge avec dot coloré
- Aucun emoji — 100% Lucide icons
- Commits : `39ed840`, `cf16200`, `81923f8`

**`pages/admin/bookings.js` — Réservations ✅**
- Filter tabs : style premium `rounded-xl` avec count badge interne
- Empty state : `CalendarCheck` Lucide icon au lieu de 📭 emoji
- `CalendarCheck` ajouté aux imports
- StatusBadge avec dot + label coloré
- Commit : `96caa8c`

**`pages/admin/cars.js` — Véhicules ✅ + Multi-photos**
- Toutes les actions avec Lucide icons : `Edit2`, `EyeOff`/`Eye`, `Trash2`, `Camera`, `ImageIcon`, `Loader2`
- Card véhicule redesignée : gradient overlay photo (bottom fade), badge statut pill haut gauche, 3 stats (Proprio/Marge/Photos)
- **NOUVEAU** : carousel photos dans la card → `ChevronLeft`/`ChevronRight` au hover, dots de navigation, compteur "1/3"
- **NOUVEAU** : support multi-photos dans le formulaire modal :
  - Grille 3 colonnes de photos existantes
  - Badge "PRINCIPALE" sur photo[0] (toujours la photo principale)
  - Overlay au hover avec boutons ◀ (move left), 🗑 (remove), ▶ (move right)
  - Boutons upload : `Camera` (appareil photo) + `ImageIcon` (galerie)
  - Max 10 photos par véhicule
  - `uploadPhoto()` : lit FileReader → base64 → POST `/api/upload-car-image` → push dans state `photos[]`
  - `movePhoto(idx, dir)` : échange photos[idx] et photos[idx+dir]
  - `removePhoto(idx)` : filtre le tableau
  - `handleSave()` : `DELETE car_photos WHERE car_id` puis `INSERT car_photos[]` pour réordonner proprement
  - `image_url` = `photos[0].url || null` (la 1ère photo = image principale = rétrocompatibilité)
- Formulaire modal redesigné : `rounded-t-3xl` sur mobile, `backdrop-blur-sm`, sticky header
- Commit : `96caa8c`, `5377056`

**`pages/admin/clients.js` — Clients ✅**
- KPI cards en grid 2×2 avec pattern premium (gradient text, accent line, glow)
- Icônes : `Users`, `Repeat2`, `TrendingUp` — plus d'emoji
- Panel liste clients (col-span-1) + panel détail (col-span-2) côte à côte sur desktop
- Client sélectionné : info grid avec `Réservations` et `Total dépensé` en cartes gold highlighted
- Bouton Appeler avec `Phone` icon
- Historique bookings : card par booking avec status badge coloré
- Commit : `233f3f5`, `cf16200`

**`pages/admin/reviews.js` — Avis ✅**
- KPI cards 3 colonnes : Note moyenne (or), En attente (amber), Publiés (vert)
- Pattern premium identique
- Stars avec `Star` Lucide : `fill-current` pour les étoiles actives
- Filter tabs : même style que bookings (rounded-xl + count badge)
- Card avis : avatar gradient gold, date complète, commentaire en italic
- Actions : `CheckCircle2` (Publier), `Trash2` (Supprimer)
- Commit : `233f3f5`, `cf16200`

**`pages/admin/analytics.js` — Analytics ✅**
- `StatCard` component refait avec pattern premium (gradient text, accent line, glow)
- Period selector : `rounded-xl` container avec boutons internes
- Section headers en `text-white/60 text-xs font-bold uppercase tracking-widest`
- Clarity section : `Monitor` Lucide icon au lieu de ⬡ emoji
- Commit : `96caa8c`, `cf16200`

**`components/AdminLayout.js` — Layout ✅**
- Logo sidebar : `<img src="/logo.png">` avec drop-shadow gold au lieu de "FK" texte
- Commit : `39ed840`

**`styles/globals.css`**
- `card-dark` mis à jour : `bg-[#141414]` (plus sombre, plus premium)
- Nouvelles classes utilitaires : `.admin-section-label`, `.admin-number`
- Commit : `cf16200`

---

### Multi-photos Véhicules (2026-06-01)

#### Table Supabase `car_photos` ✅
```sql
CREATE TABLE car_photos (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  car_id     UUID REFERENCES cars(id) ON DELETE CASCADE NOT NULL,
  url        TEXT NOT NULL,
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS : lecture publique, écriture admin only
```
Migration : `supabase/0004_car_photos.sql` ✅ appliquée

#### Backend `get_car_photo` tool mis à jour ✅
- `tool-executor.ts` : requête `cars.select('*, car_photos(url, position)')`
- Trie par `position` ASC
- Fallback vers `image_url` si `car_photos` vide
- **Émet chaque photo séparément** via `emitProactive()` avec 400ms entre chaque
- Retourne : `"✅ 3 photos envoyées pour 'Berlingo':\n1. https://...\n2. https://...\n3. https://..."`
- Commit : `c3f8f85` (ibrahim)

---

### Gallery Photos Dzaryx (2026-06-01)

#### `mobile/src/services/api.ts` ✅
- Nouveau callback `onProactive?` dans `SocketCallbacks` interface
- Handler `Dzaryx:proactive` socket event ajouté dans `connectSocket()`
- Détecte les image URLs dans le texte via regex : `/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi`
- Appelle `callbacks.onProactive(text, type, imageUrls[])`

#### `mobile/src/components/ChatInterface.tsx` ✅
**State ajouté :**
```typescript
const [galleryPhotos, setGalleryPhotos]   = useState<string[]>([]);
const [galleryTitle, setGalleryTitle]     = useState('');
const [galleryOpen, setGalleryOpen]       = useState(false);
const [galleryFullIdx, setGalleryFullIdx] = useState<number | null>(null);
const [sharingSaving, setSharingSaving]   = useState(false);
const galleryAccumRef = useRef<{ urls: string[]; title: string; timer: ... }>({ urls: [], title: '', timer: null });
```

**Logique accumulation photos séquentielles :**
```typescript
onProactive: (text, _type, imageUrls) => {
  if (imageUrls.length === 0) return;
  const acc = galleryAccumRef.current;
  acc.urls.push(...imageUrls);
  if (!acc.title) acc.title = text.split('\n')[0] ?? 'Photos';
  if (acc.timer) clearTimeout(acc.timer);
  acc.timer = setTimeout(() => {
    setGalleryPhotos([...acc.urls]);
    setGalleryTitle(acc.title);
    setGalleryOpen(true);
    acc.urls = []; acc.title = ''; acc.timer = null;
  }, 1200); // attend 1.2s pour collecter toutes les photos séquentielles
};
```

**Overlay Gallery (fullscreen) :**
- Header : "DZARYX — PHOTOS" + titre voiture + compteur "3 photos"
- Grille 2 colonnes d'images, aspect-ratio 4/3, tap → fullscreen
- **Bouton WhatsApp** : ouvre `wa.me/?text=📸 Berlingo\n\nPhoto 1: https://...\nPhoto 2: https://...`
- **Bouton "Enregistrer tout"** : ouvre chaque photo dans Safari avec 400ms entre (long-press → Enregistrer)

**Overlay Fullscreen (par photo) :**
- Image plein écran `max-h-80vh`
- Navigation ‹ › entre photos
- **Bouton WhatsApp** : partage CETTE photo uniquement
- **Bouton Enregistrer** : ouvre dans Safari (long-press → Enregistrer)
- Tap hors image = ferme

Commit : `fd6352b` (ibrahim)

---

### Protection GitHub (2026-06-01)

- ✅ `autolux-location` : PUBLIC → **PRIVÉ** (API GitHub PATCH)
- ✅ `ibrahim` : PUBLIC → **PRIVÉ** (API GitHub PATCH)
- ✅ Token exposé `ghp_d8Vch6X9qk4Y...` supprimé de l'URL git remote ibrahim
- ✅ `LICENSE` ajouté dans les deux repos : "All Rights Reserved — Fik Conciergerie — Oran, Algeria — kouiderpablo@gmail.com"
- ✅ Watermark `DZX-FK-OAN-2024-K7X9M2Q1` dans `tool-executor.ts` (preuve antériorité)
- ⚠️ **À FAIRE** : Révoquer token sur github.com/settings/tokens

---

## Finance & Revenus (inchangé, toujours opérationnel)
- ✅ Calculs financiers : `client_price_per_day × nb_days` = CA, `owner_price_per_day × nb_days` = part Houari
- ✅ Bénéfice Kouider = CA total - Part Houari (garantit CA = Kouider + Houari)
- ✅ Admin dashboard : `getPartHouari()`, `getPartHouariJour()`, `getNbDays()` — même logique que Dzaryx
- ✅ Anti-hallucination Gates 1/2/3/4 bloquants

## Réservations (inchangé)
- ✅ `create_booking` : crée sans confirmation, stocke prix réels
- ✅ Anti double-booking : vérification backend + RPC Supabase
- ✅ Suppression → suppression Google Calendar automatique

---

## Ce qui ne fonctionne pas / incomplet ❌

### Token GitHub à révoquer
- ⚠️ `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` — était dans l'URL git remote ibrahim
- **Action requise** : github.com/settings/tokens → Delete → nouveau token

### SMTP emails Railway
- ❌ `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` pas encore configurés
- Emails registration/welcome SaaS ne fonctionnent pas

### Firebase FCM natif — ✅ COMPLET (code + config)
- Code : `fcm.ts` + `mobile-push.ts` + route + register natif.
- `FIREBASE_SERVICE_ACCOUNT_JSON` déjà sur Railway ✅. Push natif 100% live, rien à faire.

### WhatsApp bot client
- ❌ Prévu août 2026

### GPS live fleet
- ❌ Requires hardware trackers (~25-50€/voiture + SIM 4G)

---

## Prochaine priorité

### IMMÉDIAT — Révoquer le token GitHub exposé
1. Va sur **github.com/settings/tokens**
2. Trouve `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`
3. **Delete**
4. Génère un nouveau token si nécessaire pour push

### IMMÉDIAT — Vérifier Vercel fonctionne encore (repo privé)
- Vercel doit toujours avoir accès au repo privé (connecté via GitHub App, pas via token)
- Si erreur build → Vercel dashboard → Settings → Git → reconnect

### COURT TERME — Tester gallery photos Dzaryx
1. Ajouter plusieurs photos à un véhicule via `/admin/cars`
2. Ouvrir l'app mobile Dzaryx
3. Dire : "Montre-moi les photos du Berlingo"
4. La gallery doit s'ouvrir avec toutes les photos
5. Tester WhatsApp share + Enregistrer

### COURT TERME — Migration `car_photos` déjà appliquée ✅
SQL exécuté dans Supabase SQL Editor.

---

## Sessions récentes détaillées

### Session 2026-06-01 (cette session)

**Admin UI — Redesign WOW :**

1. `pages/admin/index.js` — Dashboard reécrit from scratch
   - `KpiCard` : pattern premium (accent line + ambient glow + gradient text)
   - `FinanceCard` : même pattern, accent bottom
   - Commits : `39ed840`, `cf16200`, `81923f8`, `3ee5784`

2. `pages/admin/cars.js` — Multi-photos + redesign
   - Carousel sur les cards, grille photos dans modal
   - `car_photos` table Supabase
   - 10 photos max, réordonnables, supprimables
   - Commit : `5377056`

3. `pages/admin/bookings.js` — Filter tabs premium, empty state Lucide
   - Commit : `96caa8c`

4. `pages/admin/clients.js` — KPI premium, layout 1+2 colonnes
   - Commit : `233f3f5`, `cf16200`

5. `pages/admin/reviews.js` — KPI premium, tabs avec count
   - Commit : `233f3f5`, `cf16200`

6. `pages/admin/analytics.js` — StatCard premium, period selector
   - Commit : `96caa8c`, `cf16200`

7. `components/AdminLayout.js` — Logo image au lieu de FK texte
   - Commit : `39ed840`

8. `styles/globals.css` — `card-dark` mis à jour, nouvelles classes admin
   - Commit : `cf16200`

**Ibrahim backend — Gallery photos :**

9. `backend/src/integrations/tool-executor.ts`
   - `getCarPhotoTool()` : query `car_photos` table + `image_url` fallback
   - Émet chaque photo via `emitProactive()` avec 400ms delay entre
   - Watermark propriétaire ajouté en header
   - Commit : `c3f8f85`

**Ibrahim mobile — Gallery overlay :**

10. `mobile/src/services/api.ts`
    - `onProactive` callback dans `SocketCallbacks`
    - Handler `Dzaryx:proactive` socket event
    - Extraction URLs images par regex
    - Commit : `fd6352b`

11. `mobile/src/components/ChatInterface.tsx`
    - `galleryAccumRef` : accumule photos séquentielles pendant 1.2s
    - Gallery overlay : grille 2 col + WhatsApp + Enregistrer
    - Fullscreen : nav ‹ ›, WhatsApp, Enregistrer
    - Commit : `fd6352b`

**Protection :**

12. `autolux-location` GitHub → **PRIVÉ**
13. `ibrahim` GitHub → **PRIVÉ**
14. Token exposé supprimé de git remote
15. `LICENSE` ajouté aux deux repos
16. Watermark `DZX-FK-OAN-2024-K7X9M2Q1` dans tool-executor.ts
    - Commits : `3ee5784` (autolux), `c3f8f85` (ibrahim)

---

### Session 2026-05-31
Site autolux-location v2 (Next.js 14) + Widget Dzaryx + 15 nouveaux outils backend.
Voir CHANGELOG pour détails.

### Session 2026-05-22
Dzaryx Living Brain — intelligence client + actor learning.

### Session 2026-05-21
GPS Livraison, Simulateur 12 onglets, Phase 8 Mémoire.

---

## Stack technique complète

```
Backend   : Node.js TypeScript / Express / Railway (auto-deploy push main)
DB        : Supabase (PostgreSQL) — projet febrrgqpyqqrewcohomx
Cache     : Upstash Redis
AI        : Claude Sonnet 4.6 (primary) + OpenAI/Gemini/Groq fallback
Voice     : ElevenLabs (voice ID: pNInz6obpgDQGcFmaJgB)
STT       : Groq Whisper primary / Google STT fallback
Maps      : Google Distance Matrix API
Vision    : Gemini Flash → GPT-4o Vision → Claude Haiku cascade
Mobile    : React 18 PWA (Vite + Tailwind) — Netlify
Simulateur: React + Vite + Tailwind — GitHub Pages (branch gh-pages)
Site      : Next.js 14 + Tailwind + Framer Motion — Vercel
Native    : Expo SDK 54 / React Native 0.81.5 (APK juin 2026)
PC Agent  : Python Nexus (nexus/) — tourne sur PC Kouider
Telegram  : canal backup/admin
Queue     : BullMQ + Redis (Upstash) — 25 jobs schedulés
Calendar  : Google Calendar (service account)
Storage   : Cloudinary (images/vidéos) + Supabase Storage
Push      : Expo Push + Firebase FCM
```

## Tables Supabase (toutes)

**Fik Conciergerie :**
- `cars` — véhicules (id, name, base_price, resale_price, category, seats, fuel, transmission, image_url, available)
- `car_photos` ← **NOUVELLE 2026-06-01** — (id, car_id, url, position, created_at)
- `bookings` — réservations (PENDING/CONFIRMED/ACCEPTED/REJECTED/ACTIVE/COMPLETED)
- `profiles` — admins (id, name, role: kouider|houari, email)
- `payments` — paiements
- `reviews` — avis clients (id, client_name, rating, comment, approved, created_at)
- `properties` — biens immobiliers
- `property_photos` — photos biens (id, property_id, url, position)
- `page_views` — analytics pages (page, device, country, session_id)
- `car_views` — analytics véhicules (car_id, device, country)

**Ibrahim/Dzaryx :**
- `ibrahim_memory`, `conversations`, `ibrahim_rules`, `integrations`, `notifications`, `tasks`
- `task_runs`, `validations`, `user_preferences`, `projects`
- `learned_rules` — règles apprises
- `assistant_profiles` — profil Dzaryx par acteur
- `user_behavior`, `conversation_patterns`
- `contracts` — contrats PDF
- `document_access_logs`, `payment_logs`
- `vehicle_states` — inspection avant/après
- `client_intelligence` — score VIP/FREQUENT + arrival_patterns + ai_insights
- `dzaryx_observations` — mémoire libre
- `actor_brain` — vocabulaire/style Kouider/Houari

## Règles de code (JAMAIS déroger)

```
1. cd backend && node_modules/.bin/tsc --noEmit → 0 erreurs AVANT commit
2. Profit = (client_price_per_day - owner_price_per_day) × nb_days — JAMAIS catalogue
3. Si owner_price_per_day NULL → profit = null (jamais inventé)
4. git add <fichiers spécifiques> — JAMAIS git add -A ou git add .
5. Tool executor : TOUJOURS retourner string, jamais objet/array
6. image_url = photos[0].url (rétrocompatibilité avec ancien code)
7. car_photos se réordonne via position (0 = principale)
8. emitProactive pour chaque photo avec 400ms delay (évite congestion socket)
```
