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

log = logging.getLogger('nexus.pc_agent')

DESKTOP   = Path.home() / 'OneDrive' / 'Bureau'
DOWNLOADS = Path.home() / 'Downloads'
DOCUMENTS = Path.home() / 'Documents'
IBRAHIM   = Path.home() / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim'
DZARYX_ROOT = DESKTOP / 'Dzaryx'

_SHORTCUT: dict[str, Path] = {
    'bureau': DESKTOP, 'desktop': DESKTOP,
    'documents': DOCUMENTS, 'téléchargements': DOWNLOADS, 'downloads': DOWNLOADS,
    'ibrahim': IBRAHIM, 'projet': IBRAHIM,
}

def _resolve(text: str) -> Path:
    t = text.strip().lower()
    for k, p in _SHORTCUT.items():
        if k in t:
            return p
    p = Path(text.strip())
    return p if p.exists() else DESKTOP / text.strip()

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
    """Claude AI local avec accès complet au PC Windows."""

    SYSTEM = (
        "Tu es NEXUS, l'agent PC de Kouider (Fik Conciergerie Oran, location voitures). "
        "Tu as un accès complet au PC Windows de Kouider et tu EXÉCUTES vraiment les actions demandées. "
        "Tu peux: installer des apps, ouvrir des terminaux, lancer Claude Code, gérer des fichiers/dossiers, "
        "exécuter des commandes PowerShell, tout ce qu'un humain peut faire sur ce PC. "
        "Quand Kouider te demande quelque chose, utilise les outils disponibles pour le faire. "
        "Réponds toujours en français. Sois direct et concis."
    )

    def __init__(self) -> None:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None
        self.available = bool(api_key)

    async def run(self, instruction: str) -> str:
        if not self.available or not self.client:
            return "ANTHROPIC_API_KEY manquant — PC Agent indisponible."

        messages = [{"role": "user", "content": instruction}]
        loop = asyncio.get_running_loop()

        try:
            result = await loop.run_in_executor(None, self._agentic_loop, messages)
            return result
        except Exception as e:
            log.error('PCAgent error: %s', e)
            return f'❌ PC Agent erreur: {e}'

    def _agentic_loop(self, messages: list) -> str:
        max_rounds = 6
        for _ in range(max_rounds):
            response = self.client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=1024,
                system=self.SYSTEM,
                tools=TOOLS,
                messages=messages,
            )
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason == 'end_turn':
                # Extract text response
                for block in response.content:
                    if hasattr(block, 'text'):
                        return block.text
                return '✅ Fait.'

            if response.stop_reason != 'tool_use':
                break

            # Execute tool calls
            tool_results = []
            for block in response.content:
                if block.type != 'tool_use':
                    continue
                log.info('PC Agent tool: %s %s', block.name, str(block.input)[:80])
                result = _run_tool(block.name, block.input)
                log.info('PC Agent result: %s', result[:100])
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

            messages.append({"role": "user", "content": tool_results})

        # Extract final text if any
        for block in (messages[-1].get('content', []) if isinstance(messages[-1].get('content'), list) else []):
            if isinstance(block, dict) and block.get('type') == 'text':
                return block['text']
        return '✅ Commande exécutée.'
