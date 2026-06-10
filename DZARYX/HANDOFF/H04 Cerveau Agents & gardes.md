---
tags: [handoff, ia, agents, guards, memory]
---
# 🧠 H04 — Cerveau : agents & gardes
[[00 HANDOFF HUB|← Hub]]

Claude est le cerveau. Un **routeur** (`core-router.ts` + `agent-registry.ts`) choisit un **agent spécialisé** (sous-ensemble d'[[H06 Outils|outils]] + prompt dédié) selon les mots-clés.

## Agents
📋 Réservations · 💰 Finance · 👤 Clients · 📅 Planning · 🎨 Marketing · 🎬 TikTok · 🧠 Mémoire · 💻 Code · 🎨 Designer · 🔍 Code Reviewer · 🌐 Analyse Réseau · 🎬 Vidéo · 🧠 Obsidian · 🧠 Général (catch-all)

## Gardes anti-hallucination (CRITIQUE)
- **Phantom Guard** — bloque une affirmation d'action sans outil write réel.
- **Anti-hallucination** — bloque chiffres finance / dispo voiture / nb résas affirmés sans outil de données.
- **Auto-retry "vrai cerveau"** — si une garde bloque, relance Claude en l'**obligeant à appeler l'outil**, puis répond avec les vraies données.
- Bypass si le contexte a déjà injecté les vraies données (flotte/résas/finance).

Fichier : `backend/src/orchestrator/anti-hallucination.ts`.

## Mémoire (réelle, persistante, par-utilisateur)
Table `memory_facts` (dedup SHA256, par `user_id` kouider/houari). Auto-extraction depuis les messages + outils `remember_info`/`recall_memory`. Le [[H03 Architecture & flux|context-builder]] ré-injecte les souvenirs pertinents à chaque tour.

## Nexus (contrôle PC)
Agent Python sur le PC de Kouider, namespace Socket.IO `/nexus` : terminal, screenshot, fichiers, etc.

Suite : [[H05 Langues (darija)]]
