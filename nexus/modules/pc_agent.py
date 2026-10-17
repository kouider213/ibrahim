"""
NEXUS PC Agent — Claude AI local avec outils PC complets.
Remplace l'appel Dzaryx cloud pour tout ce qui touche le PC Windows.
"""
import asyncio
import base64
import logging
import os
import re
import shutil
import subprocess
import webbrowser
from pathlib import Path

import anthropic

from modules.loop_guard import LoopGuard

log = logging.getLogger('nexus.pc_agent')

from modules.pc_control import DESKTOP, find_folders

DOWNLOADS = Path.home() / 'Downloads'
DOCUMENTS = Path.home() / 'Documents'
IBRAHIM   = DESKTOP / 'ibrahim' / 'ibrahim'
DZARYX_ROOT = DESKTOP / 'Dzaryx'

_SHORTCUT: dict[str, Path] = {
    'bureau': DESKTOP, 'desktop': DESKTOP,
    'documents': DOCUMENTS, 'téléchargements': DOWNLOADS, 'downloads': DOWNLOADS,
    'ibrahim': IBRAHIM, 'projet': IBRAHIM,
}

def _resolve(text: str) -> Path:
    t = text.strip().lower()
    p = Path(text.strip())
    if p.is_absolute() and p.exists():
        return p
    for k, sp in _SHORTCUT.items():
        if t == k or t.startswith(k + ' ') or t.endswith(' ' + k):
            return sp
    if (DESKTOP / text.strip()).exists():
        return DESKTOP / text.strip()
    found = find_folders(text)
    return found[0] if found else DESKTOP / text.strip()

TOOLS = [
    {
        "name": "execute_shell",
        "description": "Exécute une commande PowerShell sur le PC Windows et retourne le résultat. Use pour ouvrir des apps, déplacer des fichiers, lister des dossiers, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Commande PowerShell à exécuter"},
                "cwd": {"type": "string", "description": "Dossier de travail (optionnel)"}
            },
            "required": ["command"]
        }
    },
    {
        "name": "install_app",
        "description": "Installe une application via winget (Windows Package Manager).",
        "input_schema": {
            "type": "object",
            "properties": {
                "app_name": {"type": "string", "description": "Nom de l'app (ex: 'spotify', 'vscode', 'cursor')"}
            },
            "required": ["app_name"]
        }
    },
    {
        "name": "open_claude_code",
        "description": "Ouvre Claude Code (CLI claude) dans un terminal Windows Terminal sur un dossier spécifique.",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Chemin du dossier à ouvrir (ex: 'ibrahim', 'C:/Users/...')"},
                "prompt": {"type": "string", "description": "Prompt initial à passer à Claude Code (optionnel)"}
            },
            "required": ["folder"]
        }
    },
    {
        "name": "open_terminal",
        "description": "Ouvre un terminal (Windows Terminal ou cmd) dans un dossier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Dossier où ouvrir le terminal"},
                "command": {"type": "string", "description": "Commande à lancer dans le terminal (optionnel)"}
            },
            "required": ["folder"]
        }
    },
    {
        "name": "create_folder",
        "description": "Crée un dossier (et tous les parents nécessaires).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin du dossier à créer"},
                "open_after": {"type": "boolean", "description": "Ouvrir l'explorateur après création"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "delete_item",
        "description": "Supprime un fichier ou dossier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin du fichier/dossier à supprimer"},
                "confirm": {"type": "boolean", "description": "Toujours true pour confirmer"}
            },
            "required": ["path", "confirm"]
        }
    },
    {
        "name": "move_file",
        "description": "Déplace ou renomme un fichier/dossier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {"type": "string", "description": "Chemin source"},
                "destination": {"type": "string", "description": "Chemin destination"}
            },
            "required": ["source", "destination"]
        }
    },
    {
        "name": "list_directory",
        "description": "Liste le contenu d'un dossier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin du dossier"},
                "max_items": {"type": "integer", "description": "Nombre max d'éléments (défaut: 20)"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "read_file",
        "description": "Lit le contenu d'un fichier texte.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin du fichier"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Crée ou écrit dans un fichier texte.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin du fichier"},
                "content": {"type": "string", "description": "Contenu à écrire"}
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "open_file_or_app",
        "description": "Ouvre un fichier, application ou URL avec le programme par défaut.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Chemin fichier, nom d'app, ou URL"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "find_folder",
        "description": "Cherche un dossier par son nom (approximatif) dans Bureau, Documents, Téléchargements, Images, Vidéos, OneDrive. "
                       "Renvoie les chemins trouvés. À utiliser AVANT d'ouvrir/lister un dossier dont tu ne connais pas le chemin exact.",
        "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}
    },
    {
        "name": "open_folder",
        "description": "Ouvre un dossier dans l'explorateur Windows (nom approximatif ou chemin complet). Vérifie qu'il existe.",
        "input_schema": {"type": "object", "properties": {"name_or_path": {"type": "string"}}, "required": ["name_or_path"]}
    },
    {
        "name": "clean_pc",
        "description": "Ménage complet et sûr du PC : fichiers temporaires (utilisateur + Windows), caches navigateurs et applis, caches "
                       "graphiques, rapports de plantage, Windows Update déjà installé. Renvoie ce qui a été libéré par catégorie. "
                       "include_recycle_bin=true vide aussi la corbeille (seulement si Kouider l'a demandé).",
        "input_schema": {"type": "object", "properties": {"include_recycle_bin": {"type": "boolean"}}}
    },
    {
        "name": "show_widget",
        "description": "Affiche un widget holographique sur l'écran Nexus (déplaçable). À utiliser dès que Kouider demande d'afficher, "
                       "montrer, lister ou comparer quelque chose, ou quand ta réponse contient une liste, un tableau, une image ou "
                       "plus de 3 lignes d'infos. kind: 'text' (content = texte), 'list' (items = [{title, subtitle}]), "
                       "'table' (columns = [...], rows = [[...]]), 'kv' (pairs = [[clé, valeur]]), 'image' (path = fichier image du PC "
                       "ou URL https). Tu peux en afficher plusieurs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "kind": {"type": "string", "enum": ["text", "list", "table", "kv", "image"]},
                "content": {"type": "string"},
                "items": {"type": "array", "items": {"type": "object"}},
                "columns": {"type": "array", "items": {"type": "string"}},
                "rows": {"type": "array", "items": {"type": "array"}},
                "pairs": {"type": "array", "items": {"type": "array"}},
                "path": {"type": "string"},
            },
            "required": ["title", "kind"]
        }
    },
    {
        "name": "organize_files",
        "description": "Crée un dossier organisé dans Dzaryx/ et y déplace/sauvegarde des fichiers. Utile pour organiser photos d'accidents, documents clients, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_name": {"type": "string", "description": "Nom du dossier (ex: 'Accident_Clio4_Mai2026', 'Client_Ahmed')"},
                "description": {"type": "string", "description": "Description du contenu"}
            },
            "required": ["folder_name"]
        }
    },
]


def _exec_shell(command: str, cwd: str | None = None, timeout: int = 30) -> str:
    try:
        result = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-Command', command],
            capture_output=True, text=True, timeout=timeout,
            cwd=cwd or str(DESKTOP), encoding='utf-8', errors='replace',
        )
        out = (result.stdout or '').strip()
        err = (result.stderr or '').strip()
        if result.returncode != 0 and err:
            return f'⚠️ {err[:500]}\n{out[:500]}'.strip()
        return out[:1500] or '✅ Commande exécutée'
    except subprocess.TimeoutExpired:
        return '⏱️ Timeout (>30s)'
    except Exception as e:
        return f'❌ Erreur: {e}'


def _run_tool(name: str, inp: dict) -> str:
    try:
        if name == 'execute_shell':
            return _exec_shell(inp['command'], inp.get('cwd'))

        elif name == 'install_app':
            app = inp['app_name'].strip()
            result = subprocess.run(
                ['winget', 'install', '--id', app, '-e', '--accept-package-agreements', '--accept-source-agreements'],
                capture_output=True, text=True, timeout=120, encoding='utf-8', errors='replace',
            )
            if result.returncode == 0:
                return f'✅ {app} installé'
            # Try search by name
            result2 = subprocess.run(
                ['winget', 'install', app, '--accept-package-agreements', '--accept-source-agreements'],
                capture_output=True, text=True, timeout=120, encoding='utf-8', errors='replace',
            )
            if result2.returncode == 0:
                return f'✅ {app} installé'
            return f'⚠️ winget: {(result.stderr or result.stdout or "")[:300]}'

        elif name == 'open_claude_code':
            folder_text = inp['folder']
            folder = _resolve(folder_text) if not Path(folder_text).exists() else Path(folder_text)
            prompt = inp.get('prompt', '')
            cmd_parts = ['claude', '--dangerously-skip-permissions']
            if prompt:
                cmd_parts += ['-p', prompt]
            cmd_str = ' '.join(f'"{p}"' if ' ' in p else p for p in cmd_parts)
            try:
                subprocess.Popen(['wt.exe', '-d', str(folder), 'cmd', '/k', cmd_str])
                return f'✅ Claude Code lancé dans {folder.name}'
            except FileNotFoundError:
                subprocess.Popen(['cmd.exe', '/k', cmd_str], cwd=str(folder))
                return f'✅ Claude Code lancé (cmd) dans {folder.name}'

        elif name == 'open_terminal':
            folder_text = inp['folder']
            folder = _resolve(folder_text) if not Path(folder_text).exists() else Path(folder_text)
            command = inp.get('command', '')
            if command:
                try:
                    subprocess.Popen(['wt.exe', '-d', str(folder), 'cmd', '/k', command])
                except FileNotFoundError:
                    subprocess.Popen(['cmd.exe', '/k', command], cwd=str(folder))
            else:
                try:
                    subprocess.Popen(['wt.exe', '-d', str(folder)])
                except FileNotFoundError:
                    subprocess.Popen(['cmd.exe'], cwd=str(folder))
            return f'✅ Terminal ouvert dans {folder.name}'

        elif name == 'create_folder':
            path_text = inp['path']
            if not Path(path_text).is_absolute():
                path = DZARYX_ROOT / path_text
            else:
                path = Path(path_text)
            path.mkdir(parents=True, exist_ok=True)
            if inp.get('open_after', True):
                subprocess.Popen(['explorer', str(path)])
            return f'✅ Dossier créé: {path}'

        elif name == 'delete_item':
            if not inp.get('confirm'):
                return '⛔ confirm=true requis'
            path = Path(inp['path'])
            if not path.exists():
                return f'❌ Introuvable: {path}'
            if path.is_dir():
                shutil.rmtree(path)
                return f'✅ Dossier supprimé: {path.name}'
            else:
                path.unlink()
                return f'✅ Fichier supprimé: {path.name}'

        elif name == 'move_file':
            src = Path(inp['source'])
            dst = Path(inp['destination'])
            if not src.exists():
                return f'❌ Source introuvable: {src}'
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            return f'✅ Déplacé: {src.name} → {dst}'

        elif name == 'list_directory':
            path = _resolve(inp['path'])
            if not path.is_dir():
                return f'❌ Dossier introuvable: {path}'
            max_i = inp.get('max_items', 20)
            entries = sorted(path.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
            lines = [f'📁 {path.name}/  ({len(entries)} éléments)']
            for e in entries[:max_i]:
                ico = '📁' if e.is_dir() else '📄'
                lines.append(f'  {ico} {e.name}')
            if len(entries) > max_i:
                lines.append(f'  … +{len(entries) - max_i} autres')
            return '\n'.join(lines)

        elif name == 'read_file':
            p = Path(inp['path'])
            if not p.exists():
                return f'❌ Fichier introuvable: {p}'
            try:
                return p.read_text(encoding='utf-8', errors='replace')[:3000]
            except Exception as e:
                return f'❌ Lecture impossible: {e}'

        elif name == 'write_file':
            p = Path(inp['path'])
            if not p.is_absolute():
                p = DESKTOP / inp['path']
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(inp['content'], encoding='utf-8')
            return f'✅ Fichier écrit: {p}'

        elif name == 'open_file_or_app':
            target = inp['path']
            try:
                os.startfile(target)
                return f'✅ Ouvert: {target}'
            except Exception:
                try:
                    webbrowser.open(target)
                    return f'✅ Ouvert dans le navigateur: {target}'
                except Exception as e:
                    return f'❌ Impossible d\'ouvrir: {e}'

        elif name == 'find_folder':
            found = find_folders(inp['name'], limit=8)
            return '\n'.join(str(p) for p in found) if found else f'Aucun dossier ressemblant à « {inp["name"]} »'

        elif name == 'open_folder':
            target = _resolve(inp['name_or_path'])
            if not target.is_dir():
                return f'❌ Dossier introuvable : {inp["name_or_path"]} (essaie find_folder ou list_directory)'
            os.startfile(str(target))
            return f'✅ Dossier ouvert : {target}'

        elif name == 'clean_pc':
            from modules import cleaner
            keys = None if not inp.get('include_recycle_bin') else [c[0] for c in cleaner.CATEGORIES] + ['recycle']
            done = cleaner.clean(keys)
            total = sum(d['mb'] for d in done)
            return f'✅ {total} Mo libérés\n' + '\n'.join(f"- {d['label']} : {d['mb']} Mo ({d['files']} fichiers)" for d in done) + \
                f"\nCorbeille restante : {round(cleaner.recycle_size() / 1e6)} Mo"

        elif name == 'organize_files':
            folder_name = re.sub(r'[<>:"|?*]', '_', inp['folder_name'].strip())
            target = DZARYX_ROOT / folder_name
            target.mkdir(parents=True, exist_ok=True)
            subprocess.Popen(['explorer', str(target)])
            return f'✅ Dossier organisé créé: {target}\nPrêt à recevoir des fichiers.'

        return f'❌ Outil inconnu: {name}'
    except Exception as e:
        log.error('Tool %s error: %s', name, e)
        return f'❌ Erreur {name}: {e}'


class PCAgent:
    """Claude AI local avec accès complet au PC Windows. Garde le fil de la conversation (historique Nexus)."""

    MODEL = os.environ.get('NEXUS_AGENT_MODEL', 'claude-sonnet-5-5')
    FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

    SYSTEM = (
        "Tu es NEXUS, l'assistant IA du PC Windows de Kouider (Fik Conciergerie, location de voitures à Oran). "
        "Tu as un accès complet au PC et tu EXÉCUTES vraiment les actions demandées avec tes outils. "
        "Règles : 1) Tu te souviens de la conversation : « et l'autre ? », « ouvre-le », « fais pareil » se rapportent "
        "aux messages précédents. 2) Pour un dossier dont tu n'as pas le chemin exact : find_folder, puis open_folder. "
        "3) Ne dis jamais « c'est fait » sans qu'un outil l'ait confirmé ; si une étape échoue, essaie une autre méthode "
        "(PowerShell) avant d'abandonner, puis dis clairement ce qui n'a pas marché. 4) Ménage du PC : clean_pc (complet), "
        "la corbeille seulement si Kouider le demande. 5) Dès que Kouider veut voir, afficher, lister, comparer ou que la réponse "
        "a une liste / un tableau / une image : show_widget sur l'écran Nexus, et ta réponse parlée reste courte. "
        "6) Réponds en français, court et naturel (ta réponse est lue à voix haute) : pas de markdown, pas d'émojis."
        f" Bureau : {DESKTOP}. Documents : {DOCUMENTS}. Téléchargements : {DOWNLOADS}."
    )

    def __init__(self, widget_cb=None) -> None:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None
        self.available = bool(api_key)
        self.widget_cb = widget_cb          # show_widget → interface Nexus (appelé depuis le fil de l'agent)

    @staticmethod
    def _history_messages(history: list[dict] | None) -> list[dict]:
        """Historique Nexus [{role: user|nexus, text}] → messages Claude alternés, en commençant par l'utilisateur."""
        msgs: list[dict] = []
        for h in (history or [])[-16:]:
            role = 'assistant' if h.get('role') == 'nexus' else 'user'
            text = str(h.get('text') or '').strip()[:1500]
            if not text:
                continue
            if msgs and msgs[-1]['role'] == role:
                msgs[-1]['content'] += '\n' + text
            else:
                msgs.append({'role': role, 'content': text})
        while msgs and msgs[0]['role'] != 'user':
            msgs.pop(0)
        if msgs and msgs[-1]['role'] == 'user':          # le message courant est ajouté juste après
            msgs[-1]['content'] = '(message précédent) ' + msgs[-1]['content']
            msgs.append({'role': 'assistant', 'content': "D'accord."})
        return msgs

    async def run(self, instruction: str, history: list[dict] | None = None) -> str:
        if not self.available or not self.client:
            return "ANTHROPIC_API_KEY manquant — PC Agent indisponible."
        messages = self._history_messages(history) + [{"role": "user", "content": instruction}]
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(None, self._agentic_loop, messages)
        except Exception as e:
            log.error('PCAgent error: %s', e)
            return f'❌ PC Agent erreur: {e}'

    def _create(self, messages: list):
        try:
            return self.client.messages.create(model=self.MODEL, max_tokens=2048, system=self.SYSTEM, tools=TOOLS, messages=messages)
        except anthropic.NotFoundError:
            log.warning('Modèle %s indisponible → %s', self.MODEL, self.FALLBACK_MODEL)
            self.MODEL = self.FALLBACK_MODEL
            return self.client.messages.create(model=self.MODEL, max_tokens=2048, system=self.SYSTEM, tools=TOOLS, messages=messages)

    def _agentic_loop(self, messages: list) -> str:
        guard = LoopGuard()
        last_text = ''
        for _ in range(14):
            response = self._create(messages)
            messages.append({"role": "assistant", "content": response.content})
            texts = [b.text for b in response.content if getattr(b, 'type', '') == 'text' and b.text.strip()]
            if texts:
                last_text = texts[-1]
            if response.stop_reason != 'tool_use':
                return last_text or '✅ Fait.'
            tool_results = []
            for block in response.content:
                if block.type != 'tool_use':
                    continue
                log.info('PC Agent tool: %s %s', block.name, str(block.input)[:80])
                if block.name == 'show_widget':
                    result = self.widget_cb(dict(block.input)) if self.widget_cb else 'Écran Nexus indisponible'
                else:
                    result = _run_tool(block.name, block.input)
                log.info('PC Agent result: %s', str(result)[:100])
                stop = guard.check(block.name, block.input, result)
                if stop:
                    log.warning('PC Agent loop guard: %s', stop)
                    return stop
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(result)[:4000]})
            messages.append({"role": "user", "content": tool_results})
        return last_text or "J'ai fait plusieurs étapes mais je n'ai pas fini : redis-moi ce qu'il reste à faire."
