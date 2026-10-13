# À faire quand tu rallumes le PC (Nexus)

Dans le dossier du projet (`ibrahim`) :

1. `git pull`
2. `cd nexus` puis `pip install -r requirements.txt`
3. `python -m playwright install chromium` (une seule fois — pour le pilote de navigateur)
4. Relancer Nexus (`start.bat` ou `python nexus.py`)
5. Au 1er démarrage, Nexus télécharge tout seul le petit modèle du réveil local (~41 Mo).

Optionnel :
- Mode hors ligne : dire « installe le mode hors ligne » (plusieurs minutes : Ollama + modèle + voix locale).
- Dzaryx dans Claude Code : `claude mcp add dzaryx -- python <chemin>\nexus\mcp_server.py`
- Mode boulot : régler `NEXUS_WORK_APPS` et `NEXUS_WORK_PLAYLIST` dans `nexus/.env`.

## Tests à faire ensemble (dans l'ordre)

1. La bulle en bas à droite apparaît ? Ctrl+Alt+N allume le micro ?
2. « Nexus, minuteur de 1 minute » → bip + il parle + message.
3. « Nexus, monte le son » / « luminosité 50 ».
4. « Nexus, va sur le site de Wikipédia et trouve la population d'Oran ».
5. « Nexus » seul (réveil local) puis une commande.
6. Claude Code : « liste mes réservations » via l'outil dzaryx.
