---
tags: [decisions, dev, metier]
updated: 2026-06-14
---

# 🧠 Décisions — Pourquoi ce choix et pas un autre

Retour : [[🏠 ACCUEIL]]

> [!abstract] But
> Centraliser le *pourquoi*. Pour qu'un dev/repreneur ne refasse pas un choix déjà tranché.

## Architecture

> [!question] Pourquoi séparer site (Vercel) et backend (Railway) ?
> Le site doit être **serverless €0** (public, SEO, scalable). Le cerveau IA doit être **persistant** (sockets, vocal, jobs proactifs). Deux besoins opposés → deux hébergements.

> [!question] Pourquoi une base Supabase partagée plutôt que 2 bases + synchro ?
> La synchro = source de bugs. Une seule base = vérité unique, zéro copie, temps réel gratuit. Le site écrit, l'app lit/écrit. Voir [[🧩 ECOSYSTEME]].

> [!question] Pourquoi l'app = simulateur React en WebView, pas du natif pur ?
> Itérer le natif (rebuild APK) est lent. Le simulateur web se déploie en secondes (gh-pages) et la coquille Expo apporte juste vocal/push/overlay. On code une fois, ça marche partout.

## €0 / résilience

> [!question] Pourquoi la cascade LLM (Claude→Groq→Gemini→OpenAI) ?
> Pour ne **jamais tomber** quand les crédits Claude finissent. Groq/Gemini gratuits gardent les **mêmes 151 outils**. Prouvé en réel.

> [!question] Pourquoi pas de paiement en ligne (Chargily/Stripe) ?
> Décision Kouider : virement + acompte suffisent ; le paiement en ligne ajoute des frais et de la complexité. Exclu volontairement.

> [!question] Pourquoi WhatsApp "assistant rédactionnel" et pas un vrai bot auto ?
> Un bot qui répond seul = **API WhatsApp Business payante**. L'assistant (Dzaryx rédige, tu envoies) = gratuit + garde le contrôle + réactivité. Meilleur rapport valeur/coût.

## Produit / UX

> [!question] Pourquoi pas de compte client sur le site ?
> Friction zéro pour la diaspora. Suivi par numéro de commande. Décision validée.

> [!question] Pourquoi tout en FR/AR/EN + darija ?
> Clientèle diaspora. "Client arabe → réponse arabe". C'est un différenciateur, pas une option.

> [!question] Pourquoi un menu "⋯ Plus" et pas tous les onglets en bas ?
> ~26 fonctions = barre illisible. Essentiels en bas, outils dans une grille.

> [!question] Pourquoi le fond noir (pas plus clair) ?
> Le noir profond = perception premium (Linear/Apple). Le problème de lisibilité du chat venait des bulles transparentes, pas du fond → réglé par des bulles distinctes.

## Pièges transformés en règles

> [!warning]
> - `window.confirm/prompt` bloqués en WebView → **confirmation inline 2-taps**.
> - Vercel Hobby = **2 crons max** → machine à avis fusionnée dans `reminders`.
> - Photos d'annonce : la table est protégée (RLS) → écritures par clé service / proxy.
> - Suivi public en **refresh** (pas realtime) pour ne pas exposer la lecture des tables protégées.

## Suivi unifié

> [!question] Pourquoi UNE table `dossiers` (3 kinds) au lieu de 3 systèmes ?
> Achat véhicule / immo / pack partagent le même cycle (étapes, statut, photos, email). Un système paramétré = moins de code, même résultat.
