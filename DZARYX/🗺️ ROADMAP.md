---
tags: [roadmap, pilotage]
updated: 2026-06-14
---

# 🗺️ Roadmap

Retour : [[🏠 ACCUEIL]] · Journal détaillé : [[AUDIT/10_JOURNAL_SESSION]]

## Timeline

```mermaid
timeline
  title Évolution Dzaryx × Fik
  Socle : Backend + Supabase : Site v2 : Réservations
  Intelligence : Multi-agent : 151 outils : Mémoire client
  Conciergerie : Immo : Packs : Vente : Import A→Z
  Site pro : Multilingue FR/AR/EN : Emails pro : SEO/NAP : Newsletter
  App €0 : Résilience LLM : Push natif : Offline : Mode vocal
  Business 2026-06 : Devis : Assistant WhatsApp : Prévision : Parrainage : CRM : Social
  Design 2026-06 : Style premium uniforme : Orbe : Skeletons : Onboarding
```

## État actuel (2026-06-14)

```mermaid
flowchart LR
  subgraph Fait["✅ Fait"]
    a["Site complet"] --- b["App complète (151 outils)"] --- c["Design premium uniforme"] --- d["€0 + offline + push"]
  end
  subgraph Reste["🔭 Optionnel"]
    e["Décision accès Houari"] --- f["Play Store (distribution)"] --- g["Paiement en ligne (exclu)"]
  end
```

## ✅ Terminé
- [x] Site : location, vente, immo, packs, import A→Z, leads, suivis, contrats
- [x] Multilingue 100% FR/AR/EN + emails pro + SEO/NAP + cookies
- [x] App : 151 outils, vocal, vision, multi-acteur
- [x] Connexion site↔app (base partagée + proxy + Google Agenda partout)
- [x] Résilience €0 (LLM cascade) + offline + push natif
- [x] Devis (+PDF +historique), Assistant WhatsApp, Caisse, Avis, Newsletter, Blog
- [x] Prévision saison, Relance CRM, Social, Parrainage (+tracking auto), Prix conseillés, Recherche globale
- [x] Design premium uniforme + orbe + skeletons + onboarding
- [x] Sécurité : token GitHub révoqué, clés régénérées

## 🔭 Reste (optionnel)
- [ ] **Houari** : ouvrir certains onglets (Caisse/CA) ? — décision Kouider
- [ ] Distribution **Play Store** (build AAB + clé Google)
- [ ] (Exclu) Paiement en ligne Chargily — virement/acompte suffit

## 🛑 Actions de config en attente
- [ ] SQL déjà lancés : `0028` avis, `0029` parrainage, `0030` devis ✅
- [ ] Rien de bloquant côté sécurité (tout clean)
