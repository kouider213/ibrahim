#!/usr/bin/env bash
# Transfert Dzaryx + secrets vers le VPS Hostinger (45.9.190.54).
# Le token GitHub et le .env sont lus au runtime — AUCUN secret n'est ecrit dans ce fichier.
# A lancer depuis Claude Code avec:  ! bash "/c/Users/douba/OneDrive/Bureau/ibrahim/ibrahim/vps_transfer.sh"
set -euo pipefail

REPO_DIR="/c/Users/douba/OneDrive/Bureau/ibrahim/ibrahim"
VPS="root@45.9.190.54"
KEY="$HOME/.ssh/dzaryx_vps"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=no)

cd "$REPO_DIR"

if [ ! -f .env ]; then echo "ERREUR: .env introuvable dans $REPO_DIR"; exit 1; fi
TOKEN=$(grep '^GITHUB_TOKEN=' .env | cut -d= -f2- | tr -d '"'\''\r')
if [ -z "$TOKEN" ]; then echo "ERREUR: GITHUB_TOKEN vide dans .env"; exit 1; fi

echo "==> 1/4 Clone du repo prive sur le VPS"
ssh "${SSH_OPTS[@]}" "$VPS" "
  set -e
  rm -rf /root/dzaryx
  git clone --quiet https://x-access-token:${TOKEN}@github.com/kouider213/ibrahim.git /root/dzaryx
  cd /root/dzaryx
  git remote set-url origin https://github.com/kouider213/ibrahim.git
  git config --global credential.helper store
  printf 'https://x-access-token:%s@github.com\n' '${TOKEN}' > ~/.git-credentials
  chmod 600 ~/.git-credentials
  echo '   branche:' \$(git branch --show-current) '| head:' \$(git log --oneline -1)
"

echo "==> 2/4 Copie du .env (secrets) vers le VPS"
scp "${SSH_OPTS[@]}" -q .env "$VPS:/root/dzaryx/.env"
# copie aussi le .env du backend s'il en attend un a part
ssh "${SSH_OPTS[@]}" "$VPS" "cp /root/dzaryx/.env /root/dzaryx/backend/.env 2>/dev/null || true; chmod 600 /root/dzaryx/.env /root/dzaryx/backend/.env 2>/dev/null || true"

echo "==> 3/4 Install dependances backend"
ssh "${SSH_OPTS[@]}" "$VPS" "cd /root/dzaryx/backend && npm install --no-audit --no-fund >/tmp/npm.log 2>&1 && echo '   backend deps OK' || (echo '   backend npm a echoue, voir /tmp/npm.log'; tail -5 /tmp/npm.log)"

echo "==> 4/4 Verification"
ssh "${SSH_OPTS[@]}" "$VPS" "
  echo '   .env lignes:' \$(wc -l < /root/dzaryx/.env)
  echo '   node:' \$(node -v) '| claude:' \$(claude --version 2>/dev/null)
  echo '   repo:' \$(ls /root/dzaryx | tr '\n' ' ')
"
echo "==> TERMINE. VPS pret: ssh root@45.9.190.54  puis  cd /root/dzaryx && claude"
