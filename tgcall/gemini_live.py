"""Secours GRATUIT de la voix temps réel : Gemini Live (parole ↔ parole, voix native Google).

Utilisé quand OpenAI Realtime n'a plus de crédit (19/10). `GeminiLiveWS` imite la websocket OpenAI vue par
RealtimeCall : on lui envoie des événements OpenAI (session.update, input_audio_buffer.append, response.create,
conversation.item.create…) et elle rend des événements OpenAI (response.output_audio.delta, transcriptions,
appels d'outils…). Ainsi tout le reste de l'appel (outils, caméra, interruption, mémoire) reste identique.
"""
import asyncio
import base64
import json
import re
import logging
import time
from array import array

import aiohttp

log = logging.getLogger('dzaryx-tg')

URL = ('wss://generativelanguage.googleapis.com/ws/'
       'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={key}')


def to16k(pcm24k: bytes) -> bytes:
    """24 kHz → 16 kHz (3 échantillons → 2), sans audioop (retiré de Python 3.13, PC de Kouider)."""
    s = array('h', pcm24k[:len(pcm24k) // 6 * 6])
    out = array('h', bytes(len(s) // 3 * 4))
    out[0::2] = s[0::3]
    out[1::2] = array('h', ((a + b) // 2 for a, b in zip(s[1::3], s[2::3])))
    return out.tobytes()


NOTE = '[Note interne, ne la lis pas à voix haute] '
STALL_S = 4.0   # il a parlé (transcrit) mais Gemini ne répond pas depuis 4 s → on le relance (appel muet du 20/10 6h40)


class _Msg:
    """Message au format aiohttp (type + data JSON), comme ceux de la websocket OpenAI."""
    def __init__(self, ev: dict | None):
        self.type = aiohttp.WSMsgType.TEXT if ev is not None else aiohttp.WSMsgType.CLOSED
        self.data = json.dumps(ev) if ev is not None else ''


# Bruits transcrits par Gemini (« <noise> », souffle, mots d'une autre langue) : ce n'est pas Kouider qui parle.
NOISE_RULE = ("\n\nAPPEL TÉLÉPHONIQUE — BRUITS : un bruit, un souffle, des mots sans sens ou dans une autre langue que le "
              "français ou l'arabe (ex. persan, chiffres isolés) ne sont PAS une demande de Kouider : ignore-les, ne lance "
              "aucun outil, n'écris jamais « CONFIRMÉ » pour ça. S'il y a un doute, demande simplement « tu peux répéter ? ». "
              "Quand il dit juste « allô » au décroché, continue ta phrase sans recommencer.")


def clean_heard(t: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]{1,20}>', ' ', t or '')).strip()


def meaningful(t: str) -> bool:
    return len(re.findall(r'[A-Za-zÀ-ÿ\u0621-\u064A]', t)) >= 2


def speaks(t: str) -> bool:
    """Assez pour couper Dzaryx : au moins 2 mots ou 6 lettres (pas un « allô » ni un bruit)."""
    words = [w for w in t.split() if re.search(r'[A-Za-zÀ-ÿ\u0621-\u064A]{2}', w)]
    return len(words) >= 2 or len(re.findall(r'[A-Za-zÀ-ÿ\u0621-\u064A]', t)) >= 6


class GeminiLiveWS:
    def __init__(self, ws: aiohttp.ClientWebSocketResponse):
        self.ws = ws
        self.queue: asyncio.Queue[dict | None] = asyncio.Queue()
        self.tool_names: dict[str, str] = {}   # id d'appel d'outil → nom (Gemini veut le nom dans la réponse)
        self.pending_tools = 0                 # après une réponse d'outil, Gemini reprend tout seul la parole
        self.in_text = ''                      # transcription de Kouider en cours
        self.out_text = ''                     # transcription de Dzaryx en cours
        self.responding = False
        self.closing = False
        self.barged = False                    # « il parle » déjà signalé pour cette phrase
        self.heard_at = 0.0                    # dernier morceau de sa phrase transcrit
        self.close_reason = ''
        self.reader = asyncio.create_task(self._read())
        self.watchdog = asyncio.create_task(self._watch())

    @classmethod
    async def connect(cls, http: aiohttp.ClientSession, res: dict) -> 'GeminiLiveWS':
        ws = await http.ws_connect(URL.format(key=res['key']), heartbeat=20, max_msg_size=0)
        gen = {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': res.get('voice') or 'Charon'}},
                             'languageCode': 'fr-FR'},
        }
        if '2.5' in res['model']:   # sans « réflexion » : ~1 s de moins avant chaque réponse (testé 20/10 : 3,7 s → 2 s)
            gen['thinkingConfig'] = {'thinkingBudget': 0}
        setup = {
            'model': res['model'],
            'generationConfig': gen,
            'systemInstruction': {'parts': [{'text': (res.get('instructions') or '') + NOISE_RULE}]},
            'tools': [{'functionDeclarations': res.get('tools') or []}],
            # 25/10 : en HIGH, un souffle, un « allô » ou l'écho de sa propre voix coupait Dzaryx en pleine phrase
            'realtimeInputConfig': {'automaticActivityDetection': {
                'startOfSpeechSensitivity': 'START_SENSITIVITY_LOW', 'endOfSpeechSensitivity': 'END_SENSITIVITY_HIGH',
                'prefixPaddingMs': 300, 'silenceDurationMs': 700}},
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
        self.watchdog.cancel()
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
            pcm = to16k(base64.b64decode(ev['audio']))
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
        heard = clean_heard(self.in_text)
        noisy = bool(re.search(r'<[^>]{1,20}>|[\u06F0-\u06F9]', self.in_text))   # « <noise> », chiffres persans = bruit mal transcrit
        if meaningful(heard) and (not noisy or speaks(heard)):   # un bruit (« <noise> », souffle) n'est pas une phrase de Kouider
            self._put({'type': 'input_audio_buffer.committed'})
            self._put({'type': 'conversation.item.input_audio_transcription.completed', 'transcript': heard})
        self.in_text = ''
        self.barged = False

    async def _read(self) -> None:
        try:
            while True:
                msg = await self.ws.receive()
                if msg.type not in (aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.BINARY):
                    if msg.type == aiohttp.WSMsgType.CLOSE:
                        self.close_reason = str(msg.extra or '')[:200]
                    break
                ev = json.loads(msg.data)
                sc = ev.get('serverContent')
                if sc:
                    if sc.get('inputTranscription', {}).get('text'):
                        self.in_text += sc['inputTranscription']['text']
                        self.heard_at = time.monotonic()
                        # Gemini ne signale qu'il parle (« interrupted ») que pendant qu'il génère ; or sa réponse est
                        # générée bien plus vite qu'elle n'est jouée → sans ça, Kouider ne pouvait pas couper Dzaryx
                        if not self.responding and not self.barged and speaks(clean_heard(self.in_text)):
                            self.barged = True
                            self._put({'type': 'input_audio_buffer.speech_started'})
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
                log.warning('Gemini Live fermé : %s %s', self.ws.close_code, self.close_reason)
            self.watchdog.cancel()   # session morte (reconnexion ou fin d'appel) : sinon relance en boucle à vide (20/10)
            self.queue.put_nowait(None)

    async def _watch(self) -> None:
        """Kouider a parlé (transcrit) mais Gemini ne répond pas (bruit de fond qui empêche de détecter la fin
        de sa phrase ?) → on lui dit de répondre, plutôt qu'un silence d'une minute."""
        while True:
            await asyncio.sleep(0.5)
            if (self.in_text.strip() and not self.responding and not self.pending_tools and not self.tool_names
                    and time.monotonic() - self.heard_at > STALL_S):
                log.warning('Gemini ne répond pas à %r → relance', self.in_text.strip()[:80])
                self.heard_at = time.monotonic() + 6   # une relance, pas une rafale
                await self._text(NOTE + 'Il a fini de parler : réponds-lui maintenant.', True)

    def _end_turn(self) -> None:
        if self.out_text.strip():
            self._put({'type': 'response.output_audio_transcript.done', 'transcript': self.out_text.strip()})
        self.out_text = ''
        if self.responding:
            self.responding = False
            self._put({'type': 'response.done'})
