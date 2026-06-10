---
tags: [handoff, demarrage, dev]
---
# ⚙️ H13 — Démarrage local
[[00 HANDOFF HUB|← Hub]]

```bash
# Backend
cd backend
npm install
npm run dev          # tsx watch, lit ../.env
npm run typecheck    # tsc --noEmit → 0 erreur AVANT tout commit

# Simulateur
cd simulator
npm install
npm run dev          # Vite

# Nexus (PC Kouider)
cd nexus
python nexus.py
```

## Règles de code (jamais déroger — cf [[../CLAUDE|CLAUDE.md]])
1. `cd backend && npx tsc --noEmit` → 0 erreur avant tout commit.
2. Profit = `(client_price_per_day − owner_price_per_day) × nb_days` (jamais catalogue) → [[H08 Finance & règles métier]].
3. `git add <fichiers spécifiques>` — jamais `git add -A`.
4. Prérequis : variables [[H12 Variables d'environnement]].

Suite : [[H14 État, trous & roadmap]]
