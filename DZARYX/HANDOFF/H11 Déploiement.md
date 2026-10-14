---
tags: [handoff, deploy]
---
# 🚀 H11 — Déploiement
[[00 HANDOFF HUB|← Hub]]

## Backend (Railway — auto au push)
```bash
git add <fichiers backend/>
git commit -m "type: description"
git push origin main      # Railway redéploie (~2 min)
```

## Simulateur (GitHub Pages — manuel)
```bash
# 1. bumper le cache Service Worker : simulator/public/sw.js → const CACHE = 'dzaryx-vNN'
cd simulator
# ⚠️ Depuis le 14/10/2026 : JAMAIS de VITE_ACCESS_TOKEN dans le build (la page est publique).
# L'app se connecte par mot de passe (/api/auth/login) et reçoit un jeton propre à l'appareil.
VITE_BACKEND_URL=https://ibrahim-backend-production.up.railway.app \
  VITE_WS_URL=wss://ibrahim-backend-production.up.railway.app npm run build
# vérifier : grep -rl "$MOBILE_ACCESS_TOKEN" dist  → doit ne rien trouver
npx gh-pages -d dist
git add ... && git commit && git push
```
> ⚠️ TOUJOURS bumper `dzaryx-vNN` dans `sw.js`, sinon le téléphone sert l'ancienne build (cache PWA).

## Mobile (Netlify) / Site (Vercel)
Build + push → déploiement auto sur changements `mobile/` resp. `rental-system/`.

## Migrations DB
Exécuter le `.sql` dans Supabase → SQL Editor → "Run and enable RLS". → [[H10 Base de données]]

## Nexus (PC Kouider)
Modifier `nexus/` → redémarrer `python nexus.py` sur le PC.

Prérequis env : [[H12 Variables d'environnement]]. Suite : [[H12 Variables d'environnement]]
