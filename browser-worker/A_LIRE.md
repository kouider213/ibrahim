# Navigateur sur le serveur — ACTIVÉ le 2026-10-14 (demande explicite de Kouider) — depuis le 14/10 soir : travaille dans le Chrome VISIBLE du PC cloud (BROWSER_CDP_URL, voir cloudpc/A_LIRE.md)

Service VPS : pm2 « dzaryx-browser ». Garde-fous : pause avant toute action irréversible, jamais de mot de
passe ni de carte, une tâche à la fois, tâche bloquée > 20 min → erreur, question sans réponse 24 h → annulée.
Backend : integrations/browser-relay.ts, api/routes/browser.ts, outils browser_task / browser_reply / browser_status.
