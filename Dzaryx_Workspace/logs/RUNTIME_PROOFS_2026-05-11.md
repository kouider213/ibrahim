# Runtime Proofs — 2026-05-11

All values are real — from live API calls this session.

---

## Health Check

```
GET https://ibrahim-backend-production.up.railway.app/health

{
  "status": "ok",
  "service": "Dzaryx",
  "version": "2.0-chatWithTools",
  "time": "2026-05-11T06:55:51.079Z",
  "apis": {
    "anthropic":  "🟢",
    "elevenlabs": "🟢",
    "telegram":   "🟢",
    "supabase":   "🟢",
    "pexels":     "🟢",
    "cloudinary": "🟢",
    "fal.ai":     "🟢",
    "replicate":  "🟢"
  }
}
```

---

## Orchestrator Health (p15 confirmed)

```
GET /api/orchestrator/health

{
  "status": "ok",
  "module": "orchestrator-engine",
  "version": "p15",
  "features": ["action-engine", "focus-manager", "priority-engine", "context-engine"]
}
```

---

## Redis action:history — Raw Response

```
GET /api/orchestrator/actions/telegram_809747124?limit=4

{
  "empty": false,
  "sessionId": "telegram_809747124",
  "total": 4,
  "returned": 4,
  "redis_key": "action:history:telegram_809747124",
  "records": [
    {
      "toolName": "execute_code_task",
      "timestamp": 1778483041214,
      "success": true,
      "sessionId": "telegram_809747124",
      "channel": "telegram",
      "args": {
        "task": "Corriger 2 problèmes dans le système mémoire:\n\n## 1. Dédup memory_facts (backend)\n\n**Fichier cible**: trouver le fichier…",
        "repo": "ibrahim"
      },
      "result": "✅ Code Agent lancé pour: \"Corriger 2 problèmes dans le système mémoire:\n\n## 1. Dédup memory_facts (backend)\"\n⏳ Je te tiens informé sur Telegram au fur et à mesure (5-15 min selon la complexité).",
      "latencyMs": 2
    },
    {
      "toolName": "remember_info",
      "timestamp": 1778482725303,
      "success": true,
      "channel": "telegram",
      "args": {"content": "[binary]", "category": "preference"},
      "result": "✅ Mémorisé [preference]: est une preference test.",
      "latencyMs": 105
    },
    {
      "toolName": "remember_info",
      "timestamp": 1778482563444,
      "success": true,
      "channel": "telegram",
      "args": {"content": "[binary]", "category": "preference"},
      "result": "✅ Mémorisé [preference]: Kouider préfère les paiements en espèces pour les réservations.",
      "latencyMs": 130
    },
    {
      "toolName": "remember_info",
      "timestamp": 1778482561103,
      "success": true,
      "channel": "telegram",
      "args": {"content": "[binary]", "category": "preference"},
      "result": "✅ Mémorisé [preference]: Kouider préfère recevoir les paiements des réservations en espèces.",
      "latencyMs": 135
    }
  ]
}
```

Note: content=[binary] in old records (written before fix 2150911). execute_code_task.task shows correct truncation post-fix.

---

## Supabase memory_facts — Raw (last 5 rows)

```json
[
  {"id":"9255cec5","user_id":"kouider","domain":"preference","key":"Kouider préfère les paiements en espèces pour les réservations.","value":"Kouider préfère les paiements en espèces pour les réservations.","confidence":0.9,"source":"remember_info","is_current":true,"created_at":"2026-05-11T06:56:03"},
  {"id":"898e194e","user_id":"kouider","domain":"preference","key":"Kouider préfère recevoir les paiements des réservations en espèces.","value":"Kouider préfère recevoir les paiements des réservations en espèces.","confidence":0.9,"source":"remember_info","is_current":true,"created_at":"2026-05-11T06:56:01"},
  {"id":"28834b19","user_id":"kouider","domain":"identity","key":"location","value":"Bruxelles (résidence principale) / Oran (famille + business)","confidence":1.0,"source":"explicit","verified":true,"is_current":true,"created_at":"2026-05-10T12:26:36"},
  {"id":"88af3114","user_id":"kouider","domain":"business","key":"business_type","value":"Location de voitures — Oran, Algérie","confidence":1.0,"source":"explicit","verified":true,"is_current":true,"created_at":"2026-05-10T12:26:36"},
  {"id":"2e0e6e36","user_id":"kouider","domain":"identity","key":"full_name","value":"Kouider","confidence":1.0,"source":"explicit","verified":true,"is_current":true,"created_at":"2026-05-10T12:26:36"}
]
```

---

## Supabase ibrahim_memory — Raw (last 5 rows)

```json
[
  {"id":"e38534ec","content":"Kouider préfère les paiements en espèces pour les réservations.","category":"preference","created_at":"2026-05-11T06:56:03"},
  {"id":"186b37e6","content":"Kouider préfère recevoir les paiements des réservations en espèces.","category":"preference","created_at":"2026-05-11T06:56:01"},
  {"id":"7d115e3e","content":"Rappel le 31 mai 2026 à 18h : préparer tout pour l'anniversaire du fils...","category":"personal","created_at":"2026-05-10T13:25:31"},
  {"id":"ece7b00e","content":"autolux-location est déployé sur VERCEL — pas Netlify...","category":"rule","created_at":"2026-05-09T12:09:25"},
  {"id":"6de98f4b","content":"Mohamed Bendaoud (+33632669757) a annulé le Berlingo...","category":"business","created_at":"2026-05-08T10:05:51"}
]
```

---

## DB Unique Constraint Test

```
key = 879e59ce54f31b314297d3270b818752b7258f6dfdaf77905f295a015edd4cbf

INSERT 1: REJECTED — {"code":"23505","message":"duplicate key value violates unique constraint \"unique_fact\""}
INSERT 2: REJECTED — {"code":"23505","message":"duplicate key value violates unique constraint \"unique_fact\""}
Content-Range: 0-0/1  →  exactly 1 row with that hash
```

---

## isToolFailureResult — Live Verification

```
Tool: list_bookings
Result: "..." (booking list)
isToolFailureResult: false → success=true ✅

Tool: generate_reservation_voucher (invalid UUID "xxx-invalid")
Result: "Erreur génération reçu: invalid input syntax for type uuid: \"xxx-invalid\""
isToolFailureResult: true (starts with "Erreur") → success=false ✅
```

---

## SHA256 Dedup Unit Test

```
normalize("je prefere les paiements en especes pour les reservations.") 
  → "je prefere les paiements en especes pour les reservations"
  → SHA256 prefix: a997287a7983fa40...

normalize("Je prefere les paiements en especes pour les reservations!")
  → "je prefere les paiements en especes pour les reservations"  ← same
  → SHA256 prefix: a997287a7983fa40...  ← SAME HASH

normalize("Kouider prefere recevoir les paiements des reservations en especes.")
  → "kouider prefere recevoir les paiements des reservations en especes"
  → SHA256 prefix: 9036507bef462e79...  ← DIFFERENT (correct)
```
