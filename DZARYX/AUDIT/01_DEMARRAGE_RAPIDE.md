# 01 — Démarrage Rapide (Onboarding)

> Tu n'as jamais vu ce projet. Lis ça, tu comprends tout en 10 minutes.
> Retour : [[🏠 HUB]]

---

## C'est quoi ce projet ?

**Fik Conciergerie Oran** = entreprise de **conciergerie premium à Oran (Algérie)** :
- 🚗 **Location de voitures** (cœur du business)
- 🏠 **Immobilier** (location + vente — activité de Houari, Douba Groupe)
- 🚙 **Vente de voitures**

Deux logiciels servent cette entreprise :

1. **Le SITE** (`rental-system` → fikconciergerie.com) = la **vitrine publique**. Les clients
   voient les voitures/biens, font des demandes de réservation. Il y a un **/admin** où Kouider
   gère tout par clics.

2. **DZARYX** (`ibrahim`) = l'**assistant IA personnel** de Kouider (façon Jarvis). Il gère le
   business : réservations, finances, clients, marketing TikTok, documents, et même le PC de Kouider.
   Accessible par app mobile, Telegram, voix.

Les deux partagent **la même base de données Supabase**.

---

## Qui est qui ?

| Personne | Rôle |
|----------|------|
| **Kouider** | Patron Fik Conciergerie. Loue les voitures. Email kouiderpablo@gmail.com. Celui qui code/dirige. |
| **Houari** | Associé. Grand patron Douba Groupe (immobilier + location). Gère l'immo, fournit des voitures. Parle darija oranaise. |
| **Dzaryx** | L'assistant IA (le logiciel). Répond à Kouider et Houari. |
| **Clients** | Touristes / locaux qui louent une voiture, souvent à l'aéroport d'Oran. |

> 💡 Notion clé business : **base_price** = prix Houari (proprio), **resale_price** = prix Kouider (client).
> Bénéfice = (resale − base) × nb_jours. Voir [[07_DATA_MODEL]].

---

## Stack en une image

| Morceau | Techno | Hébergement |
|---------|--------|-------------|
| Site | Next.js 14 + Tailwind + Framer Motion | Vercel |
| Backend Dzaryx | Node.js + TypeScript + Express + Socket.IO | Railway |
| App native | Expo SDK 54 / React Native | APK (en cours) |
| Simulateur | React + Vite + Tailwind | GitHub Pages |
| PWA mobile | React 18 + Vite | Netlify |
| Nexus (agent PC) | Python + Socket.IO | PC Kouider |
| Base de données | Supabase (PostgreSQL) | Supabase cloud |
| IA | Claude Sonnet 4.6 (principal), Haiku, + Gemini/Groq/OpenAI fallback | API |
| Voix | ElevenLabs | API |
| Queue | BullMQ + Redis (Upstash) | Upstash |

---

## Lancer chaque morceau (dev)

### Backend Dzaryx
```powershell
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend
npm install
npm run dev          # démarre Express + Socket.IO sur :3000
```
- Build : `npm run build`
- **Règle d'or AVANT tout commit** : `node_modules\.bin\tsc --noEmit` → 0 erreur
- Push sur `main` → **Railway redéploie tout seul**

### Site
```powershell
cd C:\Users\douba\OneDrive\Bureau\rental-system
npm install
npm run dev          # Next.js sur :3000
npm run build        # vérifie que ça build avant push
```
- Push sur `main` → **Vercel redéploie tout seul**

### App native
```powershell
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\dzaryx-native
npm install
npx expo start
```
> ⚠️ Expo SDK 54 — lire https://docs.expo.dev/versions/v54.0.0/ avant de coder.

### Simulateur
```powershell
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\simulator
npm install
npm run dev
npm run build        # déploie ensuite sur branche gh-pages
```

### Nexus (PC)
```powershell
cd C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus
python nexus.py       # ou launcher.py
```

---

## Les 5 fichiers à connaître par cœur

| Fichier | Pourquoi |
|---------|----------|
| `ibrahim/backend/src/index.ts` | Point d'entrée backend : toutes les routes + Socket.IO |
| `ibrahim/backend/src/integrations/tool-executor.ts` | Tous les outils Claude → Supabase (le plus gros fichier, ~5000 lignes) |
| `ibrahim/backend/src/agents/agent-registry.ts` | Les 14 agents IA (réservation, finance, marketing...) |
| `rental-system/pages/reservation.js` | Le formulaire de demande de réservation du site |
| `rental-system/lib/settings.js` | Réglages du site (WhatsApp, mode dispo, hero...) |

---

## Règles de code (jamais déroger)

```
1. cd backend && tsc --noEmit → 0 erreur AVANT commit
2. Profit = (resale_price - base_price) × nb_days — JAMAIS de valeur inventée
3. Si base_price NULL → profit = null (jamais deviné)
4. git add <fichiers précis> — JAMAIS git add -A ni git add .
5. tool-executor : un outil retourne TOUJOURS une string, jamais un objet
6. Déployer après chaque étape (Kouider veut de l'autonomie)
```

> Détail des décisions et conventions : [[08_DECISIONS]]
