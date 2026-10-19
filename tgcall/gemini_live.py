"""Secours GRATUIT de la voix temps réel : Gemini Live (parole ↔ parole, voix native Google).

Utilisé quand OpenAI Realtime n'a plus de crédit (19/10). `GeminiLiveWS` imite la websocket OpenAI vue par
RealtimeCall : on lui envoie des événements OpenAI (session.update, input_audio_buffer.append, response.create,
conversation.item.create…) et elle rend des événements OpenAI (response.output_audio.delta, transcriptions,
appels d'outils…). Ainsi tout le reste de l'appel (outils, caméra, interruption, mémoire) reste identique.
"""
import asyncio
import audioop
import base64
import json
import logging

import aiohttp

log = logging.getLogger('dzaryx-tg')

URL = ('wss://generativelanguage.googleapis.com/ws/'
       'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={key}')
NOTE = '[Note interne, ne la lis pas à voix haute] '


class _Msg:
    """Message au format aiohttp (type + data JSON), comme ceux de la websocket OpenAI."""
    def __init__(self, ev: dict | None):
        self.type = aiohttp.WSMsgType.TEXT if ev is not None else aiohttp.WSMsgType.CLOSED
        self.data = json.dumps(ev) if ev is not None else ''


class GeminiLiveWS:
    def __init__(self, ws: aiohttp.ClientWebSocketResponse):
        self.ws = ws
        self.queue: asyncio.Queue[dict | None] = asyncio.Queue()
        self.rate_state = None
        self.tool_names: dict[str, str] = {}   # id d'appel d'outil → nom (Gemini veut le nom dans la réponse)
        self.pending_tools = 0                 # après une réponse d'outil, Gemini reprend tout seul la parole
        self.in_text = ''                      # transcription de Kouider en cours
        self.out_text = ''                     # transcription de Dzaryx en cours
        self.responding = False
        self.closing = False
        self.reader = asyncio.create_task(self._read())

    @classmethod
    async def connect(cls, http: aiohttp.ClientSession, res: dict) -> 'GeminiLiveWS':
        ws = await http.ws_connect(URL.format(key=res['key']), heartbeat=20, max_msg_size=0)
        setup = {
            'model': res['model'],
            'generationConfig': {
                'responseModalities': ['AUDIO'],
                'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': res.get('voice') or 'Charon'}},
                                 'languageCode': 'fr-FR'},
            },
            'systemInstruction': {'parts': [{'text': res.get('instructions') or ''}]},
            'tools': [{'functionDeclarations': res.get('tools') or []}],
            'realtimeInputConfig': {'automaticActivityDetection': {
                'startOfSpeechSensitivity': 'START_SENSITIVITY_HIGH', 'endOfSpeechSensitivity': 'END_SENSITIVITY_HIGH',
                'silenceDurationMs': 500}},
            'inputAudioTranscription': {},
            'outputAudioTranscription': {},
            'contextWindowCompression': {'slidingWindow': {}},   # appels de plus de 15 min
        }
        await ws.send_str(json.dumps({'setup': setup}))
        first = await ws.receive(timeout=10)
        if first.type != aiohttp.WSMsgType.TEXT and first.type != aiohttp.WSMsgType.BINARY:
            raise RuntimeError(f'Gemini Live fermé ({first.type}: {ws.close_code} {first.extra or ""})')
        ev = json.loads(first.data)
        if 'setupComplete' not in ev:
            raise RuntimeError(f'Gemini Live: {str(ev)[:200]}')
        self = cls(ws)
        self.queue.put_nowait({'type': 'session.created'})
        return self

    # ── interface websocket utilisée par RealtimeCall ────────────────────────
    @property
    def closed(self) -> bool:
        return self.ws.closed

    async def close(self) -> None:
        self.closing = True
        self.reader.cancel()
        await self.ws.close()

    async def receive(self, timeout: float | None = None) -> _Msg:
        return _Msg(await asyncio.wait_for(self.queue.get(), timeout))

    def __aiter__(self):
        return self

    async def __anext__(self) -> _Msg:
        ev = await self.queue.get()
        if ev is None:
            raise StopAsyncIteration
        return _Msg(ev)

    async def _g(self, msg: dict) -> None:
        if not self.ws.closed:
            await self.ws.send_str(json.dumps(msg))

    async def _text(self, text: str, turn_complete: bool) -> None:
        await self._g({'clientContent': {'turns': [{'role': 'user', 'parts': [{'text': text}]}], 'turnComplete': turn_complete}})

    # ── événements OpenAI → Gemini ───────────────────────────────────────────
    async def send_str(self, data: str) -> None:
        ev = json.loads(data)
        t = ev.get('type')
        if t == 'input_audio_buffer.append':   # 24 kHz → 16 kHz (format natif de Gemini Live)
            pcm, self.rate_state = audioop.ratecv(base64.b64decode(ev['audio']), 2, 1, 24000, 16000, self.rate_state)
            await self._g({'realtimeInput': {'audio': {'data': base64.b64encode(pcm).decode(), 'mimeType': 'audio/pcm;rate=16000'}}})
        elif t == 'session.update':            # la config est fixée au démarrage : les nouvelles consignes passent en note
            instr = (ev.get('session') or {}).get('instructions')
            if instr:
                await self._text(NOTE + 'Nouvelles consignes pour la suite de l\'appel, elles remplacent les précédentes :\n' + instr, False)
        elif t == 'conversation.item.create':
            item = ev.get('item') or {}
            if item.get('type') == 'function_call_output':
                cid = item.get('call_id')
                self.pending_tools = max(0, self.pending_tools - 1)
                await self._g({'toolResponse': {'functionResponses': [{
                    'id': cid, 'name': self.tool_names.pop(cid, ''), 'response': {'result': item.get('output', '')}}]}})
                return
            for c in item.get('content') or []:
                if c.get('type') == 'input_text':
                    await self._text((NOTE if item.get('role') == 'system' else '') + c['text'], False)
                elif c.get('type') == 'input_image':
                    b64 = c.get('image_url', '').split(',', 1)[-1]
                    await self._g({'realtimeInput': {'video': {'data': b64, 'mimeType': 'image/jpeg'}}})
        elif t == 'response.create':
            if self.pending_tools == 0 and not self.tool_names:   # après un outil, Gemini enchaîne tout seul
                instr = (ev.get('response') or {}).get('instructions')
                await self._text(NOTE + instr if instr else NOTE + 'À toi de parler maintenant.', True)

    # ── messages Gemini → événements OpenAI ──────────────────────────────────
    def _put(self, ev: dict) -> None:
        self.queue.put_nowait(ev)

    def _flush_input(self) -> None:
        if self.in_text.strip():
            self._put({'type': 'input_audio_buffer.committed'})
            self._put({'type': 'conversation.item.input_audio_transcription.completed', 'transcript': self.in_text.strip()})
        self.in_text = ''

    async def _read(self) -> None:
        try:
            async for msg in self.ws:
                if msg.type not in (aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.BINARY):
                    break
                ev = json.loads(msg.data)
                sc = ev.get('serverContent')
                if sc:
                    if sc.get('inputTranscription', {}).get('text'):
                        self.in_text += sc['inputTranscription']['text']
                    if sc.get('interrupted'):
                        self._flush_input()
                        self._put({'type': 'input_audio_buffer.speech_started'})
                        self._end_turn()
                    for part in (sc.get('modelTurn') or {}).get('parts') or []:
                        data = (part.get('inlineData') or {}).get('data')
                        if data:
                            if not self.responding:
                                self._flush_input()
                                self.responding = True
                                self._put({'type': 'response.created'})
                            self._put({'type': 'response.output_audio.delta', 'delta': data})   # PCM 24 kHz comme OpenAI
                    if sc.get('outputTranscription', {}).get('text'):
                        self.out_text += sc['outputTranscription']['text']
                    if sc.get('turnComplete') or sc.get('generationComplete'):
                        self._flush_input()
                        self._end_turn()
                for fc in (ev.get('toolCall') or {}).get('functionCalls') or []:
                    self._flush_input()
                    self.tool_names[fc['id']] = fc['name']
                    self.pending_tools += 1
                    self._put({'type': 'response.function_call_arguments.done', 'call_id': fc['id'], 'name': fc['name'],
                               'arguments': json.dumps(fc.get('args') or {}, ensure_ascii=False)})
                for cid in (ev.get('toolCallCancellation') or {}).get('ids') or []:
                    self.tool_names.pop(cid, None)
                    self.pending_tools = max(0, self.pending_tools - 1)
                if 'goAway' in ev:
                    log.warning('Gemini Live: fin de session annoncée (%s)', ev['goAway'])
        except Exception as e:
            log.warning('Gemini Live lecture: %s', e)
        finally:
            if not self.closing and self.ws.close_code and self.ws.close_code != 1000:
                log.warning('Gemini Live fermé : %s', self.ws.close_code)
            self.queue.put_nowait(None)

    def _end_turn(self) -> None:
        if self.out_text.strip():
            self._put({'type': 'response.output_audio_transcript.done', 'transcript': self.out_text.strip()})
        self.out_text = ''
        if self.responding:
            self.responding = False
            self._put({'type': 'response.done'})
