#!/usr/bin/env python3
"""
NEXUS — Agent PC Windows
Canal 3 de Dzaryx · Fik Conciergerie Oran
Lance: start.bat  ou  python nexus.py
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

from modules.voice            import VoiceModule
from modules.ws_client        import NexusWSClient
from modules.pc_control       import PCControl
from modules.wol              import WoLService
from modules.claude_code      import ClaudeCodeManager
from modules.wake_word        import WakeWordDetector
from modules.agents           import MultiAgentSystem
from modules.morning_briefing import MorningBriefing
from modules.proactive        import ProactiveMonitor
from modules.night_watch      import NightWatch
from modules.vision           import VisionModule
from modules.music            import MusicController
from modules.auto_unlock      import save_password, unlock_pc, is_configured

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('nexus')

BASE_DIR  = Path(__file__).parent
HTTP_PORT = int(os.environ.get('NEXUS_HTTP_PORT', 7777))
WS_PORT   = int(os.environ.get('NEXUS_WS_PORT',   7778))

# ── Regex patterns ────────────────────────────────────────────────────────────
_MUSIC_RE      = re.compile(r'\b(joue?|lance|play|écoute?|mets?|met)\b', re.I)
_YOUTUBE_RE    = re.compile(r'\byoutube\b', re.I)
_SPOTIFY_RE    = re.compile(r'\bspotify\b', re.I)
_PAUSE_RE      = re.compile(r'\b(pause|stop\s+la\s+musique|coupe\s+le\s+son)\b', re.I)
_NEXT_RE       = re.compile(r'\b(suivant|next|prochaine?\s+chanson)\b', re.I)
_PREV_RE       = re.compile(r'\b(pr[eé]c[eé]dent|previous|chanson\s+d\'?avant)\b', re.I)

_CAMERA_RE     = re.compile(r'\b(regarde[\s-]?moi|active\s+la\s+cam[eé]ra?|ouvre\s+la\s+cam|cam[eé]ra?\s+on|que\s+vois[\s-]?tu|que\s+tu\s+vois|vois[\s-]?tu)\b', re.I)
_CAMERA_OFF_RE = re.compile(r'\b(cam[eé]ra?\s+off|ferme\s+la\s+cam|stop\s+cam|d[eé]sactive\s+la\s+cam)\b', re.I)
_VISION_RE     = re.compile(r'\b(qu[''e]\s+vois[\s-]?tu|d[eé]cris\s+ce\s+que|analyse\s+(ce\s+que\s+tu\s+vois|l[''a]\s[eé]cran)|regarde\s+(ça|cela|l[''a]\s[eé]cran))\b', re.I)

_UNLOCK_RE     = re.compile(r'\b(d[eé]verrouille|unlock|ouvre\s+le\s+pc|mot\s+de\s+passe\s+windows)\b', re.I)
_SAVE_PASS_RE  = re.compile(r'\b(enregistre\s+(mon\s+)?mot\s+de\s+passe|sauvegarde\s+(mon\s+)?mot\s+de\s+passe)\b', re.I)

_BRIEFING_RE   = re.compile(r'\b(briefing|rapport\s+(du\s+)?matin|r[eé]sum[eé]\s+(du\s+)?jour)\b', re.I)
_AGENT_RE      = re.compile(r'\b(strat[eè]ge?|agent\s+dev|agent\s+design|agent\s+anal|agent\s+market|agent\s+supervis|agent\s+architect)\b', re.I)
_CLAUDE_RE     = re.compile(r'\b(claude\s+code|lance\s+claude|ouvre\s+claude\s+code)\b', re.I)
_CLAUDE_TASK_RE= re.compile(r'\b(claude\s+(t[aâ]che|task)|ex[eé]cute\s+avec\s+claude)\b', re.I)
_METEO_RE      = re.compile(r'\b(m[eé]t[eé]o|temps\s+qu[''i]l\s+fait|temp[eé]rature|quel\s+temps)\b', re.I)
_DISK_RE       = re.compile(r'\b(disque|stockage|espace\s+libre|disk)\b', re.I)
_VOLUME_RE     = re.compile(r'\bvolume\s+(\d+)\b', re.I)


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
        self.vision   = VisionModule(self)
        self.music    = MusicController()

        self.gui_connections: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.mic_active = False
        self._chat_history: list[dict] = []  # {role, text}

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

    # ── Chat history ─────────────────────────────────────────────────────────
    def _push_chat(self, role: str, text: str) -> None:
        self._chat_history.append({'role': role, 'text': text})
        if len(self._chat_history) > 20:
            self._chat_history.pop(0)
        # Send last 5 to GUI
        asyncio.create_task(self.gui_send({
            'type':    'chat_history',
            'history': self._chat_history[-5:],
        }))

    # ── Speak ────────────────────────────────────────────────────────────────
    async def speak(self, text: str) -> None:
        if not text:
            return
        await self.gui_send({'type': 'waveform', 'active': True})
        await self.gui_send({'type': 'speak', 'text': text})
        self._push_chat('nexus', text)
        await self.voice.speak(text)
        await self.gui_send({'type': 'waveform', 'active': False})

    # ── Master command router ─────────────────────────────────────────────────
    async def handle_command(self, text: str, source: str = 'nexus') -> None:
        log.info('Command [%s]: %s', source, text[:80])
        t = text.strip()
        tl = t.lower()

        if source == 'nexus':
            self._push_chat('user', t)

        # ── 0. Briefing ──────────────────────────────────────────────────────
        if _BRIEFING_RE.search(tl):
            await self.briefing.run_now()
            return

        # ── 1. Déverrouillage / mot de passe ────────────────────────────────
        if _SAVE_PASS_RE.search(tl):
            # Extract password after the trigger phrase
            pwd = re.sub(r'.*(mot\s+de\s+passe|password)\s*', '', t, flags=re.I).strip()
            if len(pwd) >= 4:
                save_password(pwd)
                if source == 'nexus':
                    await self.speak('Mot de passe enregistré de façon sécurisée. Je peux maintenant déverrouiller le PC pour toi.')
            else:
                if source == 'nexus':
                    await self.speak('Dis-moi le mot de passe à enregistrer après la commande.')
            return

        if _UNLOCK_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = unlock_pc()
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result)
            return

        # ── 2. Musique ───────────────────────────────────────────────────────
        if _PAUSE_RE.search(tl):
            r = self.music.pause_media()
            if source == 'nexus':
                await self.speak(r)
            return

        if _NEXT_RE.search(tl):
            r = self.music.next_track()
            if source == 'nexus':
                await self.speak(r)
            return

        if _PREV_RE.search(tl):
            r = self.music.prev_track()
            if source == 'nexus':
                await self.speak(r)
            return

        vol_m = _VOLUME_RE.search(tl)
        if vol_m:
            r = self.music.set_volume(int(vol_m.group(1)))
            if source == 'nexus':
                await self.speak(r)
            return

        if _MUSIC_RE.search(tl):
            # Extract the query (remove the action verb)
            query = re.sub(
                r'\b(joue?|lance|play|[eé]coute?|mets?|met)\b\s*', '', t, flags=re.I
            ).strip()
            query = re.sub(r'\b(sur|depuis|avec|via)\s+(youtube|spotify)\b', '', query, flags=re.I).strip()
            query = query or t

            platform = 'auto'
            if _YOUTUBE_RE.search(tl):
                platform = 'youtube'
            elif _SPOTIFY_RE.search(tl):
                platform = 'spotify'

            await self.gui_send({'type': 'thinking', 'active': True})
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self.music.play, query, platform)
            await self.gui_send({'type': 'thinking', 'active': False})
            await self.gui_send({'type': 'widget', 'widget': 'music', 'data': {'query': query, 'platform': platform}})
            if source == 'nexus':
                await self.speak(result)
            await self.journal(f'🎵 Musique: {query}')
            return

        # ── 3. Caméra / Vision ───────────────────────────────────────────────
        if _CAMERA_OFF_RE.search(tl):
            r = self.vision.stop_live()
            if source == 'nexus':
                await self.speak(r)
            return

        if _CAMERA_RE.search(tl):
            # Activate live camera feed + describe immediately
            await self.gui_send({'type': 'thinking', 'active': True})
            self.vision.start_live()
            # Describe what it sees
            prompt = re.sub(_CAMERA_RE, '', t).strip() or 'Décris ce que tu vois et salue Kouider.'
            description = await self.vision.capture_and_describe(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(description)
            await self.journal('📷 Vision activée')
            return

        if _VISION_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            prompt = re.sub(_VISION_RE, '', t).strip() or 'Décris ce que tu vois.'
            description = await self.vision.capture_and_describe(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(description)
            return

        # ── 4. Météo ─────────────────────────────────────────────────────────
        if _METEO_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            weather = await self._fetch_weather()
            await self.gui_send({'type': 'thinking', 'active': False})
            if weather:
                await self.gui_send({'type': 'widget', 'widget': 'weather', 'data': weather})
                if source == 'nexus':
                    await self.speak(f"À Oran: {weather['temp']} degrés, {weather['desc']}.")
            return

        # ── 5. Disque ────────────────────────────────────────────────────────
        if _DISK_RE.search(tl):
            await self.handle_widget_request('disk')
            if source == 'nexus':
                import shutil
                t2, u, f = shutil.disk_usage('C:')
                pct = round(u / t2 * 100, 1)
                await self.speak(f'Disque C: {pct} pourcent utilisé, {round(f/1e9,1)} giga libres.')
            return

        # ── 6. PC control local ──────────────────────────────────────────────
        pc_result = self.pc.try_handle(t)
        if pc_result:
            if source == 'nexus':
                await self.speak(pc_result)
            await self.journal(f'🖥️ {pc_result}')
            return

        # ── 7. Claude Code ───────────────────────────────────────────────────
        if _CLAUDE_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.claude.launch(auto_accept=True)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result)
            return

        if _CLAUDE_TASK_RE.search(tl):
            prompt = re.sub(r'\b(claude\s+(t[aâ]che|task)|ex[eé]cute\s+avec\s+claude):?\s*', '', t, flags=re.I).strip()
            if prompt:
                await self.gui_send({'type': 'thinking', 'active': True})
                result = await self.claude.run_task(prompt)
                await self.gui_send({'type': 'thinking', 'active': False})
                if source == 'nexus':
                    await self.speak(result[:300])
                await self.journal(f'🤖 Claude task done')
            return

        # ── 8. Multi-agents ──────────────────────────────────────────────────
        if self.agents.is_available() and _AGENT_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.agents.route_and_run(t)
            await self.gui_send({'type': 'thinking', 'active': False})
            await self.gui_send({'type': 'status', 'text': f'AGENT {result.agent.upper()}'})
            if source == 'nexus':
                await self.speak(result.response[:400])
            await self.journal(f'🧠 Agent {result.agent}')
            return

        # ── 9. Dzaryx AI (fallback) ──────────────────────────────────────────
        await self.gui_send({'type': 'thinking', 'active': True})
        response = await self.ws.send_to_dzaryx(t, source)
        await self.gui_send({'type': 'thinking', 'active': False})
        if response and source == 'nexus':
            await self.speak(response)

    # ── Journal ──────────────────────────────────────────────────────────────
    async def journal(self, message: str) -> None:
        await self.gui_send({'type': 'journal', 'text': message})
        await self.ws.journal(message)

    # ── Mic ──────────────────────────────────────────────────────────────────
    def toggle_mic(self) -> None:
        self.mic_active = not self.mic_active
        if self.mic_active and self.loop:
            threading.Thread(target=self._mic_thread, daemon=True).start()

    def _mic_thread(self) -> None:
        while self.mic_active:
            text = self.voice.listen_once()
            if text and self.loop:
                asyncio.run_coroutine_threadsafe(
                    self.handle_command(text, 'nexus'), self.loop
                )

    # ── Widgets ──────────────────────────────────────────────────────────────
    async def handle_widget_request(self, widget_type: str) -> None:
        if widget_type == 'disk':
            import shutil
            t2, u, f = shutil.disk_usage('C:')
            await self.gui_send({
                'type': 'widget', 'widget': 'disk',
                'data': {'total': t2, 'used': u, 'free': f, 'pct': round(u / t2 * 100, 1)},
            })

    # ── Weather ──────────────────────────────────────────────────────────────
    async def _fetch_weather(self) -> dict | None:
        import aiohttp
        try:
            url = f"{os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')}/api/weather?city=Oran"
            async with aiohttp.ClientSession() as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=8)) as r:
                    data = await r.json()
                    temp = data.get('temperature') or data.get('temp') or data.get('main', {}).get('temp', '?')
                    desc = data.get('description') or data.get('desc') or data.get('weather', [{}])[0].get('description', '')
                    if isinstance(temp, float):
                        temp = round(temp)
                    return {'temp': temp, 'desc': desc}
        except Exception as e:
            log.error('Weather: %s', e)
            return None

    # ── HTTP server ───────────────────────────────────────────────────────────
    def _start_http(self) -> None:
        os.chdir(BASE_DIR)

        class SilentHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_): pass

        with socketserver.TCPServer(('localhost', HTTP_PORT), SilentHandler) as httpd:
            log.info('HTTP  → http://localhost:%d/gui/index.html', HTTP_PORT)
            httpd.serve_forever()

    # ── GUI WebSocket ─────────────────────────────────────────────────────────
    async def _gui_ws(self) -> None:
        import websockets

        async def handler(conn):
            self.gui_connections.add(conn)
            await self.gui_send({'type': 'status', 'backend': self.ws.is_connected()})
            # Send chat history
            await self.gui_send({'type': 'chat_history', 'history': self._chat_history[-5:]})
            try:
                async for raw in conn:
                    data = json.loads(raw)
                    t2 = data.get('type')
                    if t2 == 'message':
                        asyncio.create_task(self.handle_command(data.get('text', '')))
                    elif t2 == 'mic_toggle':
                        self.toggle_mic()
                    elif t2 == 'widget_request':
                        asyncio.create_task(self.handle_widget_request(data.get('widget', '')))
                    elif t2 == 'camera_toggle':
                        if self.vision.is_live():
                            r = self.vision.stop_live()
                        else:
                            r = self.vision.start_live()
                        await self.gui_send({'type': 'status', 'text': r})
            except Exception:
                pass
            finally:
                self.gui_connections.discard(conn)

        async with websockets.serve(handler, 'localhost', WS_PORT):
            log.info('WS    → ws://localhost:%d', WS_PORT)
            await asyncio.Future()

    # ── Browser ───────────────────────────────────────────────────────────────
    def _open_browser(self) -> None:
        url = f'http://localhost:{HTTP_PORT}/gui/index.html'
        browsers = [
            [r'C:\Program Files\Google\Chrome\Application\chrome.exe',
             f'--app={url}', '--window-size=1000,750', '--window-position=80,40'],
            [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
             f'--app={url}', '--window-size=1000,750'],
        ]
        for cmd in browsers:
            try:
                subprocess.Popen(cmd)
                return
            except FileNotFoundError:
                continue
        import webbrowser
        webbrowser.open(url)

    # ── Startup ───────────────────────────────────────────────────────────────
    async def _startup(self) -> None:
        await asyncio.sleep(3)
        greeting = "Salut Kouider, NEXUS en ligne."
        if is_configured():
            greeting += " Mot de passe configuré, je peux déverrouiller le PC."
        greeting += " Qu'est-ce qu'on fait ?"
        await self.speak(greeting)
        await self.journal('🟢 NEXUS en ligne')
        await self.handle_widget_request('disk')
        self.wake_det.start()
        asyncio.create_task(self.briefing.run_if_morning())

    # ── Main ──────────────────────────────────────────────────────────────────
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
