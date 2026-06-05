# 02 — Architecture Globale

> Comment les morceaux se parlent. Retour : [[🏠 HUB]]

---

## Vue d'ensemble

Deux applications **indépendantes** (repos séparés, déploiements séparés) reliées par **une base Supabase commune** et **un webhook**.

```mermaid
flowchart LR
    subgraph V["Vercel"]
        SITE["Site Next.js<br/>fikconciergerie.com"]
    end
    subgraph R["Railway"]
        BACK["Backend Dzaryx<br/>Express + Socket.IO"]
    end
    subgraph S["Supabase"]
        DB[("PostgreSQL<br/>+ Realtime + Storage")]
    end
    subgraph U["Upstash"]
        REDIS[("Redis<br/>BullMQ queue")]
    end

    SITE -->|"@supabase/supabase-js<br/>(clé anon + RLS)"| DB
    SITE -->|"POST /api/fik-site/notify<br/>(webhook secret)"| BACK
    BACK -->|"service key<br/>(bypass RLS)"| DB
    BACK -->|"Realtime: écoute table notifications"| DB
    BACK <--> REDIS
    BACK -->|"Socket.IO push proactifs"| APPS["Apps Kouider/Houari"]
    DB -->|"Realtime INSERT notifications"| BACK
```

### Les deux chemins site → Dzaryx (important)

Quand un client réserve sur le site, Dzaryx est prévenu de **2 façons redondantes** :

1. **Webhook direct** : `rental-system/pages/api/notify-dzaryx.js` → POST vers
   `backend /api/fik-site/notify` (header `x-webhook-secret`). Non-bloquant : si Dzaryx est down,
   le site continue. Voir [[04_DZARYX_BACKEND#fik-site-webhook]].
2. **Supabase Realtime** : le site insère une ligne dans la table `notifications`, le backend
   écoute les `INSERT` en Realtime (`index.ts → initFikRealtimeListener`) et pousse vers Kouider + Houari.

> Pourquoi 2 chemins ? Robustesse : si le webhook échoue (timeout, secret manquant), le Realtime
> rattrape. Voir [[08_DECISIONS]].

---

## Flux : une réservation de A à Z

```mermaid
sequenceDiagram
    participant C as Client
    participant Site as Site (reservation.js)
    participant DB as Supabase
    participant Back as Backend Dzaryx
    participant K as Kouider (app/WhatsApp)

    C->>Site: choisit voiture + dates + remplit form (âge ≥35 vérifié)
    Site->>DB: INSERT bookings (status PENDING, UNPAID)
    Site->>Back: webhook notify-dzaryx (type new_booking)
    Site->>DB: INSERT notifications
    DB-->>Back: Realtime INSERT notifications
    Back->>K: push proactif "🚗 Nouvelle réservation"
    Site->>C: ouvre WhatsApp pré-rempli (dates, prix estimé)
    C->>K: message WhatsApp
    K->>K: vérifie dispo réelle avec Houari
    K->>DB: via app/Dzaryx → status ACCEPTED ou REJECTED
```

**Point clé** : une réservation site est **toujours `PENDING`** (jamais auto-confirmée). C'est
Kouider qui valide. Voir [[03_SITE#reservation]] et [[08_DECISIONS#mode-dispo]].

---

## Flux : Kouider parle à Dzaryx

```mermaid
sequenceDiagram
    participant K as Kouider
    participant App as App/Simulateur/Telegram
    participant Back as Backend
    participant Router as agent-router
    participant Agent as Agent (1 des 14)
    participant Tools as tool-executor
    participant DB as Supabase
    participant LLM as Claude/Gemini/Groq

    K->>App: "réserve la Clio pour Ahmed du 5 au 10, prix 45"
    App->>Back: POST /api/chat (Bearer MOBILE_TOKEN)
    Back->>Router: détecte intention + choisit agent
    Router->>Agent: Agent Réservations (priorité 10)
    Agent->>LLM: prompt + outils dispo
    LLM->>Tools: create_booking(...)
    Tools->>DB: INSERT + anti-doublon (RPC)
    Tools-->>Agent: "✅ réservation créée"
    Agent-->>K: réponse (texte/voix)
```

Détail du pipeline conversationnel (intent, contexte, anti-hallucination, mémoire) : [[04_DZARYX_BACKEND#pipeline-conversation]].

---

## Namespaces Socket.IO

Le backend expose plusieurs canaux temps réel :

| Namespace | Qui | Usage |
|-----------|-----|-------|
| `/mobile` | Apps Kouider/Houari | Chat live, push proactifs (chambres `actor:kouider`, `actor:houari`, `actor:all`) |
| `/desktop` | (PC) | Connexions desktop |
| `/nexus` | Nexus Python | Commandes PC (shell, screenshot, vision) |
| `/pc` | pc-agent (alt TypeScript) | Alternative à Nexus |

Auth Socket : token dans `handshake.auth.token`, validé par `validateToken(token, 'mobile'|'pc-agent')`.

---

## Sécurité — niveaux d'accès

| Accès | Mécanisme |
|-------|-----------|
| Site public (clients) | Supabase **clé anon** + **RLS** (lecture cars/reviews, insert bookings) |
| Backend → Supabase | **Service key** (bypass RLS, accès total) |
| App → Backend | **Bearer `MOBILE_ACCESS_TOKEN`** (Kouider) / `MOBILE_TOKEN_HOUARI` (Houari) |
| Nexus → Backend | **`PC_AGENT_TOKEN`** |
| Site → Backend webhook | header **`x-webhook-secret`** (= `WEBHOOK_SECRET`) |
| Rate limiting | en mémoire : 120 req/min général, 20 req/min sur `/api/chat` |

> ⚠️ CORS backend = `origin: '*'` + `credentials: true` (à resserrer un jour). Impact limité car
> auth par Bearer token. Voir [[08_DECISIONS]].

---

## Ce qui distingue les "apps" de Kouider

- **App native (dzaryx-native)** = la vraie app du téléphone (APK), celle qu'il utilisera au quotidien.
- **Simulateur** = même idée mais sur le web (GitHub Pages), 12+ écrans, pour tester/démo sans APK.
- **PWA mobile (mobile/)** = ancienne version web installable. Toujours en ligne sur Netlify.

Les trois tapent le **même backend**. Détails : [[05_APPS]].
