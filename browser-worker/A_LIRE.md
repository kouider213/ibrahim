# Navigateur sur le serveur — ACTIVÉ le 2026-10-14 (demande explicite de Kouider)

Service VPS : pm2 « dzaryx-browser ». Garde-fous : pause avant toute action irréversible, jamais de mot de
passe ni de carte, une tâche à la fois, tâche bloquée > 20 min → erreur, question sans réponse 24 h → annulée.
Backend : integrations/browser-relay.ts, api/routes/browser.ts, outils browser_task / browser_reply / browser_status.
