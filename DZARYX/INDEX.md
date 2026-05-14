# DZARYX — Documentation Centrale

> Anciennement **Ibrahim**. Renommé Dzaryx.
> Propriétaire : Kouider — Fik Conciergerie Oran
> Dernière mise à jour : 2026-05-14

---

## Navigation rapide

| Fichier | Contenu |
|---|---|
| [[PROJET]] | Description complète du projet |
| [[ARCHITECTURE]] | Stack technique, fichiers clés, flux AI |
| [[ROADMAP]] | Feuille de route avec statuts |
| [[BUGS]] | Tracker bugs (ouverts / fixés / en attente) |
| [[CHANGELOG]] | Historique de toutes les modifications |
| [[HANDOFF]] | Instructions pour tout agent AI qui reprend le projet |
| [[ENV]] | Variables d'environnement requises |
| [[DATABASE]] | Schéma Supabase — tables et colonnes |
| [[REGLES_METIER]] | Règles métier Fik Conciergerie |

---

## Statut actuel (2026-05-14)

- **Backend** : déployé sur Railway, branch `main` → auto-deploy
- **Mobile** : React PWA, déployé
- **Nexus PC** : Python agent, tourne sur PC Kouider
- **Phase active** : Phase 5 (Finance) — en cours de stabilisation

## Commandes essentielles

```bash
# Vérifier TypeScript (obligatoire avant commit)
cd backend && npx tsc --noEmit

# Lancer tests financiers
cd backend && npx tsx --env-file ../.env src/tests/financial-calculations.test.ts

# Lancer tests anti-hallucination
cd backend && npx tsx --env-file ../.env src/tests/anti-hallucination.test.ts

# Vérifier document_access_logs
cd backend && npx tsx --env-file ../.env src/tests/verify-doc-access-logs.ts
```

## Règle absolue pour tout agent AI

1. Lire [[HANDOFF]] en premier
2. Lire [[BUGS]] pour connaître l'état actuel
3. `npx tsc --noEmit` → 0 erreurs obligatoire avant commit
4. Après chaque modification : mettre à jour [[BUGS]] et [[CHANGELOG]]
