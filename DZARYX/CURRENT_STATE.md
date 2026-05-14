# DZARYX — État Actuel du Projet

> **CE FICHIER EST MIS À JOUR À CHAQUE FIN DE SESSION.**
> Tout agent AI lit ce fichier EN PREMIER pour savoir où en est le projet.
> Dernière mise à jour : 2026-05-14 (soir)

---

## Où en est le projet (maintenant)

**Phase active : Phase 5 (Finance) — TERMINÉE ✅. Phase 4 Nexus — En cours 🔄. Prêt pour Phase 6.**

Système financier normalisé. 12 agents spécialisés opérationnels. Système vidéo marketing actif (fallback photo confirmé, vidéo FFmpeg à vérifier en prod). Vault Obsidian "brain dzaryx" complet avec 12 notes interconnectées.

---

## Ce qui fonctionne ✅

- ✅ Bot Telegram : répond, gère réservations, affiche rapports
- ✅ Calculs financiers : vrais prix (client_price_per_day × nb_days), zéro catalogue
- ✅ Profit Kouider : calculé depuis Supabase, null si données manquantes
- ✅ Revenue Intelligence : revenus jour/semaine/mois avec overlap filter
- ✅ Anti-hallucination Gates 1/2/3 : bloquants (pas log-only)
- ✅ document_access_logs : table OK, logs écrits
- ✅ Nonce anti-replay : Redis NX EX 600
- ✅ SSE terminal Nexus : streaming live par ligne (asyncio)
- ✅ create_booking : stocke client_price_per_day + owner_price_per_day (B001 fixé)
- ✅ Création vidéo marketing : TIKTOK_AGENT → create_marketing_video → FFmpeg 720×1280 (zoompan retiré, photo buffer fallback garanti)
- ✅ 12 agents spécialisés : routing automatique opérationnel
- ✅ Scan caméra live, OCR passeport, Voucher PDF, Google Calendar
- ✅ Tests : 9/9 financiers, 11/11 anti-hallucination, 5/5 doc access logs
- ✅ TypeScript : 0 erreurs | Railway déployé | Netlify déployé

---

## Ce qui ne fonctionne pas / incomplet ❌

### B003 🔴 PRIORITÉ 1 — `checkAnomalies()` filtre dates incorrect
- **Fichier** : `backend/src/integrations/phase5-finance.ts` ~ligne 440
- **Fix** : `.lte('start_date', monthEnd).gte('end_date', monthStart)`

### B002 🔴 PRIORITÉ 2 — Cache Redis 30 min trop long
- **Fichier** : `backend/src/bi/revenue-intelligence.ts` ligne ~37
- **Fix** : Endpoint `POST /api/bi/cache/clear` ou réduire TTL à 300s

### ~~B005~~ ✅ FIXÉ — FFmpeg livraison Telegram silencieuse
- Résolution 720×1280, zoompan retiré, sendPhotoBuffer buffer-based, ❌ sur échec

---

## Prochaine priorité (à faire maintenant si tu reprends)

**FIX B003** : `checkAnomalies()` dans `phase5-finance.ts` ~ligne 440 — changer le filtre dates pour overlap.
**Puis Phase 6 Mobile** : formulaire création réservation avec saisie client_price + owner_price.
Fix : `.lte('start_date', monthEnd).gte('end_date', monthStart)`

**FIX B003** : Cache Redis 30 min trop long — ajouter endpoint cache clear ou réduire TTL.

---

## Dernière session (2026-05-14)

**Travail effectué :**
- Créé documentation Obsidian complète (dossier `DZARYX/`, 10 fichiers)
- Créé `CLAUDE.md` (lu automatiquement par Claude Code)
- Backfill `owner_price_per_day` dans Supabase pour 6 réservations existantes
- Réécriture système financier complet (9 tests passent)
- Sprint sécurité : Gates 2&3, nonce Redis, document_access_logs

**Commit dernier** : `956117d` fix(B005): video creation actually delivers to Telegram

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
