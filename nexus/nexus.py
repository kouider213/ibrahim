#!/usr/bin/env python3
"""
NEXUS — Agent PC Windows
Canal 3 de Dzaryx · Fik Conciergerie Oran
Lance: start.bat  ou  python nexus.py
"""
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import asyncio
import http.server
import json
import logging
import os
import re
import socketserver
import subprocess
import threading
from datetime import datetime
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
from modules.tiktok           import TikTokAnalyzer
from modules.file_manager     import FileManager
from modules.input_control    import InputControl
from modules.app_installer    import AppInstaller
from modules.git_manager      import GitManager
from modules.pc_agent         import PCAgent

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
_MUSIC_RE      = re.compile(r'\b(joue[rz]?|lance[rz]?|play|[eé]coute[rz]?|mets?|mettre|d[eé]marre[rz]?\s+(?:spotify|youtube|musique)|ouvre[rz]?\s+(?:spotify|youtube)|musique|chanson|lacrim|jul\b|soolking|sch\b|nekfeu|booba|kaaris)\b', re.I)
_YOUTUBE_RE    = re.compile(r'\byoutube\b', re.I)
_SPOTIFY_RE    = re.compile(r'\bspotify\b', re.I)
_PAUSE_RE      = re.compile(r'\b(pause|stop\s+la\s+musique|coupe\s+le\s+son|arr[eê]te\s+la\s+musique|silence)\b', re.I)
_NEXT_RE       = re.compile(r'\b(suivant|next|prochaine?\s+chanson|chanson\s+suivante)\b', re.I)
_PREV_RE       = re.compile(r'\b(pr[eé]c[eé]dent|previous|chanson\s+d\'?avant|chanson\s+pr[eé]c[eé]dente)\b', re.I)

_RELAY_START_RE  = re.compile(r'\b(envoie?\s+le\s+live|montre?\s+le\s+live|relay|live\s+(?:sur|vers)\s+(?:le\s+)?pc|affiche?\s+(?:la\s+)?cam[eé]ra?\s+(?:sur|vers)\s+(?:le\s+)?pc)\b', re.I)
_RELAY_STOP_RE   = re.compile(r'\b(stop\s+(?:le\s+)?relay|arr[eê]te?\s+(?:le\s+)?relay|ferme?\s+(?:la\s+)?fen[eê]tre?\s+cam[eé]ra?|stop\s+live\s+pc)\b', re.I)
_CAMERA_OFF_RE   = re.compile(r'\b(cam[eé]ra?\s+off|ferme\s+la\s+cam|stop\s+(?:cam|live|tout)|d[eé]sactive\s+(?:la\s+cam|tout|les\s+visions?))\b', re.I)
# Caméra → app mobile uniquement
_CAM_PHONE_RE    = re.compile(r'\b(cam[eé]ra?\s+(?:t[eé]l[eé]?|app|mobile)|live\s+(?:t[eé]l[eé]?|(?:sur\s+)?l[a\']app|sur\s+(?:le\s+)?t[eé]l)|juste\s+(?:sur\s+)?l[a\']app|uniquement\s+(?:sur\s+)?(?:le\s+)?t[eé]l)\b', re.I)
# Caméra → PC/fenêtre uniquement
_CAM_PC_RE       = re.compile(r'\b(cam[eé]ra?\s+(?:pc|fen[eê]tre|(?:sur\s+)?l[e\']?\s*[eé]cran\s*pc)|live\s+(?:sur\s+(?:le\s+)?pc|fen[eê]tre)|(?:active|ouvre?|mets?|affiche?|lance?)\s+(?:le\s+)?live\s+(?:(?:aussi\s+)?sur\s+(?:le\s+)?pc|fen[eê]tre))\b', re.I)
# Caméra → les deux (app + PC)
_CAMERA_RE       = re.compile(r'\b(regarde[\s-]?moi|active\s+la\s+cam[eé]ra?|ouvre\s+la\s+cam|cam[eé]ra?\s+on|que\s+vois[\s-]?tu|que\s+tu\s+vois|vois[\s-]?tu|cam[eé]ra?\s+(?:les\s+deux|app\s+et\s+pc))\b', re.I)
# Écran PC en live (stream bureau)
_SCREEN_LIVE_RE  = re.compile(r'\b((?:active|lance?|d[eé]marre?|montre?|stream)\s+(?:le?\s+)?(?:live\s+)?[eé]cran\s*(?:en\s+(?:live|direct))?|live\s+[eé]cran|stream\s*[eé]cran|vois?\s+(?:mon\s+)?[eé]cran\s+en\s+(?:live|direct)|regarde?\s+(?:mon\s+)?[eé]cran\s+en\s+(?:live|direct))\b', re.I)
_SCREEN_OFF_RE   = re.compile(r'\b(stop\s+[eé]cran|arr[eê]te?\s+(?:le\s+)?(?:live\s+|stream\s+)?[eé]cran|d[eé]sactive?\s+(?:le\s+)?(?:stream|vision|live)\s+[eé]cran)\b', re.I)
_VISION_RE     = re.compile(
    r"\b(qu[e']\s+vois[\s-]?tu"
    r"|d[eé]cris\s+ce\s+que"
    r"|analyse\s+(?:ce\s+que\s+tu\s+vois|l[a']\s[eé]cran)"
    r"|regarde\s+(?:ça|cela|l[a']\s[eé]cran))\b",
    re.I,
)

_UNLOCK_RE     = re.compile(r'\b(d[eé]verrouille|unlock|ouvre\s+le\s+pc|mot\s+de\s+passe\s+windows)\b', re.I)
_SAVE_PASS_RE  = re.compile(r'\b(enregistre\s+(mon\s+)?mot\s+de\s+passe|sauvegarde\s+(mon\s+)?mot\s+de\s+passe)\b', re.I)

_BRIEFING_RE   = re.compile(r'\b(briefing|rapport\s+(du\s+)?matin|r[eé]sum[eé]\s+(du\s+)?jour)\b', re.I)
_AGENT_RE      = re.compile(r'\b(strat[eè]ge?|agent\s+dev|agent\s+design|agent\s+anal|agent\s+market|agent\s+supervis|agent\s+architect|agent\s+git|agent\s+r[eé]seau|agent\s+vid[eé]o)\b', re.I)
_CLAUDE_RE     = re.compile(r'\b(claude\s+code|lance\s+claude|ouvre\s+claude(\s+code)?|d[eé]marre\s+claude)\b', re.I)
_CLAUDE_FOLDER_RE = re.compile(r'\b(dans|sur|pour|in)\s+(.+)$', re.I)
_CLAUDE_TASK_RE= re.compile(r'\b(claude\s+(t[aâ]che|task)|ex[eé]cute\s+avec\s+claude)\b', re.I)
_METEO_RE      = re.compile(r"\b(m[eé]t[eé]o|temps\s+qu[i']l\s+fait|temp[eé]rature|quel\s+temps)\b", re.I)
_DISK_RE       = re.compile(r'\b(disque|stockage|espace\s+libre|disk)\b', re.I)
_VOLUME_RE     = re.compile(r'\bvolume\s+(\d+)\b', re.I)
_TIKTOK_RE     = re.compile(r'\b(tiktok|analyse?\s+tiktok|analyse?\s+concurrent|hashtags?|trending\s+oran)\b', re.I)

# Phase 4
_SCREEN_RE     = re.compile(r'\b(analyse?\s+(?:l[a\'])?[eé]cran|que\s+vois[\s-]?tu\s+(?:sur\s+)?(?:l[a\'])?[eé]cran|regarde?\s+(?:l[a\'])?[eé]cran|capture\s+[eé]cran\s+et\s+analyse?|d[eé]cris\s+(?:l[a\'])?[eé]cran)\b', re.I)
_FILE_LIST_RE  = re.compile(r'\b(liste|montre|affiche|voir|lister)\s+(?:les\s+)?fichiers?\b', re.I)
_FILE_FIND_RE  = re.compile(r'\b(cherche?|trouve?|find)\s+(?:le\s+fichier\s+)?(.+)', re.I)
_FILE_OPEN_RE  = re.compile(r'\b(ouvre?\s+(?:le\s+fichier\s+)?|lance?\s+le\s+fichier\s+)(.+)', re.I)
_FILE_SEND_RE  = re.compile(r'\b(envoie?|send)\s+(?:le\s+fichier\s+|le\s+)?(.+?)\s+(?:sur|via|à)\s+telegram\b', re.I)
_FILE_RECENT_RE= re.compile(r'\b(r[eé]cents?|derniers?\s+fichiers?|recent\s+files?)\b', re.I)
_INPUT_CLICK_RE= re.compile(r'\b(clique?|click|clic)\b', re.I)
_INPUT_TYPE_RE = re.compile(r'\b(tape|[eé]cris?|type|saisis?)\b', re.I)
_INPUT_KEY_RE  = re.compile(r'\b(appuie?\s+sur|presse?\s+|press\s+)\b', re.I)
_INPUT_SCROLL_RE= re.compile(r'\b(scroll|d[eé]file?)\b', re.I)
_CAPCUT_RE     = re.compile(r'\b(capcut|ouvre?\s+capcut|lance?\s+capcut)\b', re.I)
_RUNWAY_RE     = re.compile(r'\b(runway|ouvre?\s+runway|lance?\s+runway)\b', re.I)
_INSTALL_RE    = re.compile(r'\b(installe?|t[eé]l[eé]charge?r?\s+(?:et\s+installer?)?|download\s+(?:and\s+install)?|install)\s+(\w[\w\s\-+.]+)', re.I)
_GIT_RE        = re.compile(r'\b(git\s+(?:status|diff|log|commit|push|pull|branch|stash)|commit\s+(?:tout|mes\s+modif|et\s+push)|push\s+(?:sur|vers)\s+(?:github|origin))\b', re.I)
_CODEX_RE      = re.compile(r'\b(codex|ouvre?\s+codex|lance?\s+codex)\b', re.I)
_NETWORK_RE    = re.compile(r'\b(analyse?\s+(?:les?\s+)?(?:r[eé]seau[xz]|concurrents?|seo|r[eé]seaux\s+sociaux|le\s+march[eé])|veille\s+(?:concurrentielle|r[eé]seau|march[eé])|benchmark\s+(?:concurrent|march[eé]))\b', re.I)
_VIDEO_PIPE_RE = re.compile(r'\b(cr[eé]e?r?\s+(?:une?\s+)?(?:pipeline\s+)?vid[eé]o|pipeline\s+vid[eé]o|produire?\s+(?:une?\s+)?vid[eé]o|script\s+(?:vid[eé]o|voix\s+off|voiceover)|plan\s+(?:de\s+)?montage)\b', re.I)
_CODE_REVIEW_RE= re.compile(r'\b(review\s+(?:le?\s+)?code|r[eé]vise?\s+(?:le?\s+)?code|audite?\s+(?:le?\s+)?code|analyse?\s+(?:ce\s+)?code|v[eé]rifie?\s+(?:le?\s+)?code|cherche?\s+(?:les?\s+)?bugs?\s+dans)\b', re.I)


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
        self.tiktok   = TikTokAnalyzer(self)
        self.files    = FileManager()
        self.input    = InputControl()
        self.installer= AppInstaller()
        self.git_mgr  = GitManager()
        self.pc_agent = PCAgent()

        self.gui_connections: set = set()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.mic_active = False
        self._chat_history: list[dict] = []   # {role, text}
        self._journal_history: list[dict] = []  # {ts, text}

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
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self.gui_send({'type': 'chat_history', 'history': self._chat_history[-5:]}),
                self.loop,
            )

    # ── Speak ────────────────────────────────────────────────────────────────
    async def speak(self, text: str) -> None:
        if not text:
            return
        await self.gui_send({'type': 'waveform', 'active': True})
        await self.gui_send({'type': 'speak', 'text': text})
        self._push_chat('nexus', text)
        await self.voice.speak(text)
        await self.gui_send({'type': 'waveform', 'active': False})

    async def _reply(self, text: str, source: str) -> None:
        """Speak if local, send journal to Telegram if remote."""
        if source == 'nexus':
            await self.speak(text)
        elif text:
            await self.journal(text)

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
            await self._reply(r, source)
            return

        if _NEXT_RE.search(tl):
            r = self.music.next_track()
            await self._reply(r, source)
            return

        if _PREV_RE.search(tl):
            r = self.music.prev_track()
            await self._reply(r, source)
            return

        vol_m = _VOLUME_RE.search(tl)
        if vol_m:
            r = self.music.set_volume(int(vol_m.group(1)))
            await self._reply(r, source)
            return

        if _MUSIC_RE.search(tl):
            # Extract the query (remove the action verb)
            query = re.sub(
                r'\b(joue[rz]?|lance[rz]?|play|[eé]coute[rz]?|mets?|mettre|d[eé]marre[rz]?|ouvre[rz]?|musique|chanson)\b\s*', '', t, flags=re.I
            ).strip()
            query = re.sub(r'\b(sur|depuis|avec|via|de\s+la|du|de)\s*(youtube|spotify)?\b', '', query, flags=re.I).strip()
            query = query or t

            plat = 'auto'
            if _YOUTUBE_RE.search(tl):
                plat = 'youtube'
            elif _SPOTIFY_RE.search(tl):
                plat = 'spotify'

            await self.gui_send({'type': 'thinking', 'active': True})
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, self.music.play, query, plat)
            await self.gui_send({'type': 'thinking', 'active': False})
            await self.gui_send({'type': 'widget', 'widget': 'music', 'data': {'query': query, 'platform': plat}})
            await self._reply(result, source)
            return

        # ── 3. Caméra / Vision / Écran ──────────────────────────────────────────

        # ── Relay app → PC ──────────────────────────────────────────────────────
        if _RELAY_START_RE.search(tl):
            r = self.vision.start_relay_display()
            await self._reply(r, source)
            return

        if _RELAY_STOP_RE.search(tl):
            r = self.vision.stop_relay_display()
            await self._reply(r, source)
            return

        # Stop tout
        if _CAMERA_OFF_RE.search(tl):
            r = self.vision.stop_all_live()
            self.vision.stop_relay_display()
            if source == 'nexus':
                await self.speak(r)
            else:
                await self.ws.journal(r)
            return

        # Stop écran live seulement
        if _SCREEN_OFF_RE.search(tl):
            r = self.vision.stop_screen_live()
            if source == 'nexus':
                await self.speak(r)
            else:
                await self.ws.journal(r)
            return

        # Écran PC en live → app mobile
        if _SCREEN_LIVE_RE.search(tl):
            r = self.vision.start_screen_live()
            if source == 'nexus':
                await self.speak(r)
            else:
                await self.ws.journal(r)
            await self.journal('🖥️ Stream écran PC → app')
            return

        # Caméra → téléphone/app uniquement
        if _CAM_PHONE_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            r = self.vision.start_live()
            prompt = re.sub(_CAM_PHONE_RE, '', t).strip() or 'Décris ce que tu vois.'
            desc = await self.vision.capture_and_describe(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(desc)
            else:
                await self.ws.journal(f'{r} — {desc}')
            await self.journal('📱 Caméra → app uniquement')
            return

        # Caméra → PC/fenêtre uniquement
        if _CAM_PC_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            r = self.vision.start_live_window()
            prompt = re.sub(_CAM_PC_RE, '', t).strip() or 'Décris ce que tu vois.'
            desc = await self.vision.capture_and_describe(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(desc)
            else:
                await self.ws.journal(f'{r} — {desc}')
            await self.journal('🖥️ Caméra → PC uniquement')
            return

        # Caméra → app + PC (les deux)
        if _CAMERA_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            self.vision.start_live_both()
            prompt = re.sub(_CAMERA_RE, '', t).strip() or 'Décris ce que tu vois et salue Kouider.'
            desc = await self.vision.capture_and_describe(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(desc)
            await self.journal('📷 Caméra → app + PC')
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

        # ── 5b. Phase 4: Screen Vision ───────────────────────────────────────
        if _SCREEN_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            prompt = re.sub(_SCREEN_RE, '', t).strip() or "Décris ce que tu vois sur l'écran."
            description = await self.vision.describe_screen(prompt)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(description)
            else:
                await self.ws.journal(description)
            await self.journal('🖥️ Analyse écran')
            return

        # ── 5c. Phase 4: File Manager ────────────────────────────────────────
        if _FILE_SEND_RE.search(tl):
            m2 = _FILE_SEND_RE.search(tl)
            name = m2.group(2).strip() if m2 else t
            path = self.files.get_file_path_for_telegram(name)
            if path:
                ok = await self.ws.send_file_telegram(str(path), f'📎 {path.name}')
                reply = f'✅ Fichier envoyé: {path.name}' if ok else f'❌ Envoi Telegram échoué: {path.name}'
            else:
                reply = f'❌ Fichier introuvable: {name}'
            if source == 'nexus':
                await self.speak(reply)
            else:
                await self.ws.journal(reply)
            return

        if _FILE_RECENT_RE.search(tl):
            folder = 'bureau'
            result = self.files.get_recent_files(folder)
            if source == 'nexus':
                await self.speak(result[:300])
            else:
                await self.ws.journal(result)
            return

        if _FILE_LIST_RE.search(tl):
            result = self.files.try_handle(t) or self.files.list_dir()
            if source == 'nexus':
                await self.speak(result[:300])
            else:
                await self.ws.journal(result)
            return

        m_find = _FILE_FIND_RE.search(tl)
        if m_find:
            result = self.files.find_file(m_find.group(2).strip())
            if source == 'nexus':
                await self.speak(result[:300])
            else:
                await self.ws.journal(result)
            return

        m_open = _FILE_OPEN_RE.search(t)
        if m_open:
            result = self.files.open_file(m_open.group(2).strip())
            if source == 'nexus':
                await self.speak(result)
            else:
                await self.ws.journal(result)
            return

        # ── 5d. Phase 4: Input Control ───────────────────────────────────────
        if any(r.search(tl) for r in (_INPUT_CLICK_RE, _INPUT_TYPE_RE, _INPUT_KEY_RE, _INPUT_SCROLL_RE)):
            result = self.input.try_handle(t)
            if result:
                if source == 'nexus':
                    await self.speak(result)
                else:
                    await self.ws.journal(result)
                return

        # ── 5e. Phase 4: CapCut ───────────────────────────────────────────────
        if _CAPCUT_RE.search(tl):
            result = self._launch_capcut()
            if source == 'nexus':
                await self.speak(result)
            else:
                await self.ws.journal(result)
            return

        # ── 5f. Runway ───────────────────────────────────────────────────────
        if _RUNWAY_RE.search(tl):
            import webbrowser
            webbrowser.open('https://app.runwayml.com')
            result = '✅ Runway ML ouvert dans le navigateur'
            if source == 'nexus':
                await self.speak(result)
            else:
                await self.ws.journal(result)
            return

        # ── 5g. Codex CLI ────────────────────────────────────────────────────
        if _CODEX_RE.search(tl):
            import subprocess as _sp
            try:
                _sp.Popen(['wt.exe', '-d', str(Path.home() / 'OneDrive' / 'Bureau' / 'ibrahim' / 'ibrahim'), 'cmd', '/k', 'codex'])
                result = '✅ Codex lancé dans Windows Terminal'
            except FileNotFoundError:
                try:
                    _sp.Popen(['cmd.exe', '/k', 'codex'])
                    result = '✅ Codex lancé (cmd)'
                except Exception as e:
                    result = f'❌ Codex introuvable — installe via: npm install -g @openai/codex\nErreur: {e}'
            if source == 'nexus':
                await self.speak(result)
            else:
                await self.ws.journal(result)
            return

        # ── 5h. Installer d'applications ─────────────────────────────────────
        if _INSTALL_RE.search(tl):
            m_inst = _INSTALL_RE.search(t)
            app_name = m_inst.group(2).strip() if m_inst else t
            await self.gui_send({'type': 'thinking', 'active': True})
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, self.installer.install, app_name)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result)
            else:
                await self.ws.journal(result)
            await self.journal(f'📦 Install: {app_name}')
            return

        # ── 5i. Git Manager ───────────────────────────────────────────────────
        if _GIT_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            loop = asyncio.get_running_loop()
            git_result = await loop.run_in_executor(None, self.git_mgr.try_handle, t)
            await self.gui_send({'type': 'thinking', 'active': False})
            if git_result:
                if source == 'nexus':
                    await self.speak(git_result[:400])
                else:
                    await self.ws.journal(git_result)
                await self.journal(f'🔧 Git: {git_result[:60]}')
                return

        # ── 5j. Network Analyst ───────────────────────────────────────────────
        if _NETWORK_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.agents.route_and_run(t, force_agent='network_analyst')
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result.response[:400])
            else:
                await self.ws.journal(result.response)
            await self.journal('🌐 Analyse réseau concurrence')
            return

        # ── 5k. Code Reviewer ────────────────────────────────────────────────
        if _CODE_REVIEW_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.agents.route_and_run(t, force_agent='code_reviewer')
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result.response[:400])
            else:
                await self.ws.journal(result.response)
            await self.journal('🔍 Code review')
            return

        # ── 5l. Video Creator Pipeline ───────────────────────────────────────
        if _VIDEO_PIPE_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.agents.route_and_run(t, force_agent='video_creator')
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result.response[:400])
            else:
                await self.ws.journal(result.response)
            await self.gui_send({'type': 'widget', 'widget': 'agent', 'data': {'agent': 'video_creator', 'result': result.response[:200]}})
            await self.journal('🎬 Pipeline vidéo')
            return

        # ── 6. PC control local ──────────────────────────────────────────────
        pc_result = self.pc.try_handle(t)
        if pc_result:
            # Screenshot → envoie sur Telegram si la commande vient de Telegram
            import os
            if isinstance(pc_result, str) and os.path.isfile(pc_result) and pc_result.endswith('.png'):
                fname = os.path.basename(pc_result)
                send_tg = 'telegram' in source or 'app' in source
                if send_tg:
                    ok = await self.ws.send_photo_telegram(pc_result, f'📸 Screenshot — {fname}')
                    reply = f'✅ Screenshot envoyé sur Telegram' if ok else f'✅ Screenshot: {fname} (envoi Telegram échoué)'
                else:
                    reply = f'✅ Screenshot: {fname}'
                if source == 'nexus':
                    await self.speak(reply)
                else:
                    await self.ws.journal(reply)
                await self.journal(f'📸 {reply}')
            else:
                if source == 'nexus':
                    await self.speak(pc_result)
                await self.journal(f'🖥️ {pc_result}')
            return

        # ── 7. Claude Code ───────────────────────────────────────────────────
        if _CLAUDE_RE.search(tl):
            # Extract folder from "ouvre claude code dans <folder>"
            after_verb = re.sub(_CLAUDE_RE, '', t, flags=re.I).strip()
            folder_match = _CLAUDE_FOLDER_RE.search(after_verb)
            cwd = None
            if folder_match:
                folder_hint = folder_match.group(2).strip().lower()
                from modules.pc_agent import _resolve
                resolved = _resolve(folder_hint)
                if resolved.exists():
                    cwd = str(resolved)
            await self.gui_send({'type': 'thinking', 'active': True})
            result = await self.claude.launch(auto_accept=True, cwd=cwd) if cwd else await self.claude.launch(auto_accept=True)
            await self.gui_send({'type': 'thinking', 'active': False})
            await self._reply(result, source)
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

        # ── 7b. TikTok ───────────────────────────────────────────────────────────
        if _TIKTOK_RE.search(tl):
            await self.gui_send({'type': 'thinking', 'active': True})
            keyword = re.sub(_TIKTOK_RE, '', t).strip() or None
            result = await self.tiktok.analyze(keyword)
            await self.gui_send({'type': 'thinking', 'active': False})
            if source == 'nexus':
                await self.speak(result[:400])
            await self.gui_send({'type': 'widget', 'widget': 'tiktok', 'data': {'result': result[:180]}})
            await self.journal('📱 Analyse TikTok')
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

        # ── 9. PC Agent (fallback — Claude AI local avec outils PC) ─────────────
        await self.gui_send({'type': 'thinking', 'active': True})
        if self.pc_agent.available:
            response = await self.pc_agent.run(t)
        else:
            response = await self.ws.send_to_dzaryx(t, source)
        await self.gui_send({'type': 'thinking', 'active': False})
        if response:
            await self._reply(response, source)

    # ── CapCut launcher ──────────────────────────────────────────────────────
    def _launch_capcut(self) -> str:
        import subprocess, glob as _glob
        paths = [
            str(Path.home() / 'AppData' / 'Local' / 'CapCut' / 'Apps' / 'CapCut.exe'),
            r'C:\Program Files\CapCut\CapCut.exe',
            r'C:\Program Files (x86)\CapCut\CapCut.exe',
        ]
        # Also search via glob for versioned install folders
        pattern = str(Path.home() / 'AppData' / 'Local' / 'CapCut' / 'Apps' / '*' / 'CapCut.exe')
        paths += _glob.glob(pattern)
        for p in paths:
            if Path(p).exists():
                subprocess.Popen([p])
                return '✅ CapCut lancé'
        # Fallback: try via shell (if in PATH or Start Menu)
        try:
            subprocess.Popen('start capcut', shell=True)
            return '✅ CapCut lancé'
        except Exception:
            pass
        return '❌ CapCut introuvable — installe-le depuis https://www.capcut.com'

    # ── Journal ──────────────────────────────────────────────────────────────
    async def journal(self, message: str) -> None:
        entry = {'ts': datetime.now().strftime('%H:%M:%S'), 'text': message}
        self._journal_history.append(entry)
        if len(self._journal_history) > 30:
            self._journal_history.pop(0)
        await self.gui_send({
            'type': 'journal', 'text': message,
            'history': self._journal_history[-20:],
        })
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
                            r = self.vision.stop_all_live()
                        else:
                            r = self.vision.start_live_both()
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
