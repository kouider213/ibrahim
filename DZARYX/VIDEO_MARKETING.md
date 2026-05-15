# DZARYX — Système Vidéo Marketing

> Créé : 2026-05-14
> Agent responsable : TIKTOK_AGENT (priority 7, Claude Sonnet 4.6)
> Fichier principal : `backend/src/marketing/create-marketing-video.ts`

---

## Comment déclencher

Kouider écrit sur Telegram ou Mobile :
- "Fais une vidéo pour la Clio 5"
- "Crée une vidéo TikTok pour la Sandero style lifestyle"
- "Génère une vidéo prix pour la Duster"
- "Fais un reel pour le Jogger avec fond plage"

→ TIKTOK_AGENT (priority 7) intercepte → appelle `create_marketing_video`

---

## Pipeline Complet

```
1. Message "Fais une vidéo pour [voiture]"
2. TIKTOK_AGENT sélectionné (agent-registry.ts)
3. create_marketing_video (tool-executor.ts → createMarketingVideoTool)
4. Lookup voiture dans Supabase (table cars)
5. Script IA généré par Claude (intro + points forts + prix)
6. Voix ElevenLabs française (voice ID: pNInz6obpgDQGcFmaJgB)
7. Fond vidéo Pexels selon style
8. FFmpeg assemblage HD 1080×1920 (TikTok 9:16)
9. Upload Supabase Storage
10. sendVideoBuffer() → Telegram
11. Workflow approbation : "Oke" ou "Non"
```

---

## Styles Disponibles

| Style | Description |
|-------|-------------|
| `reveal` | Révélation progressive de la voiture |
| `prix` | Focus sur le tarif/promotion |
| `lifestyle` | Ambiance, émotion, aspiration |
| `témoignage` | Style avis client |

## Fonds Pexels Disponibles

plage · ville · montagne · desert · route · luxe · foret · coucher · nuit

---

## Workflow Approbation

- Kouider répond **"Oke"** → vidéo approuvée
- Kouider répond **"Non"** → relance la génération

Géré par : `approval-store.ts` + `video-session-store.ts`

---

## Fichiers

| Fichier | Rôle |
|---------|------|
| `backend/src/marketing/create-marketing-video.ts` | Pipeline FFmpeg principal |
| `backend/src/marketing/approval-store.ts` | Stockage approbation |
| `backend/src/marketing/video-session-store.ts` | Sessions vidéo |
| `backend/src/integrations/tool-executor.ts` | Outil `createMarketingVideoTool` |
| `backend/src/agents/agent-registry.ts` | TIKTOK_AGENT + VIDEO_CREATOR_AGENT |
| `backend/src/api/routes/telegram.ts` | `sendVideoBuffer()` + `sendPhotoBuffer()` |

---

## Chaîne de Fallback

```
1. Runway / Fal.ai (si clés API configurées)
2. FFmpeg local (pipeline compose: assets + voix + fond)
3. Photo buffer (sendPhotoBuffer — toujours accessible)
```

---

## Variables d'Env Requises

```env
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
PEXELS_API_KEY=
CLOUDINARY_CLOUD_NAME= / CLOUDINARY_API_KEY= / CLOUDINARY_API_SECRET=
SUPABASE_URL= / SUPABASE_SERVICE_KEY=
# Optionnel :
RUNWAY_API_KEY=
FAL_API_KEY=
```

---

## Bugs Connus

### B005 — FFmpeg sur Railway non confirmé
- **Statut** : 🔴 OUVERT
- **Problème** : FFmpeg-static tourne mais résultat vidéo complet non confirmé en prod
- **Filet** : `sendPhotoBuffer()` en place — Kouider reçoit au minimum une photo
- **Fix** : Vérifier Railway logs → chercher erreurs FFmpeg après une demande vidéo
