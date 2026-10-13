"""
NEXUS MCP — les outils de Dzaryx (lecture seule) dans d'autres IA : Claude Code, Claude Desktop, Cursor…
(idée reprise de bertrandmbanwi/Jarvis). Ils peuvent alors lire réservations, clients, finances, flotte,
mails pro, agenda, prospects… Aucune écriture : les actions passent par Dzaryx.

Brancher dans Claude Code (une fois) :
    claude mcp add dzaryx -- python C:\\chemin\\vers\\nexus\\mcp_server.py
Claude Desktop / Cursor (mcp.json) :
    {"mcpServers": {"dzaryx": {"command": "python", "args": ["C:\\\\chemin\\\\vers\\\\nexus\\\\mcp_server.py"]}}}

Lit BACKEND_URL et PC_AGENT_TOKEN dans nexus/.env (les mêmes que Nexus).
"""
import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.stdio import stdio_server

load_dotenv(Path(__file__).resolve().parent / '.env')
BACKEND_URL = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
TOKEN = os.environ.get('PC_AGENT_TOKEN', '')
HEADERS = {'Authorization': f'Bearer {TOKEN}'}

server_name = 'dzaryx'


async def _tools() -> list[types.Tool]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f'{BACKEND_URL}/api/mcp/tools', headers=HEADERS)
        r.raise_for_status()
    # model_validate avec les noms du protocole (camelCase) : marche avec le SDK mcp 1.x et 2.x
    return [types.Tool.model_validate({
        'name': t['name'], 'description': t['description'][:1024],
        'inputSchema': t['input_schema'] or {'type': 'object', 'properties': {}},
        'annotations': {'readOnlyHint': True}}) for t in r.json()['tools']]


async def _call(name: str, arguments: dict | None) -> tuple[str, bool]:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f'{BACKEND_URL}/api/mcp/call', headers=HEADERS,
                         json={'name': name, 'input': arguments or {}})
    if r.status_code != 200:
        return f"Erreur Dzaryx ({r.status_code}) : {r.text[:300]}", True
    return r.json().get('text', ''), False


def _build_server() -> Server:
    probe = Server(server_name)
    if hasattr(probe, 'list_tools'):          # SDK mcp 1.x : décorateurs
        @probe.list_tools()
        async def list_tools() -> list[types.Tool]:
            return await _tools()

        @probe.call_tool()
        async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
            text, _ = await _call(name, arguments)
            return [types.TextContent(type='text', text=text)]
        return probe

    async def on_list_tools(_ctx, _params):   # SDK mcp 2.x : handlers passés au constructeur
        return types.ListToolsResult.model_validate({'tools': [t.model_dump(by_alias=True, exclude_none=True)
                                                               for t in await _tools()]})

    async def on_call_tool(_ctx, params):
        text, err = await _call(params.name, params.arguments)
        return types.CallToolResult.model_validate({'content': [{'type': 'text', 'text': text}], 'isError': err})

    return Server(server_name, on_list_tools=on_list_tools, on_call_tool=on_call_tool)


server = _build_server()


async def main() -> None:
    if not TOKEN:
        print('PC_AGENT_TOKEN manquant dans nexus/.env', file=sys.stderr)
        sys.exit(1)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == '__main__':
    asyncio.run(main())
