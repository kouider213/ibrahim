# Bloqué / refusé / idées pour plus tard

## Bloqué par le garde-fou de sécurité de Claude Code
- **Extension Chrome** (Nexus qui agit dans TON Chrome connecté à tous tes comptes) : non créée.
- **Navigateur sur le serveur** (marche PC éteint, reprise en main par message + capture Telegram) : code écrit et
  rangé dans `browser-worker/` (voir `A_LIRE.md`), **pas déployé**.
- **Outils de Dzaryx pour les autres IA en écriture** : seulement la lecture seule est en ligne.
→ Pour l'un d'eux : autoriser ce type d'action dans les réglages de Claude Code, puis le redemander en connaissant le risque.

## Refusé par Kouider
- Tableau des coûts de Dzaryx (idée 4 du 2e tour).
- Domotique / Home Assistant (pas d'installation).

## Écarté
- Standard téléphonique IA pour les clients : il faut une vraie ligne (pièce d'identité + abonnement).
- Coffre à mots de passe pour les sites : même risque que l'extension Chrome.

## À savoir
- Le canal **WhatsApp client** (réponse automatique) existe dans le code mais n'est pas branché en production
  (aucune conversation client) : il faut le numéro WhatsApp Business (Meta) pour l'activer.
- La mémoire automatique contient des souvenirs mal coupés (« Wach préfère des voitures dispo p ») :
  dis « montre tout ce que tu sais sur moi » puis « oublie le souvenir … ».
- Le `.env` racine du VPS pointe sur un backend local (`localhost:3000`) : les services du VPS (tgcall) visent Railway.
