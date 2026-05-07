#!/usr/bin/env python3
"""
NEXUS — Agent PC Windows
Canal 3 de Dzaryx · Fik Conciergerie Oran
Lance depuis: start.bat  ou  python nexus.py
"""
import asyncio
import http.server
import json
import logging
import os
import re
import socketserver
import subprocess
import threading
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

from modules.voice           import VoiceModule
from modules.ws_client       import NexusWSClient
from modules.pc_control      import PCControl
from modules.wol             import WoLService
from modules.claude_code     import ClaudeCodeManager
from modules.wake_word       import WakeWordDetector
from modules.agents          import MultiAgentSystem
from modules.morning_briefing import MorningBriefing
from modules.proactive       import ProactiveMonitor
from modules.night_watch     import NightWatch

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('nexus')

BASE_DIR  = Path(__file__).parent
HTTP_PORT = int(os.environ.get('NEXUS_HTTP_PORT', 7777))
WS_PORT   = int(os.environ.get('NEXUS_WS_PORT',   7778))

# Keywords that trigger multi-agent routing instead of Dzaryx
_AGENT_TRIGGERS = re.compile(
    r'\b(stratège|stratege|agent dev|agent design|agent analyse|agent marketing|'
    r'agent superviseur|agent architecte|analyse (les|le|la|mon|ma)|idée business|'
    r'idee business|campagne|contenu tiktok|post instagram|rapport financier|'
    r'audit|vérifie que|verifie que)\b',
    re.I,
)
_BRIEFING_TRIGGERS = re.compile(r'\b(briefing|rapport (du )?matin|résumé (du )?jour)\b', re.I)
_AGENT_FORCE = re.compile(
    r'\b(stratège|stratege|dev|architecte|design|analyste|marketing|superviseur)\b',
    re.I,
)


class NexusApp:
    def __init__(self) -> None:
        self.voice    = VoiceModule()
        self.pc       = PCControl()
        self.ws       = NexusWSClient(self)
        self.wol      = WoLService(self)
        self.claude   = ClaudeCodeManager()
        self.agents   = MultiAgentSystem()
        self.wake_det = WakeWordDetector(self)
        self.briefing = MorningBriefing(self)
        self.proact   = ProactiveMonitor(self)
        self.night    = NightWatch(self)

        self.gui_connections: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.mic_active = False

    # ── GUI broadcast ────────────────────────────────────────────────────────
    async def gui_send(self, data: dict) -> None:
        if not self.gui_connections:
            return
        msg  = json.dumps(data, ensure_ascii=False)
        dead: set = set()
        for conn in list(self.gui_connections):
            try:
                await conn.send(msg)
            except Exception:
                dead.add(conn)
        self.gui_connections -= dead

    # ── Voice + waveform ─────────────────────────────────────────────────────
    async def speak(self, text: str) -> None:
        if not text:
            return
        await self.gui_send({'type': 'waveform', 'active': True})
        await self.gui_send({'type': 'speak', 'text': text})
        await self.voice.speak(text)
        await self.gui_send({'type': 'waveform', 'active': False})

    # ── Command router ───────────────────────────────────────────────────────
    async def handle_command(self, text: str, source: str = 'nexus') -> None:
        log.info('Command [%s]: %s', source, text[:80])
        t_low = text.lower().strip()

        # 0. Briefing manuel
        if _BRIEFING_TRIGGERS.search(t_low):
            await self.briefing.run_now()
            return

        # 1. Local PC shortcut
        pc_result = self.pc.try_handle(text)
        if pc_result:
            if source == 'nexus':
                await self.speak(pc_result)
            await self.journal(f'🖥️ {pc_result}')
            return

        # 2. Claude Code launch
        if any(kw in t_low for kw in ['claude code', 'lance claude', 'ouvre claude code']):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.claude.launch(auto_accept=True)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result)
            return

        # 3. Claude Code task (non-interactive)
        if any(kw in t_low for kw in ['claude tâche', 'claude task', 'exécute avec claude']):
            prompt = re.sub(r'(claude\s+(tâche|task|exécute avec claude):?\s*)', '', text, flags=re.I).strip()
            if prompt:
                await self.gui_send({'type': 'thinking', 'active': True})
                result = await self.claude.run_task(prompt)
                await self.gui_send({'type': 'thinking', 'active': False})
                if source == 'nexus':
                    short = result[:300] + ('…' if len(result) > 300 else '')
                    await self.speak(short)
                await self.journal(f'🤖 Claude task: {result[:200]}')
                return

        # 4. Météo → widget direct
        if any(kw in t_low for kw in ['météo', 'meteo', 'temps qu', 'temperature', 'temp']):
            await self.gui_send({'type': 'thinking', 'active': True})
            weather = await self._fetch_weather()
            await self.gui_send({'type': 'thinking', 'active': False})
            if weather:
                await self.gui_send({'type': 'widget', 'widget': 'weather', 'data': weather})
                msg = f"Oran: {weather['temp']}°C, {weather['desc']}"
                if source == 'nexus':
                    await self.speak(msg)
                return

        # 5. Multi-agent routing
        if self.agents.is_available() and (
            _AGENT_TRIGGERS.search(t_low) or
            any(kw in t_low for kw in ['agent ', 'analyse ', 'stratégie', 'marketing'])
        ):
            # Check if a specific agent is forced
            forced = None
            m = _AGENT_FORCE.search(t_low)
            if m:
                forced = m.group(1).lower()
                # Normalize
                if forced == 'stratege':
                    forced = 'stratège'
                elif forced == 'analyste':
                    forced = 'analyste'

            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.agents.route_and_run(text, force_agent=forced)
            await self.gui_send({'type': 'thinking', 'active': False})

            await self.gui_send({'type': 'status', 'text': f'AGENT {result.agent.upper()}'})
            if source == 'nexus':
                # Speak first 400 chars
                spoken = result.response[:400]
                await self.speak(spoken)
            await self.journal(f'🧠 Agent {result.agent}: {result.response[:150]}')
            return

        # 6. Forward to Dzaryx AI
        await self.gui_send({'type': 'thinking', 'active': True})
        response = await self.ws.send_to_dzaryx(text, source)
        await self.gui_send({'type': 'thinking', 'active': False})

        if response and source == 'nexus':
            await self.speak(response)

    # ── Journal → Telegram + App ─────────────────────────────────────────────
    async def journal(self, message: str) -> None:
        await self.gui_send({'type': 'journal', 'text': message})
        await self.ws.journal(message)

    # ── Mic toggle ───────────────────────────────────────────────────────────
    def toggle_mic(self) -> None:
        self.mic_active = not self.mic_active
        if self.mic_active and self.loop:
            threading.Thread(target=self._mic_thread, daemon=True).start()

    def _mic_thread(self) -> None:
        while self.mic_active:
            text = self.voice.listen_once()
            if text and self.loop:
                asyncio.run_coroutine_threadsafe(
                    self.handle_command(text, 'nexus'),
                    self.loop,
                )

    # ── Widget requests ──────────────────────────────────────────────────────
    async def handle_widget_request(self, widget_type: str) -> None:
        if widget_type == 'disk':
            import shutil
            t, u, f = shutil.disk_usage('C:')
            await self.gui_send({
                'type': 'widget', 'widget': 'disk',
                'data': {'total': t, 'used': u, 'free': f, 'pct': round(u / t * 100, 1)},
            })

    # ── Weather fetch ────────────────────────────────────────────────────────
    async def _fetch_weather(self) -> dict | None:
        import aiohttp
        try:
            url = f"{os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')}/api/weather?city=Oran"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                    data = await r.json()
                    temp = (
                        data.get('temperature') or data.get('temp') or
                        data.get('main', {}).get('temp', '?')
                    )
                    desc = (
                        data.get('description') or data.get('desc') or
                        data.get('weather', [{}])[0].get('description', '')
                    )
                    if isinstance(temp, float):
                        temp = round(temp)
                    return {'temp': temp, 'desc': desc}
        except Exception as e:
            log.error('Weather fetch: %s', e)
            return None

    # ── HTTP server (serves GUI) ─────────────────────────────────────────────
    def _start_http(self) -> None:
        os.chdir(BASE_DIR)

        class SilentHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_): pass

        with socketserver.TCPServer(('localhost', HTTP_PORT), SilentHandler) as httpd:
            log.info('HTTP  → http://localhost:%d/gui/index.html', HTTP_PORT)
            httpd.serve_forever()

    # ── GUI WebSocket server ─────────────────────────────────────────────────
    async def _gui_ws(self) -> None:
        import websockets

        async def handler(conn):
            self.gui_connections.add(conn)
            await self.gui_send({'type': 'status', 'backend': self.ws.is_connected()})
            try:
                async for raw in conn:
                    data = json.loads(raw)
                    t = data.get('type')
                    if t == 'message':
                        asyncio.create_task(self.handle_command(data.get('text', '')))
                    elif t == 'mic_toggle':
                        self.toggle_mic()
                    elif t == 'widget_request':
                        asyncio.create_task(self.handle_widget_request(data.get('widget', '')))
            except Exception:
                pass
            finally:
                self.gui_connections.discard(conn)

        async with websockets.serve(handler, 'localhost', WS_PORT):
            log.info('WS    → ws://localhost:%d', WS_PORT)
            await asyncio.Future()

    # ── Open browser in app mode ─────────────────────────────────────────────
    def _open_browser(self) -> None:
        url = f'http://localhost:{HTTP_PORT}/gui/index.html'
        browsers = [
            [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
             f'--app={url}', '--window-size=900,700', '--window-position=100,50',
             '--disable-background-timer-throttling'],
            [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
             f'--app={url}', '--window-size=900,700'],
        ]
        for cmd in browsers:
            try:
                subprocess.Popen(cmd)
                return
            except FileNotFoundError:
                continue
        import webbrowser
        webbrowser.open(url)

    # ── Startup sequence ─────────────────────────────────────────────────────
    async def _startup(self) -> None:
        await asyncio.sleep(3)
        await self.speak("Salut Kouider, NEXUS en ligne. Qu'est-ce qu'on fait ?")
        await self.journal('🟢 NEXUS en ligne')
        await self.handle_widget_request('disk')
        # Start wake word detector
        self.wake_det.start()
        # Morning briefing (runs only if 6h-13h and not yet done today)
        asyncio.create_task(self.briefing.run_if_morning())

    # ── Main ─────────────────────────────────────────────────────────────────
    async def run(self) -> None:
        self.loop = asyncio.get_running_loop()
        threading.Thread(target=self._start_http, daemon=True).start()
        await asyncio.sleep(0.4)
        threading.Thread(target=self._open_browser, daemon=True).start()
        await asyncio.gather(
            self._gui_ws(),
            self.ws.run(),
            self.wol.run(),
            self.proact.run(),
            self.night.run_loop(),
            self._startup(),
        )


def main() -> None:
    print("""
 ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
 ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
 ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
 ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
 ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
 ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
 AGENT PC · FIK CONCIERGERIE · ORAN
""")
    app = NexusApp()
    try:
        asyncio.run(app.run())
    except KeyboardInterrupt:
        log.info('NEXUS arrêté.')


if __name__ == '__main__':
    main()
