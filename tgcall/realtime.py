"""Voix temps réel des appels Telegram : OpenAI Realtime (parole ↔ parole) branché sur l'appel.

- La voix de Kouider (PCM 24 kHz reçu de l'appel) part en continu vers OpenAI.
- OpenAI détecte la fin de phrase, répond en voix (~1 s) ; si Kouider parle par-dessus, il s'arrête.
- Pour toute info réelle, le modèle appelle l'outil ask_dzaryx → /api/call/turn (le vrai cerveau Dzaryx).
- La voix de Dzaryx est envoyée dans l'appel par tranches de 10 ms, au rythme réel, sans trou.
La clé OpenAI est temporaire (fournie par le backend, /api/call/realtime) : la vraie clé reste sur Railway.
"""
import asyncio
import audioop
import base64
import json
import logging
import time
from typing import Awaitable, Callable

import aiohttp
from pytgcalls import PyTgCalls
from pytgcalls.types import Device

log = logging.getLogger('dzaryx-tg')

IN_RATE = 24000                    # voix reçue de l'appel (RecordStream) et envoyée à OpenAI
OUT_RATE = 48000                   # voix jouée dans l'appel
FRAME_10MS = OUT_RATE // 100 * 2   # 960 octets = 10 ms mono 16 bits
SILENCE = b'\x00' * FRAME_10MS
SEND_EVERY_S = 0.1                 # voix de Kouider envoyée à OpenAI par paquets de 100 ms

ApiFn = Callable[[str, dict, str, float], Awaitable[dict]]
# Outils exécutés ici (pas au backend) : nom → fonction(args) → (résultat, relancer la parole ?)
LocalTool = Callable[[dict], Awaitable[tuple[str, bool]]]


class RealtimeCall:
    def __init__(self, calls: PyTgCalls, http: aiohttp.ClientSession, api: ApiFn, user_id: int, actor: str,
                 local_tools: dict[str, LocalTool] | None = None):
        self.calls, self.http, self.api = calls, http, api
        self.local_tools = local_tools or {}
        self.responding = False           # OpenAI est en train de produire une réponse
        self.user_id, self.actor = user_id, actor
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self.out = bytearray()            # voix de Dzaryx à jouer (48 kHz)
        self.inp = bytearray()            # voix de Kouider pas encore envoyée
        self.rate_state = None
        self.tasks: list[asyncio.Task] = []
        self.closed = False
        self.playing = False              # l'appel Telegram est établi → on peut envoyer des tranches
        self.lines: list[dict] = []       # transcription de l'appel (mémoire des appels, envoyée à la fin)
        self.started = time.monotonic()

    # ── Connexion ────────────────────────────────────────────────────────────
    async def connect(self) -> None:
        res = await self.api('/api/call/realtime', {}, self.actor, 20)
        self.ws = await self.http.ws_connect(
            f"wss://api.openai.com/v1/realtime?model={res.get('model', 'gpt-realtime')}",
            headers={'Authorization': f"Bearer {res['key']}"}, heartbeat=20, max_msg_size=0)
        self.tasks.append(asyncio.create_task(self._reader()))
        self.tasks.append(asyncio.create_task(self._sender()))
        log.info('voix temps réel connectée')

    def start_audio(self) -> None:
        """L'appel est décroché : on commence à jouer (au rythme réel)."""
        if not self.playing:
            self.playing = True
            self.tasks.append(asyncio.create_task(self._pacer()))

    async def close(self) -> None:
        self.closed = True
        for t in self.tasks:
            t.cancel()
        if self.ws and not self.ws.closed:
            await self.ws.close()

    async def _send(self, event: dict) -> None:
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps(event))

    async def greet(self, text: str) -> None:
        """Dzaryx parle en premier (motif de l'appel, ou « je t'écoute »)."""
        await self._send({'type': 'response.create', 'response': {
            'instructions': f'Commence l\'appel en disant, naturellement et presque mot pour mot : « {text} »'}})

    # ── Voix de Kouider → OpenAI ─────────────────────────────────────────────
    def feed(self, pcm24k: bytes) -> None:
        self.inp.extend(pcm24k)

    async def _sender(self) -> None:
        while not self.closed:
            await asyncio.sleep(SEND_EVERY_S)
            if self.inp:
                chunk = bytes(self.inp); self.inp.clear()
                await self._send({'type': 'input_audio_buffer.append', 'audio': base64.b64encode(chunk).decode()})

    # ── Voix de Dzaryx → appel (tranches de 10 ms au rythme réel) ────────────
    async def _pacer(self) -> None:
        nxt = time.monotonic()
        while not self.closed:
            nxt += 0.01
            if len(self.out) >= FRAME_10MS:
                frame = bytes(self.out[:FRAME_10MS]); del self.out[:FRAME_10MS]
            else:
                frame = SILENCE
            try:
                await self.calls.send_frame(self.user_id, Device.MICROPHONE, frame)
            except Exception as e:
                log.warning('send_frame: %s', e)
                return
            delay = nxt - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            elif delay < -0.2:          # retard accumulé (machine occupée) → on se recale
                nxt = time.monotonic()

    def _play(self, pcm24k: bytes) -> None:
        up, self.rate_state = audioop.ratecv(pcm24k, 2, 1, IN_RATE, OUT_RATE, self.rate_state)
        self.out.extend(up)

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
                self._play(base64.b64decode(ev['delta']))
            elif t == 'response.created':
                self.responding = True
            elif t == 'response.done':
                self.responding = False
            elif t == 'input_audio_buffer.speech_started':
                if self.out:
                    self.out.clear()          # Kouider parle par-dessus → Dzaryx se tait tout de suite
                    log.info('interrompu par %s', self.actor)
            elif t == 'conversation.item.input_audio_transcription.completed':
                said = (ev.get('transcript') or '').strip()
                log.info('%s a dit: %r', self.actor, said)
                if said:
                    self.lines.append({'role': 'user', 'text': said})
            elif t in ('response.output_audio_transcript.done', 'response.audio_transcript.done'):
                said = (ev.get('transcript') or '').strip()
                log.info('Dzaryx: %r', said[:200])
                if said:
                    self.lines.append({'role': 'dzaryx', 'text': said})
            elif t == 'response.function_call_arguments.done':
                asyncio.create_task(self._tool(ev))
            elif t == 'error':
                log.error('realtime: %s', ev.get('error'))
        if not self.closed:
            log.warning('voix temps réel déconnectée')

    async def _tool(self, ev: dict) -> None:
        call_id, name = ev.get('call_id'), ev.get('name')
        try:
            args = json.loads(ev.get('arguments') or '{}')
        except json.JSONDecodeError:
            args = {}
        t0 = time.monotonic()
        follow_up = True
        if name in self.local_tools:
            try:
                result, follow_up = await self.local_tools[name](args)
            except Exception as e:
                result = f'Échec : {e}'
        elif name == 'ask_dzaryx':
            try:
                out = await self.api('/api/call/turn', {'message': args.get('request', ''), 'textOnly': True}, self.actor, 60)
                result = out.get('text') or 'Pas de réponse.'
            except Exception as e:
                result = f'Erreur technique : {e}. Dis-lui que tu n\'arrives pas à vérifier pour le moment.'
        else:
            try:   # lecture rapide (réservations, mails, flotte…) sans le cerveau complet
                out = await self.api('/api/call/tool', {'name': name, 'input': args}, self.actor, 30)
                result = out.get('text') or 'Rien trouvé.'
            except Exception as e:
                result = f'Erreur technique : {e}. Essaie ask_dzaryx.'
        log.info('%s (%.1fs) %r → %r', name, time.monotonic() - t0, (args.get('request') or json.dumps(args, ensure_ascii=False))[:80], result[:120])
        await self._send({'type': 'conversation.item.create', 'item': {
            'type': 'function_call_output', 'call_id': call_id, 'output': result}})
        if follow_up:
            await self._send({'type': 'response.create'})

    async def wait_silent(self, max_s: float = 15) -> None:
        """Attend que Dzaryx ait fini de parler (réponse terminée + voix jouée)."""
        end = time.monotonic() + max_s
        await asyncio.sleep(0.3)
        while (self.responding or self.out) and time.monotonic() < end:
            await asyncio.sleep(0.1)
        await asyncio.sleep(0.4)


async def speak(http: aiohttp.ClientSession, api: ApiFn, text: str, actor: str, voice: str | None = None) -> bytes:
    """Fait dire `text` par la voix temps réel (même voix que les appels) → PCM 24 kHz mono 16 bits."""
    res = await api('/api/call/realtime', {}, actor, 20)
    pcm = bytearray()
    async with http.ws_connect(
            f"wss://api.openai.com/v1/realtime?model={res.get('model', 'gpt-realtime')}",
            headers={'Authorization': f"Bearer {res['key']}"}, max_msg_size=0) as ws:
        await ws.send_str(json.dumps({'type': 'session.update', 'session': {
            'type': 'realtime', 'tools': [],
            'instructions': 'Tu es une voix de lecture. Lis le texte fourni EXACTEMENT, mot pour mot, en français, '
                            'ton naturel et chaleureux, sans rien ajouter ni commenter.',
            'audio': {'input': {'turn_detection': None},
                      'output': {'voice': voice or res.get('voice') or 'cedar'}}}}))
        await ws.send_str(json.dumps({'type': 'response.create', 'response': {
            'output_modalities': ['audio'], 'conversation': 'none', 'input': [],
            'instructions': 'Prononce EXACTEMENT ce texte, mot pour mot, et RIEN d\'autre (pas d\'introduction, '
                            f'pas de « d\'accord », pas de commentaire) : « {text} »'}}))
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                break
            ev = json.loads(msg.data)
            t = ev.get('type', '')
            if t in ('response.output_audio.delta', 'response.audio.delta'):
                pcm.extend(base64.b64decode(ev['delta']))
            elif t == 'response.done':
                break
            elif t == 'error':
                raise RuntimeError(ev.get('error'))
    if not pcm:
        raise RuntimeError('aucun son reçu')
    return bytes(pcm)
