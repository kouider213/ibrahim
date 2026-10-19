"""Voix temps réel de Nexus sur le PC (2026-10-14) — la même voix que les appels Telegram, par le micro du PC.

« Nexus » → la conversation s'ouvre : Kouider parle normalement, Dzaryx répond en ~1 s et se tait dès qu'on
lui coupe la parole (plus de « mot-clé → j'écoute → je réfléchis → je parle » à chaque phrase).

- Micro et haut-parleurs du PC ↔ OpenAI Realtime (PCM 24 kHz) ; la clé est temporaire, fournie par le backend
  (/api/call/realtime mode « pc », avec le jeton de l'agent PC) : la vraie clé reste sur Railway.
- Outils exécutés ICI, sur le PC : pc_action (n'importe quelle commande Nexus), look_screen, watch_screen
  (« regarde avec moi » : une image de l'écran accompagne chaque phrase de Kouider), end_conversation.
- Le reste passe par le vrai cerveau Dzaryx : ask_dzaryx → /api/call/turn, lectures rapides → /api/call/tool.
- Écho : sans casque, le micro entend les haut-parleurs. Pendant que Dzaryx parle, seul un son fort (Kouider
  qui lui coupe la parole) est transmis. NEXUS_HEADSET=1 (casque) désactive ce filtre.
- Fin : end_conversation, ou NEXUS_RT_IDLE_S secondes (défaut 40) sans que personne ne parle.
NEXUS_REALTIME=0 pour revenir à l'ancien mode (reconnaissance Google + voix ElevenLabs).
"""
import asyncio
import base64
import io
import json
import logging
import os
import queue
import re
import threading
import time
from array import array

import aiohttp

from modules.gemini_live import GeminiLiveWS

log = logging.getLogger('nexus.realtime')

RATE = 24000
CHUNK_S = 0.1
CHUNK_BYTES = int(RATE * CHUNK_S) * 2          # 100 ms mono 16 bits
IDLE_S = float(os.environ.get('NEXUS_RT_IDLE_S', '40'))
HEADSET = os.environ.get('NEXUS_HEADSET', '0') == '1'
BARGE_RMS = int(os.environ.get('NEXUS_BARGE_RMS', '1800'))   # volume minimum pour couper la parole sans casque
WATCH_EVERY_S = 2.0
DANGEROUS = re.compile(r'\b(éteins|eteins|arr[eê]te le pc|shutdown|red[ée]marre|reboot|veille|hiberne|supprime|efface|vide la corbeille|formate)\b', re.I)


def realtime_enabled() -> bool:
    if os.environ.get('NEXUS_REALTIME', '1') == '0':
        return False
    try:
        import sounddevice  # noqa: F401
        return True
    except Exception as e:      # pas installé, ou PortAudio absent
        log.info('voix temps réel indisponible (%s) → ancien mode', e)
        return False


def rms(pcm: bytes) -> int:
    a = array('h', pcm[: len(pcm) // 2 * 2])
    if not a:
        return 0
    return int((sum(x * x for x in a) / len(a)) ** 0.5)


def screenshot_jpeg_b64(max_w: int = 1280) -> str | None:
    """Écran principal → JPEG base64 (réduit pour rester lisible et léger)."""
    try:
        import mss
        from PIL import Image
        with mss.mss() as sct:
            shot = sct.grab(sct.monitors[1])
            img = Image.frombytes('RGB', shot.size, shot.rgb)
        if img.width > max_w:
            img = img.resize((max_w, int(img.height * max_w / img.width)))
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=70)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        log.warning('capture écran: %s', e)
        return None


class PCVoiceSession:
    def __init__(self, app, backend_url: str, token: str) -> None:
        self.app = app
        self.backend = backend_url.rstrip('/')
        self.token = token
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self.http: aiohttp.ClientSession | None = None
        self.mic: 'queue.Queue[bytes]' = queue.Queue()
        self.out = bytearray()
        self.out_lock = threading.Lock()   # self.out est vidé par le thread audio du haut-parleur
        self.started = time.monotonic()
        self.responding = False
        self.speaking_until = 0.0          # fin estimée de la voix de Dzaryx (filtre d'écho)
        self.last_activity = time.monotonic()
        self.watching = False
        self.watch_sent = 0.0
        self.closed = False
        self.lines: list[dict] = []

    # ── API backend (jeton de l'agent PC) ────────────────────────────────────
    async def api(self, path: str, body: dict, timeout: float) -> dict:
        assert self.http is not None
        async with self.http.post(f'{self.backend}{path}', json=body, timeout=aiohttp.ClientTimeout(total=timeout),
                                  headers={'Authorization': f'Bearer {self.token}'}) as r:
            data = await r.json(content_type=None)
            if r.status >= 400:
                raise RuntimeError(data.get('error') or f'HTTP {r.status}')
            return data

    async def _send(self, event: dict) -> None:
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps(event))

    # ── Déroulé ──────────────────────────────────────────────────────────────
    async def run(self, first_text: str = '') -> None:
        import sounddevice as sd
        self.http = aiohttp.ClientSession()
        try:
            try:   # Gemini Live d'abord (gratuit, même voix que les appels Telegram) ; en panne → OpenAI
                res = await self.api('/api/call/realtime-gemini', {'mode': 'pc'}, 20)
                self.ws = await GeminiLiveWS.connect(self.http, res)
                await self.ws.receive(timeout=8)   # session.created
            except Exception as e:
                log.warning('Gemini Live indisponible (%s) → OpenAI', str(e)[:160])
                res = await self.api('/api/call/realtime', {'mode': 'pc'}, 20)
                self.ws = await self.http.ws_connect(
                    f"wss://api.openai.com/v1/realtime?model={res.get('model', 'gpt-realtime')}",
                    headers={'Authorization': f"Bearer {res['key']}"}, heartbeat=20, max_msg_size=0)
            loop = asyncio.get_running_loop()

            def on_mic(indata, _frames, _t, status):     # thread PortAudio
                if status:
                    log.debug('micro: %s', status)
                self.mic.put(bytes(indata))

            def on_spk(outdata, frames, _t, _status):    # thread PortAudio
                n = frames * 2
                with self.out_lock:
                    chunk = bytes(self.out[:n])
                    del self.out[:n]
                outdata[:] = chunk + b'\x00' * (n - len(chunk))
                if chunk:
                    self.speaking_until = time.monotonic() + 0.35

            with sd.RawInputStream(samplerate=RATE, channels=1, dtype='int16', blocksize=int(RATE * CHUNK_S), callback=on_mic), \
                 sd.RawOutputStream(samplerate=RATE, channels=1, dtype='int16', blocksize=int(RATE * 0.02), callback=on_spk):
                await self.app.gui_send({'type': 'status', 'text': 'NEXUS EN CONVERSATION'})
                tasks = [asyncio.create_task(self._reader()), asyncio.create_task(self._sender())]
                if first_text:      # « Nexus, ouvre Spotify » : la commande dite avec le mot-clé part tout de suite
                    await self._send({'type': 'conversation.item.create', 'item': {
                        'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': first_text}]}})
                    await self._send({'type': 'response.create'})
                    self.lines.append({'role': 'user', 'text': first_text})
                else:
                    await self._send({'type': 'response.create', 'response': {
                        'instructions': 'Dis juste, naturellement : « Oui Kouider ? »'}})
                while not self.closed:
                    await asyncio.sleep(0.5)
                    idle = time.monotonic() - self.last_activity
                    if idle > IDLE_S and not self.responding and not self.out:
                        log.info('conversation terminée (silence %.0f s)', idle)
                        break
                    if self.ws.closed:
                        log.warning('voix temps réel déconnectée')
                        break
                # laisse finir la dernière phrase
                end = time.monotonic() + 8
                while self.out and time.monotonic() < end:
                    await asyncio.sleep(0.1)
                for t in tasks:
                    t.cancel()
        finally:
            self.closed = True
            if self.ws and not self.ws.closed:
                await self.ws.close()
            if self.http:
                if self.lines:
                    try:   # mémoire des appels : résumé + choses à faire, comme après un appel Telegram
                        await self.api('/api/call/summary', {'lines': self.lines, 'durationS': time.monotonic() - self.started}, 60)
                    except Exception as e:
                        log.debug('résumé conversation: %s', e)
                await self.http.close()
            await self.app.gui_send({'type': 'status', 'text': 'NEXUS VEILLE'})

    # ── Micro → OpenAI (avec filtre d'écho) ──────────────────────────────────
    async def _sender(self) -> None:
        buf = bytearray()
        while not self.closed:
            await asyncio.sleep(CHUNK_S)
            while not self.mic.empty():
                buf.extend(self.mic.get_nowait())
            if not buf:
                continue
            chunk = bytes(buf); buf.clear()
            if not HEADSET and time.monotonic() < self.speaking_until and rms(chunk) < BARGE_RMS:
                chunk = b'\x00' * len(chunk)   # Dzaryx parle : on n'envoie pas sa propre voix revenue par le micro
            await self._send({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(chunk).decode()})

    # ── Événements OpenAI ────────────────────────────────────────────────────
    async def _reader(self) -> None:
        assert self.ws is not None
        async for msg in self.ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                if msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                    break
                continue
            ev = json.loads(msg.data)
            t = ev.get('type', '')
            if t in ('response.output_audio.delta', 'response.audio.delta'):
                with self.out_lock:
                    self.out.extend(base64.b64decode(ev['delta']))
                self.last_activity = time.monotonic()
            elif t == 'response.created':
                self.responding = True
            elif t == 'response.done':
                self.responding = False
                self.last_activity = time.monotonic()
            elif t == 'input_audio_buffer.speech_started':
                self.last_activity = time.monotonic()
                with self.out_lock:
                    self.out.clear()          # Kouider coupe la parole → Dzaryx se tait tout de suite
                if self.watching and time.monotonic() - self.watch_sent > WATCH_EVERY_S:
                    asyncio.create_task(self._show_screen())
            elif t == 'conversation.item.input_audio_transcription.completed':
                said = (ev.get('transcript') or '').strip()
                if said:
                    log.info('Kouider: %r', said)
                    self.lines.append({'role': 'user', 'text': said})
                    self.app._push_chat('user', said)
            elif t in ('response.output_audio_transcript.done', 'response.audio_transcript.done'):
                said = (ev.get('transcript') or '').strip()
                if said:
                    self.lines.append({'role': 'dzaryx', 'text': said})
                    self.app._push_chat('nexus', said)
            elif t == 'response.function_call_arguments.done':
                asyncio.create_task(self._tool(ev))
            elif t == 'error':
                log.error('realtime: %s', ev.get('error'))

    async def _show_screen(self) -> bool:
        jpg = await asyncio.to_thread(screenshot_jpeg_b64)
        if not jpg:
            return False
        self.watch_sent = time.monotonic()
        await self._send({'type': 'conversation.item.create', 'item': {'type': 'message', 'role': 'user', 'content': [
            {'type': 'input_image', 'image_url': f'data:image/jpeg;base64,{jpg}'}]}})
        return True

    async def _tool(self, ev: dict) -> None:
        call_id, name = ev.get('call_id'), ev.get('name')
        try:
            args = json.loads(ev.get('arguments') or '{}')
        except json.JSONDecodeError:
            args = {}
        t0 = time.monotonic()
        follow_up = True
        try:
            if name == 'pc_action':
                cmd = str(args.get('command', '')).strip()
                if DANGEROUS.search(cmd) and args.get('confirmed') is not True:
                    result = 'Pas encore fait : relis-lui l\'action et attends son oui, puis rappelle pc_action avec confirmed:true.'
                else:
                    from modules.ws_client import run_captured
                    result = await run_captured(self.app, cmd, 25) or 'Fait.'
            elif name == 'look_screen':
                ok = await self._show_screen()
                result = 'Voici l\'écran (image juste avant). Décris ce que tu vois.' if ok else 'Capture d\'écran impossible.'
            elif name == 'watch_screen':
                self.watching = bool(args.get('on'))
                if self.watching:
                    await self._show_screen()
                result = ('Mode « regarde avec moi » activé : tu reçois l\'écran à chaque fois qu\'il parle.' if self.watching
                          else 'Mode « regarde avec moi » arrêté.')
            elif name == 'end_conversation':
                follow_up = False
                result = 'Conversation terminée.'
                asyncio.create_task(self._end_soon())
            elif name == 'ask_dzaryx':
                out = await self.api('/api/call/turn', {'message': args.get('request', ''), 'textOnly': True}, 90)
                result = out.get('text') or 'Pas de réponse.'
            else:   # lectures rapides et actions confirmées du backend (réservations, mails, rappels…)
                out = await self.api('/api/call/tool', {'name': name, 'input': args}, 30)
                result = out.get('text') or 'Rien trouvé.'
        except Exception as e:
            result = f'Erreur technique : {e}. Dis-lui que tu n\'y arrives pas pour le moment.'
        log.info('%s (%.1fs) → %r', name, time.monotonic() - t0, str(result)[:120])
        await self._send({'type': 'conversation.item.create', 'item': {
            'type': 'function_call_output', 'call_id': call_id, 'output': str(result)[:6000]}})
        if follow_up:
            await self._send({'type': 'response.create'})

    async def _end_soon(self) -> None:
        await asyncio.sleep(0.5)
        end = time.monotonic() + 10
        while (self.responding or self.out) and time.monotonic() < end:
            await asyncio.sleep(0.1)
        self.closed = True
