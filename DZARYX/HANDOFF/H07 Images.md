---
tags: [handoff, image, vision]
---
# 🖼️ H07 — Images (génération / édition / dégât)
[[00 HANDOFF HUB|← Hub]]

- **Générer** une image neuve → `generate_image` (gpt-image-1 → DALL-E 3 → Flux).
- **Éditer SA photo / la voiture EXACTE** → `transform_image` (gpt-image-1 edit). Pour une voiture de la flotte : passer `car_name` → part de la **vraie photo Supabase** → garde la voiture exacte (couleur/finition).
- **Garde-fou serveur** (`orchestrator.ts`) : photo jointe + "modifie/enlève/mets sur une plage" → édition directe, Claude ne peut pas se tromper d'outil (avant : il prenait une photo stock).
- **Estimer un dégât** → `estimate_damage` (Claude vision : photo du choc → coût réparation en DZD).

Fichiers : `integrations/image-to-image.ts`, `tool-executor.ts` (`generateImageTool`).

> Sujet pixel-exact = détourage+composite (Cloudinary). Rendu intégré réaliste = gpt-image-1 (très fidèle, peut styliser légèrement).

Suite : [[H08 Finance & règles métier]]
