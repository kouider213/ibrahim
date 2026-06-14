---
tags: [faq, depannage, dev, utilisateur]
updated: 2026-06-14
---

# 🩺 FAQ & Dépannage

Retour : [[🏠 ACCUEIL]] · [[GUIDE/Guide Développeur]]

## 👤 Côté utilisateur

> [!question] Je ne vois pas mes derniers changements dans l'app
> Le service worker sert l'ancienne version. **Ferme l'app à fond (swipe) → rouvre.** Sur PWA : retire le raccourci, ré-ouvre dans Safari, re-ajoute à l'accueil.

> [!question] Un bouton "Supprimer" ne fait rien
> Tape une 1ʳᵉ fois → il devient **"Confirmer ?"** → re-tape. (`window.confirm` est bloqué en WebView, on utilise une confirmation en 2 taps.)

> [!question] J'envoie une newsletter "à tous" mais je ne reçois rien
> Normal si tu n'es **pas abonné**. Les emails partent aux abonnés. Vérifie l'onglet **Promotions** de Gmail (les newsletters y atterrissent). Pour te tester : bouton **Test**.

> [!question] L'app marche-t-elle sans réseau ?
> En **lecture** oui (dernières données + bannière "Hors ligne"). Créer/IA = besoin d'internet.

> [!question] Une réservation acceptée va-t-elle dans Google Agenda ?
> Oui — depuis l'app, le site ou Dzaryx. Automatique.

## 🛠️ Côté développeur

> [!bug] Le déploiement Vercel échoue sur "cron"
> Plan Hobby = **2 crons max**. Ne pas dépasser. La machine à avis est fusionnée dans `reminders`.

> [!bug] La newsletter depuis l'app renvoie 401
> `INTERNAL_API_TOKEN` doit être **identique** sur Railway ET Vercel, et le deploy Vercel doit avoir rechargé la variable (redeploy après l'avoir ajoutée).

> [!bug] Une feature que j'ai codée n'apparaît pas dans l'app
> Vérifie que tu as édité le **bon écran** : nav = `Phone.tsx` (`TABS` + `renderScreen`). Des écrans existent en double (ex : `ImmoScreen` mort vs `ImmoProScreen` live). Bump aussi `sw.js` (CACHE) + redeploy.

> [!bug] FCM natif ne pousse pas
> `FIREBASE_SERVICE_ACCOUNT_JSON` doit être sur Railway. Sinon Expo push marche quand même. Tester : `POST /api/push-token/test`.

> [!bug] JS inline cassé sur /sign (contrat)
> CSP helmet bloque l'inline → middleware CSP relâché sur `/sign`. Vérifier les headers AVANT la logique.

> [!bug] Erreur email Resend
> Vérifier `RESEND_API_KEY` + `RESEND_FROM` (domaine vérifié) sur Vercel.

## 🔧 Commandes utiles

```bash
# Backend
cd backend && npx tsc --noEmit          # doit être 0
git push origin main                    # → Railway
# App
cd simulator && npx tsc --noEmit -p tsconfig.json
npm run deploy                          # → gh-pages
# Site
cd rental-system && npm run build && git push   # → Vercel
```

> [!tip] Réflexe debug
> 1. tsc à 0 ? 2. bon écran (renderScreen) ? 3. SW/cache (fermer-rouvrir) ? 4. variables d'env présentes des 2 côtés ? 5. logs Railway/Vercel.
