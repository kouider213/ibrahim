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

server = Server('dzaryx')


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f'{BACKEND_URL}/api/mcp/tools', headers=HEADERS)
        r.raise_for_status()
    return [types.Tool(name=t['name'], description=t['description'][:1024],
                       inputSchema=t['input_schema'] or {'type': 'object', 'properties': {}},
                       annotations=types.ToolAnnotations(readOnlyHint=True))
            for t in r.json()['tools']]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(f'{BACKEND_URL}/api/mcp/call', headers=HEADERS,
                         json={'name': name, 'input': arguments or {}})
    if r.status_code != 200:
        text = f"Erreur Dzaryx ({r.status_code}) : {r.text[:300]}"
    else:
        text = r.json().get('text', '')
    return [types.TextContent(type='text', text=text)]


async def main() -> None:
    if not TOKEN:
        print('PC_AGENT_TOKEN manquant dans nexus/.env', file=sys.stderr)
        sys.exit(1)
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == '__main__':
    asyncio.run(main())
