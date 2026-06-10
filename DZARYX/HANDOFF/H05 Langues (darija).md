---
tags: [handoff, langue, darija, voix, stt, tts]
---
# 🗣️ H05 — Langues (darija) — le plus sensible
[[00 HANDOFF HUB|← Hub]]

## Miroir de langue
Dzaryx répond **dans la langue de l'interlocuteur** :

| Entrée | Réponse |
|---|---|
| Français | Français 100% (zéro darija parasite) |
| Darija / arabe | **Darija ORANAISE**, maximum d'arabe, garde seulement les mots français qu'un Oranais dit vraiment (cliene, réservation, acompte). ⛔ jamais marocain (ghadi/daba/zwin/dyal), jamais "dima". |
| Espagnol / Anglais | Idem en miroir |

Logique : `context-builder.ts` (hints par acteur). Même les **données/news** sont reformulées en darija.

## Détection
`language-detector.ts` — reconnaît la **darija latine / arabizi** : "gouli kach jdid", "3andek", "ch7al" (~200 tokens + chiffres-lettres 3=ع, 7=ح, 9=ق).

## Voix
- **STT** : OpenAI `gpt-4o-transcribe` (meilleur dialectes) → Groq Whisper → Google. Fichier `api/routes/transcribe.ts`.
- **TTS** : ElevenLabs (`dispatcher.ts`). **Auto-switch voix** : darija/arabe → voix **clonée algérienne** (`ELEVENLABS_VOICE_ID_AR`) ; français → voix de base. Arabizi converti en sons avant lecture (3andek→aandek).

> ⚠️ Limite : la darija **parlée** reste dure à transcrire à 100% (aucune IA n'y arrive parfaitement). Diction claire + sans bruit = mieux.

Réf : [[oranais-darija-style|note mémoire : garder les loanwords français]]. Suite : [[H06 Outils]]
