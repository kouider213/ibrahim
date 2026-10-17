"""Dzaryx sur Telegram — vrais appels vocaux + messages, via un compte Telegram (userbot).

- Appel sortant : dès qu'un appel est en attente côté backend (/api/call/pending, ex. outil call_me),
  Dzaryx appelle Kouider/Houari sur Telegram, dit sa phrase d'accueil puis converse.
- Appel entrant : Kouider/Houari appelle le compte Dzaryx → il décroche et converse.
- Messages privés : texte → réponse texte ; vocal → réponse vocale.

Conversation : on enregistre la voix reçue (PCM 16 kHz), détection de fin de phrase par énergie,
puis /api/transcribe → /api/call/turn (cerveau Dzaryx, synchrone) → mp3 rejoué dans l'appel.
"""
import asyncio
import audioop
import base64
import io
import json
import logging
import os
import random
import re
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import aiohttp
from pyrogram import Client, enums, filters as pfilters, raw
from pyrogram.types import Message
from pytgcalls import PyTgCalls, filters as cfilters
from pytgcalls.types.raw import AudioParameters
from pytgcalls.types import (
    CallConfig, ChatUpdate, Device, Direction, ExternalMedia, MediaStream, RecordStream,
    StreamEnded, StreamFrames,
)

from ntgcalls import VideoRotation
from realtime import IN_RATE, OUT_RATE, RealtimeCall, speak
import speaker

HERE = Path(__file__).parent


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(HERE / '.env')

API_ID = int(os.environ['TG_API_ID'])
API_HASH = os.environ['TG_API_HASH']
BACKEND = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app').rstrip('/')
TOKEN = os.environ['ACCESS_TOKEN']
# actor → identifiant Telegram (id numérique ou @username)
PEERS = {a: os.environ[f'{a.upper()}_TG'] for a in ('kouider', 'houari') if os.environ.get(f'{a.upper()}_TG')}
POLL_S = float(os.environ.get('POLL_S', '4'))
RETRY_S = float(os.environ.get('RETRY_S', '600'))   # appel manqué → 2e essai 10 min plus tard (une seule fois)
RETRY_TAG = "tu n'avais pas décroché"
# Voix temps réel (OpenAI Realtime) : discussion naturelle. 0 → ancienne chaîne (transcription → Dzaryx → voix).
REALTIME = os.environ.get('REALTIME', '1') == '1'

SAMPLE_RATE = 16000
SPEECH_RMS = int(os.environ.get('SPEECH_RMS', '600'))   # seuil de voix (PCM 16 bits)
END_SILENCE_S = float(os.environ.get('END_SILENCE_S', '1.1'))  # silence qui termine une phrase (0.7 coupait Kouider en pleine phrase)
MIN_SPEECH_S = 0.35
MAX_UTTERANCE_S = 30

logging.basicConfig(level=logging.INFO, format='%(asctime)s [tg] %(message)s')
log = logging.getLogger('dzaryx-tg')
logging.getLogger('pyrogram').setLevel(logging.WARNING)

app = Client('dzaryx', api_id=API_ID, api_hash=API_HASH, workdir=str(HERE))
calls = PyTgCalls(app)
http: aiohttp.ClientSession | None = None

# user_id → actor, résolu au démarrage
peer_actor: dict[int, str] = {}
actor_peer: dict[str, int] = {}


class CallState:
    def __init__(self, actor: str):
        self.actor = actor
        self.speaking_until = 0.0     # Dzaryx parle → on n'écoute pas (pas d'écho)
        self.busy = False             # un tour est en cours de traitement
        self.task: asyncio.Task | None = None
        self.turn_pcm = b''           # voix du tour en cours (si Kouider continue sa phrase → on fusionne)
        self.answered = False         # Dzaryx a commencé à répondre (au-delà du « Mmh »)
        self.rt: RealtimeCall | None = None   # voix temps réel (sinon ancienne chaîne)
        self.outgoing = False         # c'est Dzaryx qui appelle (motif en attente)
        self.buf = bytearray()
        self.voiced_s = 0.0
        self.silence_s = 0.0


active: dict[int, CallState] = {}
last_call: dict[int, float] = {}   # user_id → monotonic du dernier appel (entrant ou sortant)
ROTATION = {VideoRotation.VIDEO_ROTATION_0: 0, VideoRotation.VIDEO_ROTATION_90: 90,
            VideoRotation.VIDEO_ROTATION_180: 180, VideoRotation.VIDEO_ROTATION_270: 270}


# ── Backend ──────────────────────────────────────────────────────────────────

async def api(path: str, body: dict, actor: str, timeout: float = 90) -> dict:
    assert http is not None
    async with http.post(
        f'{BACKEND}{path}', json={**body, 'actor': actor},
        headers={'Authorization': f'Bearer {TOKEN}'},
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as r:
        if r.status >= 400:
            raise RuntimeError(f'{path} HTTP {r.status}: {(await r.text())[:200]}')
        return await r.json()


async def api_stream(path: str, body: dict, actor: str, timeout: float = 90):
    """NDJSON : rend chaque ligne dès qu'elle arrive (1re phrase de Dzaryx avant la suite)."""
    assert http is not None
    async with http.post(
        f'{BACKEND}{path}', json={**body, 'actor': actor},
        headers={'Authorization': f'Bearer {TOKEN}'},
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as r:
        if r.status >= 400:
            raise RuntimeError(f'{path} HTTP {r.status}: {(await r.text())[:200]}')
        async for line in r.content:
            if line.strip():
                yield json.loads(line)


# Petits « Mmh… » joués dès la fin de ta phrase : on sait tout de suite qu'il a entendu,
# pendant qu'il transcrit / réfléchit / génère la voix. Générés une fois via /api/tts.
FILLERS = ['Mmh…', 'Je regarde.', 'Ok, attends.', 'Deux secondes.']
LONG_FILLERS = ['Je cherche, deux secondes.', 'Je regarde ça, un instant.']   # si la réponse tarde (> 3,5 s)
LONG_WAIT_S = 3.5
FILLER_DIR = HERE / 'fillers'


async def ensure_fillers() -> None:
    FILLER_DIR.mkdir(exist_ok=True)
    for i, text in enumerate(FILLERS + LONG_FILLERS):
        f = FILLER_DIR / (f'{i}.mp3' if i < len(FILLERS) else f'long{i - len(FILLERS)}.mp3')
        if f.exists():
            continue
        try:
            res = await api('/api/tts', {'text': text}, 'kouider', 30)
            f.write_bytes(base64.b64decode(res['audio']))
        except Exception as e:
            log.warning('filler %r: %s', text, e)


async def play_filler(user_id: int, long: bool = False) -> None:
    files = list(FILLER_DIR.glob('long*.mp3' if long else '[0-9]*.mp3'))
    if not files:
        return
    try:
        await calls.play(user_id, MediaStream(str(random.choice(files)), AudioParameters(48000, 1),
                                              video_flags=MediaStream.Flags.IGNORE))
    except Exception as e:
        log.warning('filler: %s', e)


def pcm_to_wav(pcm: bytes) -> bytes:
    out = io.BytesIO()
    with wave.open(out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)
    return out.getvalue()


def save_mp3(b64: str) -> str:
    f = tempfile.NamedTemporaryFile(prefix='dz_', suffix='.mp3', delete=False)
    f.write(base64.b64decode(b64))
    f.close()
    return f.name


def concat_mp3(paths: list[str]) -> str:
    """Plusieurs phrases → un seul fichier : un seul flux joué, donc pas de blanc entre les phrases."""
    if len(paths) == 1:
        return paths[0]
    out = tempfile.NamedTemporaryFile(prefix='dzc_', suffix='.wav', delete=False).name
    try:
        ins = [a for p in paths for a in ('-i', p)]
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex',
                        f'concat=n={len(paths)}:v=0:a=1', '-ar', '48000', '-ac', '1', out],
                       check=True, timeout=10)
        return out
    except Exception as e:
        log.warning('concat: %s', e)
        return paths[0]


def mp3_duration(path: str) -> float:
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                              '-of', 'csv=p=0', path], capture_output=True, text=True, timeout=10)
        return float(out.stdout.strip())
    except Exception:
        return 5.0


# ── Appel : parler / écouter ─────────────────────────────────────────────────

async def say(user_id: int, audio_b64: str | None, first: bool = False, path: str | None = None) -> None:
    st = active.get(user_id)
    if (not audio_b64 and not path) or st is None:
        return
    path = path or save_mp3(audio_b64)
    st.speaking_until = time.monotonic() + mp3_duration(path) + 0.4
    stream = MediaStream(path, AudioParameters(48000, 1), video_flags=MediaStream.Flags.IGNORE)
    if first:
        # Lance (ou décroche) l'appel avec la phrase d'accueil, puis on écoute.
        await calls.play(user_id, stream, CallConfig(timeout=45))
        st.speaking_until = time.monotonic() + mp3_duration(path) + 0.4
        await calls.record(user_id, RecordStream(True, AudioParameters(SAMPLE_RATE, 1)))
    else:
        log.info('lecture réponse (%.1fs)', mp3_duration(path))
        await calls.play(user_id, stream)
        log.info('lecture lancée')


async def handle_utterance(user_id: int, pcm: bytes) -> None:
    st = active.get(user_id)
    if st is None:
        return
    st.busy = True
    st.answered = False
    st.turn_pcm = pcm
    t0 = time.monotonic()
    try:
        await play_filler(user_id)
        wav_b64 = base64.b64encode(pcm_to_wav(pcm)).decode()
        tr = await api('/api/transcribe', {'audio': wav_b64, 'mimeType': 'audio/wav', 'provider': 'fast'},
                       st.actor, 40)
        text = (tr.get('text') or '').strip()
        log.info('%s a dit: %r', st.actor, text)
        if not text:
            return
        t1 = time.monotonic()

        # Les phrases arrivent en flux : la 1re est jouée tout de suite, les suivantes sont mises de côté
        # pendant qu'elle se joue, puis jouées ENSEMBLE (un seul fichier → pas de trou entre les phrases).
        queue: asyncio.Queue = asyncio.Queue()

        async def reader() -> None:
            try:
                async for part in api_stream('/api/call/turn', {'message': text, 'stream': True}, st.actor):
                    if part.get('audio'):
                        await queue.put(part)
            except Exception as e:
                log.error('réponse en flux: %s', e)
            finally:
                await queue.put(None)

        rtask = asyncio.create_task(reader())
        try:
            try:
                part = await asyncio.wait_for(queue.get(), LONG_WAIT_S)
            except asyncio.TimeoutError:
                await play_filler(user_id, long=True)       # « Je cherche, deux secondes. » : la ligne n'est pas morte
                part = await queue.get()
            if part is None:
                return
            log.info('Dzaryx (stt %.1fs, 1re phrase %.1fs): %r', t1 - t0, time.monotonic() - t1,
                     (part.get('text') or '')[:120])
            st.answered = True
            await say(user_id, part['audio'])
            done = False
            while not done:
                wait = st.speaking_until - 0.4 - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                if active.get(user_id) is not st:
                    return
                paths: list[str] = []
                nxt = await queue.get()                   # attend au moins la phrase suivante
                while nxt is not None:
                    paths.append(save_mp3(nxt['audio']))
                    if queue.empty():
                        break
                    nxt = queue.get_nowait()
                if nxt is None:
                    done = True
                if paths:
                    await say(user_id, None, path=concat_mp3(paths))
        finally:
            rtask.cancel()
    except asyncio.CancelledError:
        log.info('tour annulé : Kouider continuait sa phrase')
        raise
    except Exception as e:
        log.error('tour échoué: %s', e)
    finally:
        if st.task is asyncio.current_task():
            st.busy = False


def start_turn(user_id: int, pcm: bytes) -> None:
    st = active.get(user_id)
    if st is None:
        return
    st.task = asyncio.create_task(handle_utterance(user_id, pcm))


@calls.on_update(cfilters.stream_frame(Direction.INCOMING))
async def on_frames(_, update: StreamFrames) -> None:
    st = active.get(update.chat_id)
    if update.device == Device.CAMERA:       # appel vidéo : on garde la dernière image
        if st is not None and st.rt is not None and update.frames:
            fr = update.frames[-1]
            st.rt.feed_video(fr.frame, fr.info.width, fr.info.height, ROTATION.get(fr.info.rotation, 0))
        return
    if update.device == Device.SCREEN:
        return
    if st is not None and st.rt is not None:
        for fr in update.frames:
            st.rt.feed(fr.frame)
        return
    # On écoute aussi pendant que Dzaryx réfléchit (avant sa réponse) : si Kouider reprend sa phrase,
    # on annule le tour en cours et on repart avec toute la phrase. Pendant qu'il parle : pas d'écoute (écho).
    if st is None or (st.busy and st.answered) or time.monotonic() < st.speaking_until:
        if st is not None:
            st.buf.clear(); st.voiced_s = 0.0; st.silence_s = 0.0
        return
    for fr in update.frames:
        data = fr.frame
        dur = len(data) / (2 * SAMPLE_RATE)
        rms = audioop.rms(data, 2) if data else 0
        if rms >= SPEECH_RMS:
            st.voiced_s += dur
            st.silence_s = 0.0
            st.buf.extend(data)
        elif st.buf:
            st.silence_s += dur
            st.buf.extend(data)
        total = len(st.buf) / (2 * SAMPLE_RATE)
        if st.buf and (st.silence_s >= END_SILENCE_S or total >= MAX_UTTERANCE_S):
            pcm = bytes(st.buf)
            enough = st.voiced_s >= MIN_SPEECH_S
            st.buf.clear(); st.voiced_s = 0.0; st.silence_s = 0.0
            if enough:
                if st.busy and not st.answered and st.task and not st.task.done():
                    st.task.cancel()
                    pcm = st.turn_pcm + pcm
                    log.info('Kouider continue sa phrase → je fusionne et je relance')
                start_turn(update.chat_id, pcm)
            return


@calls.on_update(cfilters.chat_update(ChatUpdate.Status.INCOMING_CALL))
async def on_incoming(_, update: ChatUpdate) -> None:
    actor = peer_actor.get(update.chat_id)
    if actor is None:
        log.info('appel entrant ignoré de %s (inconnu)', update.chat_id)
        return
    await start_call(actor, update.chat_id)


@calls.on_update(cfilters.chat_update(ChatUpdate.Status.LEFT_CALL))
async def on_left(_, update: ChatUpdate) -> None:
    st = active.pop(update.chat_id, None)
    if st:
        if st.rt:
            await st.rt.close()
            asyncio.create_task(remember_call(update.chat_id, st.actor, st.rt))
        log.info('appel terminé avec %s', update.chat_id)


async def remember_call(user_id: int, actor: str, rt: RealtimeCall) -> None:
    """Mémoire des appels : résumé + choses à faire gardés par Dzaryx, et envoyés en message Telegram."""
    try:
        await asyncio.to_thread(rt.learn_at_end)
    except Exception as e:
        log.warning('apprentissage de la voix: %s', e)
    if not rt.lines:
        return
    try:
        res = await api('/api/call/summary', {'lines': rt.lines, 'durationS': time.monotonic() - rt.started}, actor, 60)
        mem = res.get('memory')
        if not mem:
            log.info('appel sans rien à retenir')
            return
        text = f"📞 Résumé de l'appel\n{mem['summary']}"
        if mem.get('todos'):
            text += '\n\nÀ faire :\n' + '\n'.join(f'• {t}' for t in mem['todos'])
        await app.send_message(user_id, text)
        log.info('appel retenu : %r', mem['summary'][:120])
    except Exception as e:
        log.error('mémoire de l\'appel: %s', e)


@calls.on_update(cfilters.stream_end())
async def on_end(_, update: StreamEnded) -> None:
    st = active.get(update.chat_id)
    log.info('fin de flux %s %s', update.stream_type, update.device)
    if st:
        st.speaking_until = min(st.speaking_until, time.monotonic() + 0.3)


async def start_call(actor: str, user_id: int) -> None:
    if user_id in active:
        return
    last_call[user_id] = time.monotonic()
    active[user_id] = CallState(actor)
    if REALTIME and await start_realtime(actor, user_id):
        return
    ans: dict | None = None
    try:
        # answer = phrase d'accueil (motif de l'appel en attente, sinon "je t'écoute") + retire l'attente
        ans = await api('/api/call/answer', {}, actor)
        log.info('appel %s → %r', actor, ans.get('text'))
        await say(user_id, ans.get('audio'), first=True)
    except Exception as e:
        log.error('appel %s impossible: %s', actor, e)
        active.pop(user_id, None)
        if ans and ans.get('incoming'):
            await missed_call(actor, user_id, ans.get('text') or '', e)
        try:
            await calls.leave_call(user_id)
        except Exception:
            pass


async def missed_call(actor: str, user_id: int, reason: str, err: Exception) -> None:
    """Kouider n'a pas décroché : il reçoit par écrit ce que Dzaryx voulait lui dire, puis un 2e essai."""
    retry = RETRY_TAG not in reason          # un seul nouvel essai, jamais en boucle
    try:
        why = 'occupé' if 'Busy' in type(err).__name__ else 'pas de réponse'
        later = (f'Je réessaie dans {int(RETRY_S // 60)} min, ou rappelle-moi quand tu veux.'
                 if retry else 'Rappelle-moi quand tu veux.')
        await app.send_message(user_id, f'📞 Appel manqué ({why}). Je voulais te dire :\n{reason}\n\n{later}')
        log.info('appel manqué → message envoyé')
    except Exception as e:
        log.error('message appel manqué: %s', e)
    try:   # gardé pour son prochain appel (« avant tout, j'ai des choses pour toi »), retiré si le 2e essai passe
        await api('/api/call/missed', {'reason': strip_greeting(reason)}, actor, 15)
    except Exception as e:
        log.warning('boîte des appels: %s', e)
    if retry:
        asyncio.create_task(retry_call(actor, user_id, reason))


def strip_greeting(greeting: str) -> str:
    """« Allô Kouider, c'est Dzaryx. Je te rappelle, tu n'avais pas décroché. X » → « X »."""
    s = re.sub(r"^Allô [^,]+, c'est Dzaryx\.\s*", '', greeting).strip()
    s = re.sub(r"^Je te rappelle, tu n'avais pas décroché\.\s*", '', s).strip()
    return s or greeting


async def retry_call(actor: str, user_id: int, greeting: str) -> None:
    """2e essai, sauf si on s'est parlé entre-temps (il a rappelé, ou un autre appel a eu lieu)."""
    missed_at = time.monotonic()
    await asyncio.sleep(RETRY_S)
    if user_id in active or last_call.get(user_id, 0) > missed_at:
        log.info("2e essai annulé : on s'est parlé entre-temps")
        return
    reason = strip_greeting(greeting)
    try:
        await api('/api/call/retry', {'reason': reason}, actor)
        log.info('2e essai lancé pour %s', actor)
    except Exception as e:
        log.error('2e essai: %s', e)


def call_tools(user_id: int) -> dict:
    """Outils de la voix temps réel exécutés ici : message écrit et raccrocher."""
    async def send_text_to_me(args: dict) -> tuple[str, bool]:
        text = (args.get('text') or '').strip()
        if not text:
            return 'Texte vide, rien envoyé.', True
        await app.send_message(user_id, text)
        return '✅ Envoyé sur Telegram.', True

    async def end_call(_: dict) -> tuple[str, bool]:
        asyncio.create_task(hang_up(user_id))
        return 'Raccroché.', False

    async def look(_: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if st and st.rt and await st.rt.show_camera(force=True):
            return 'Image de la caméra ajoutée : décris ce que tu vois.', True
        return 'Caméra coupée : aucune image. Demande-lui d\'activer la vidéo dans Telegram.', True

    async def pc_look(_: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Vue du PC indisponible.', True
        res = await api('/api/call/pc-look', {}, st.actor, 30)
        if not res.get('ok') or not res.get('image'):
            return f"Je ne vois pas l'écran du PC : {res.get('error') or 'capture impossible'}.", True
        await st.rt.show_image(res['image'])
        return "Image de l'écran du PC ajoutée : décris ce que tu vois (fenêtres, textes lisibles), sans inventer.", True

    async def whatsapp_link(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        actor = st.actor if st else 'kouider'
        res = await api('/api/call/tool', {'name': 'whatsapp_link', 'input': args}, actor, 20)
        if not res.get('ok') or not res.get('link'):
            return res.get('text') or 'Lien impossible.', True
        await app.send_message(user_id, f"💬 WhatsApp pour {res.get('client')} — appuie pour envoyer :\n\n"
                                        f"{args.get('message', '').strip()}\n\n👉 {res['link']}",
                               disable_web_page_preview=True)
        return f"✅ Lien WhatsApp pour {res.get('client')} envoyé à Kouider sur Telegram. Il n'a plus qu'à appuyer.", True

    async def send_contract(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        actor = st.actor if st else 'kouider'
        res = await api('/api/call/tool', {'name': 'send_contract', 'input': args}, actor, 30)
        if not res.get('ok') or not res.get('link'):
            return res.get('text') or 'Contrat impossible.', True
        await app.send_message(user_id, f"✍️ Contrat à signer pour {res.get('client')} — appuie pour l'envoyer sur WhatsApp :\n\n"
                                        f"{res.get('message', '')}\n\n👉 {res['link']}",
                               disable_web_page_preview=True)
        return f"✅ Lien WhatsApp du contrat pour {res.get('client')} envoyé à Kouider sur Telegram. Il n'a plus qu'à appuyer.", True

    async def interpreter(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Mode interprète indisponible.', True
        log.info('interprète %s (%s)', 'ON' if args.get('on') else 'OFF', args.get('language', ''))
        return await st.rt.set_interpreter(bool(args.get('on')), str(args.get('language') or '')), True

    async def call_back_later(args: dict) -> tuple[str, bool]:
        """Quelqu'un d'autre a décroché : on rappelle Kouider plus tard avec le VRAI motif (jamais dit à la personne)."""
        st = active.get(user_id)
        held = strip_greeting(st.rt.held_greeting) if st and st.rt and st.rt.held_greeting else ''
        who = (args.get('who_answered') or '').strip()
        reason = held or 'Je te rappelle comme prévu.'
        if who:
            reason = f"{who} m'a dit que tu serais là. {reason}"
        inp = {k: args[k] for k in ('delay_minutes', 'at_time', 'at_date') if args.get(k)}
        if not inp:
            return 'Il me faut une heure ou un délai (« vers 18h », « dans une heure »). Demande-le gentiment.', True
        res = await api('/api/call/tool', {'name': 'call_me', 'input': {**inp, 'reason': reason}}, st.actor if st else 'kouider', 20)
        return (res.get('text') or 'Rappel programmé.') + ' Dis simplement que tu rappelleras Kouider à ce moment-là, sans dire pourquoi.', True

    async def leave_message(args: dict) -> tuple[str, bool]:
        text = (args.get('text') or '').strip()
        if not text:
            return 'Message vide.', True
        frm = (args.get('from') or '').strip() or 'quelqu\'un'
        await app.send_message(user_id, f'📝 Message de {frm} (au téléphone avec Dzaryx) :\n{text}')
        return '✅ Message transmis à Kouider par écrit.', True

    async def learn_voice(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        return (await st.rt.learn_voice(str(args.get('name') or '')) if st and st.rt else 'Indisponible.'), True

    async def verify_code(args: dict) -> tuple[str, bool]:
        st = active.get(user_id)
        if not st or not st.rt:
            return 'Indisponible.', True
        out = await st.rt.verify_code(str(args.get('code') or ''))
        return out, not out.startswith('✅')   # code bon → la bascule relance elle-même la parole

    return {'send_text_to_me': send_text_to_me, 'end_call': end_call, 'look': look, 'pc_look': pc_look,
            'whatsapp_link': whatsapp_link, 'send_contract': send_contract, 'interpreter': interpreter,
            'call_back_later': call_back_later, 'leave_message': leave_message, 'learn_voice': learn_voice,
            'verify_code': verify_code}


async def hang_up(user_id: int) -> None:
    st = active.get(user_id)
    if st and st.rt:
        await st.rt.wait_silent()          # finir son « au revoir »
    st = active.pop(user_id, None)
    try:
        await calls.leave_call(user_id)
    except Exception as e:
        log.warning('raccrocher: %s', e)
    if st and st.rt:
        await st.rt.close()
        asyncio.create_task(remember_call(user_id, st.actor, st.rt))
    log.info('Dzaryx a raccroché')


async def start_realtime(actor: str, user_id: int) -> bool:
    """Appel en voix temps réel. False → on bascule sur l'ancienne chaîne."""
    st = active[user_id]
    assert http is not None
    rt = RealtimeCall(calls, http, api, user_id, actor, call_tools(user_id))
    try:
        # connexion OpenAI pendant que le téléphone sonne
        ans, _ = await asyncio.gather(api('/api/call/answer', {'noAudio': True}, actor), rt.connect())
    except Exception as e:
        log.error('voix temps réel indisponible (%s) → ancienne voix', e)
        await rt.close()
        return False
    st.rt = rt
    st.outgoing = bool(ans.get('incoming'))   # Dzaryx appelle (motif en attente) ≠ Kouider qui appelle
    greeting = ans.get('text') or 'Oui, je t\'écoute.'
    log.info('appel %s (temps réel) → %r', actor, greeting)
    try:
        await calls.play(user_id, MediaStream(ExternalMedia.AUDIO, AudioParameters(OUT_RATE, 1),
                                              video_flags=MediaStream.Flags.IGNORE), CallConfig(timeout=45))
        await calls.record(user_id, RecordStream(True, AudioParameters(IN_RATE, 1), camera=True))
        rt.start_audio()
        await rt.greet(greeting, st.outgoing)
    except Exception as e:
        log.error('appel %s impossible: %s', actor, e)
        await rt.close()
        active.pop(user_id, None)
        if st.outgoing:
            await missed_call(actor, user_id, greeting, e)
        try:
            await calls.leave_call(user_id)
        except Exception:
            pass
    return True


async def send_outbox_message(uid: int, m: dict) -> None:
    try:
        text = (m.get('text') or '')[:4000]
        if m.get('file'):      # pièce jointe d'un mail… : lien temporaire du backend → document Telegram
            async with aiohttp.ClientSession() as http:
                async with http.get(m['file']['url'], timeout=aiohttp.ClientTimeout(total=300)) as r:   # APK ~40 Mo
                    r.raise_for_status()
                    doc = io.BytesIO(await r.read())
            doc.name = (m['file'].get('name') or 'fichier')[:120]
            await app.send_document(uid, doc, caption=text[:1000] or None)
        elif m.get('image'):
            photo = io.BytesIO(base64.b64decode(m['image'])); photo.name = 'pc.jpg'
            await app.send_photo(uid, photo, caption=text[:1000] or None)
        elif text:
            await app.send_message(uid, text, disable_web_page_preview=True)
    except Exception as e:
        log.error('message backend → Telegram: %s', e)


async def poll_pending() -> None:
    while True:
        for actor, uid in actor_peer.items():
            try:
                res = await api('/api/call/pending', {}, actor, 15)
                for m in res.get('messages') or []:      # résultats arrivés après coup (mise à jour Nexus, écran du PC…), même en plein appel
                    asyncio.create_task(send_outbox_message(uid, m))
                if res.get('call') and uid not in active:
                    log.info('appel en attente pour %s → je compose', actor)
                    asyncio.create_task(start_call(actor, uid))
            except Exception as e:
                log.warning('pending %s: %s', actor, e)
        await asyncio.sleep(POLL_S)


class _ErrorCollector(logging.Handler):
    """Garde les erreurs du service pour les remonter au backend (auto-test quotidien)."""
    def __init__(self) -> None:
        super().__init__(logging.ERROR)
        self.items: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        if len(self.items) < 20:
            self.items.append(f'{record.name}: {record.getMessage()}'[:300])


_errors = _ErrorCollector()
logging.getLogger().addHandler(_errors)


async def heartbeat() -> None:
    """Signe de vie au backend toutes les minutes (alerte à Kouider s'il s'arrête) + erreurs récentes."""
    while True:
        try:
            errs, _errors.items = _errors.items, []
            await api('/api/call/heartbeat', {'connected': app.is_connected, 'errors': errs}, 'kouider', 15)
        except Exception as e:
            log.warning('heartbeat: %s', e)
        await asyncio.sleep(60)


# ── Messages privés ──────────────────────────────────────────────────────────

GUARD_CMD = re.compile(r'^v[ée]rif(?:ication)?\s+(?:de\s+la\s+)?voix\s+(on|off|oui|non)$', re.I)
PASSCODE_CMD = re.compile(r'^code secret\s*[:=]?\s*(\S.{1,40})$', re.I)


def learn_owner_voice(path: str) -> None:
    """Vocal Telegram de Kouider → sa voix s'apprend (reconnaissance au téléphone)."""
    if not speaker.available():
        return
    v = speaker.voiced(speaker.ogg_to_pcm(path, 16000), 16000)
    if len(v) / 32000 < speaker.MIN_ENROLL_S:
        return
    vec = speaker.embed(v, 16000)
    if vec is None:
        return
    if speaker.known() >= 3 and speaker.identify(vec)[2] < speaker.REJECT:   # pas sa voix (quelqu'un d'autre a parlé)
        log.info('vocal : voix différente de Kouider, pas apprise')
        return
    speaker.enroll(speaker.OWNER, vec)


@app.on_message(pfilters.private & pfilters.incoming)
async def on_message(_, msg: Message) -> None:
    uid = msg.from_user.id if msg.from_user else 0
    if app.me and uid == app.me.id:                        # ses propres messages (notes, résumés) : rien à faire
        return
    actor = peer_actor.get(uid)
    if actor is None:
        log.info('message de %s (@%s) ignoré — ajoute son id dans .env', uid,
                 msg.from_user.username if msg.from_user else '?')
        return
    try:
        if msg.location:                                     # position : traitée par on_raw_geo (voir plus bas)
            return
        if msg.document and ((msg.document.mime_type or '') == 'application/pdf' or (msg.document.file_name or '').lower().endswith('.pdf')):
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzpdf_', suffix='.pdf'))
            try:
                text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, timeout=30).stdout
            finally:
                os.unlink(path)
            name = msg.document.file_name or 'document.pdf'
            body = (f"[Document PDF reçu sur Telegram : « {name} ». Si c'est un billet d'avion / une carte d'embarquement, "
                    f"enregistre-le avec l'outil travel (add_trip).]\n{msg.caption or ''}\n\n{text.strip()[:9000] or '(PDF sans texte lisible)'}")
            out = await api('/api/call/turn', {'message': body, 'textOnly': True, 'channel': 'message'}, actor, 120)
            await msg.reply_text(out.get('text') or '…')
            return
        if msg.voice or msg.audio:
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzin_', suffix='.ogg'))
            b64 = base64.b64encode(Path(path).read_bytes()).decode()
            if msg.voice and actor == speaker.OWNER and not msg.forward_origin:   # son propre vocal (pas transféré)
                try:
                    await asyncio.to_thread(learn_owner_voice, path)
                except Exception as e:
                    log.warning('voix du vocal: %s', e)
            os.unlink(path)
            tr = await api('/api/transcribe', {'audio': b64, 'mimeType': 'audio/ogg'}, actor, 40)
            text = (tr.get('text') or '').strip()
            if not text:
                await msg.reply_text("Je n'ai pas bien entendu, tu peux répéter ?")
                return
            await app.send_chat_action(uid, enums.ChatAction.RECORD_AUDIO)
            out = await api('/api/call/turn', {'message': text, 'textOnly': True, 'channel': 'message'}, actor)
            reply = out.get('text') or '…'
            try:   # même voix que les appels
                await reply_voice_pcm(msg, await speak(http, api, re.sub(r'[*_#`>|]', '', reply)[:900], actor))
                return
            except Exception as e:
                log.warning('voix temps réel pour le vocal: %s → ancienne voix', e)
                out = await api('/api/call/turn', {'message': text, 'channel': 'message'}, actor)
            if out.get('audio'):
                mp3 = save_mp3(out['audio'])
                ogg = mp3[:-4] + '.ogg'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', ogg], check=True)
                await msg.reply_voice(ogg)
                os.unlink(mp3); os.unlink(ogg)
            else:
                await msg.reply_text(out.get('text') or '…')
        elif msg.photo or (msg.document and (msg.document.mime_type or '').startswith('image/')):
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzimg_', suffix='.jpg'))
            b64 = base64.b64encode(Path(path).read_bytes()).decode()
            os.unlink(path)
            mime = 'image/jpeg' if msg.photo else msg.document.mime_type
            out = await api('/api/call/turn', {'message': msg.caption or '', 'image': b64, 'imageMime': mime,
                                               'textOnly': True, 'channel': 'message'}, actor, 120)
            await msg.reply_text(out.get('text') or '…')
        elif msg.text and PASSCODE_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            speaker.set_passcode(PASSCODE_CMD.match(msg.text.strip()).group(1))
            try:
                await msg.delete()   # le code ne reste pas écrit dans la conversation
            except Exception:
                pass
            await app.send_message(uid, '🔐 Code secret enregistré (message effacé). Si un jour je ne reconnais pas ta voix '
                                        'au téléphone, je te le demanderai.')
        elif msg.text and GUARD_CMD.match(msg.text.strip()) and actor == speaker.OWNER:
            on = GUARD_CMD.match(msg.text.strip()).group(1).lower() in ('on', 'oui')
            speaker.set_guard(on)
            await app.send_message(uid, '🔐 Vérification de la voix ACTIVÉE : au téléphone je vérifie que c\'est toi avant de parler affaires.'
                                   if on else '🔓 Vérification de la voix désactivée : ton compte Telegram suffit, je te parle direct.')
        elif msg.text and VOICE_CMD.match(msg.text.strip()):
            await voice_command(msg, actor, VOICE_CMD.match(msg.text.strip()).group(1))
        elif msg.text:
            await app.send_chat_action(uid, enums.ChatAction.TYPING)
            out = await api('/api/call/turn', {'message': msg.text, 'textOnly': True, 'channel': 'message'}, actor)
            await msg.reply_text(out.get('text') or '…')
    except Exception as e:
        log.error('message échoué: %s', e)
        await msg.reply_text('Petit souci technique, réessaie dans un instant.')


@app.on_raw_update(group=-1)
async def on_raw_geo(client, update, users, chats) -> None:
    """Position (et position EN DIRECT) lue en brut : Pyrogram ne parse pas une position en direct
    « jusqu'à ce que je l'arrête » (période infinie) → msg.location vide. Telegram modifie le même
    message à chaque déplacement (UpdateEditMessage)."""
    if not isinstance(update, (raw.types.UpdateNewMessage, raw.types.UpdateEditMessage)):
        return
    m = update.message
    media = getattr(m, 'media', None)
    if getattr(m, 'out', True) or not isinstance(media, (raw.types.MessageMediaGeo, raw.types.MessageMediaGeoLive)):
        return
    if not isinstance(getattr(m, 'peer_id', None), raw.types.PeerUser):
        return
    geo = media.geo
    actor = peer_actor.get(m.peer_id.user_id)
    if actor is None or not isinstance(geo, raw.types.GeoPoint):
        return
    try:
        await api('/api/call/location', {'lat': geo.lat, 'lng': geo.long}, actor, 15)
        if isinstance(update, raw.types.UpdateNewMessage):
            live = isinstance(media, raw.types.MessageMediaGeoLive)
            log.info('position %s reçue de %s', 'en direct' if live else 'fixe', actor)
            await client.send_message(m.peer_id.user_id, '📍 Position en direct reçue. Je calcule tes trajets avec le trafic '
                                      'depuis là où tu es et je vois si tu es bien parti.' if live else
                                      '📍 Position reçue. Pour que je suive tes départs, partage-la « en direct » '
                                      '(jusqu\'à ce que tu l\'arrêtes).')
    except Exception as e:
        log.warning('position: %s', e)


async def reply_voice_pcm(msg: Message, pcm: bytes) -> None:
    ogg = tempfile.mktemp(prefix='dzv_', suffix='.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(IN_RATE), '-ac', '1', '-i', '-',
                    '-c:a', 'libopus', '-b:a', '48k', ogg], input=pcm, check=True, timeout=30)
    try:
        await msg.reply_voice(ogg)
    finally:
        os.unlink(ogg)


# « voix » → échantillons ; « voix 3 » / « voix marin » → la choisir (appels + vocaux)
VOICE_CMD = re.compile(r'^voix(?:\s+(\w+))?\s*$', re.I)
VOICE_SAMPLE = 'Salut Kouider, c\'est Dzaryx. Tu as deux nouvelles réservations aujourd\'hui, je te les lis ?'


async def voice_command(msg: Message, actor: str, choice: str | None) -> None:
    cur = await api('/api/call/voice', {}, actor, 15)
    voices: list[str] = cur['voices']
    if choice:
        v = voices[int(choice) - 1] if choice.isdigit() and 0 < int(choice) <= len(voices) else choice.lower()
        if v not in voices:
            await msg.reply_text(f'Je ne connais pas cette voix. Choix : 1 à {len(voices)}.')
            return
        await api('/api/call/voice', {'voice': v}, actor, 15)
        await msg.reply_text(f'C\'est noté : voix {voices.index(v) + 1} ({v}) pour les appels et les vocaux.')
        return
    await msg.reply_text(f'Voici {len(voices)} voix. Réponds « voix 2 » (par exemple) pour choisir. Actuelle : {voices.index(cur["voice"]) + 1}.')
    for i, v in enumerate(voices, 1):
        try:
            await app.send_chat_action(msg.chat.id, enums.ChatAction.RECORD_AUDIO)
            pcm = await speak(http, api, VOICE_SAMPLE, actor, voice=v)
            ogg = tempfile.mktemp(prefix='dzs_', suffix='.ogg')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(IN_RATE), '-ac', '1', '-i', '-',
                            '-c:a', 'libopus', '-b:a', '48k', ogg], input=pcm, check=True, timeout=30)
            await app.send_voice(msg.chat.id, ogg, caption=f'Voix {i}' + (' (actuelle)' if v == cur['voice'] else ''))
            os.unlink(ogg)
        except Exception as e:
            log.error('échantillon %s: %s', v, e)


# ── Boîte d'envoi : messages à Kouider déposés par d'autres scripts du VPS (récap de session…) ──
OUTBOX = HERE / 'outbox'


ALARM_MP3 = FILLER_DIR / 'alarm.mp3'
ALARM_TEXT = ("Allô Kouider, c'est Dzaryx. Alerte : le serveur principal ne répond plus depuis plusieurs minutes. "
              "Je ne peux plus répondre ni aux clients ni à toi. Les détails sont sur Telegram.")


async def alarm_call(uid: int, text: str) -> None:
    """Appel d'alarme SANS le backend (surveillance VPS : Railway en panne) : sonne, lit un message, raccroche.
    Voix générée si le backend répond, sinon le message préenregistré alarm.mp3."""
    if uid in active:
        log.info('alarme : déjà en appel, message écrit seulement')
        return
    path = str(ALARM_MP3)
    if text and text != ALARM_TEXT:
        try:
            path = save_mp3((await api('/api/tts', {'text': text}, 'kouider', 20))['audio'])
        except Exception as e:
            log.warning('alarme : voix indisponible (%s) → message préenregistré', e)
    if not Path(path).exists():
        log.error('alarme : aucun message audio')
        return
    last_call[uid] = time.monotonic()
    try:
        await calls.play(uid, MediaStream(path, AudioParameters(48000, 1), video_flags=MediaStream.Flags.IGNORE),
                         CallConfig(timeout=45))
        await asyncio.sleep(mp3_duration(path) * 2 + 2)     # le temps de décrocher puis d'écouter
        log.info('alarme : appel passé')
    except Exception as e:
        log.warning('alarme : pas décroché (%s)', e)
    finally:
        try:
            await calls.leave_call(uid)
        except Exception:
            pass


async def outbox_loop() -> None:
    """Toutes les 3 s : envoie à Kouider, dans l'ordre des noms, les fichiers tgcall/outbox/*.txt
    (avec la photo <même nom>.jpg si elle existe), puis les supprime. Un fichier *.call (texte à dire,
    vide = alarme serveur) le fait appeler en plus."""
    OUTBOX.mkdir(exist_ok=True)
    while True:
        await asyncio.sleep(3)
        uid = actor_peer.get('kouider')
        if not uid:
            continue
        for call in sorted(OUTBOX.glob('*.call')):
            text = call.read_text(encoding='utf-8').strip() or ALARM_TEXT
            call.unlink(missing_ok=True)
            log.info('outbox → appel d\'alarme : %s', call.name)
            asyncio.create_task(alarm_call(uid, text))
        for txt in sorted(OUTBOX.glob('*.txt')):
            img = txt.with_suffix('.jpg')
            # document joint : même nom, autre extension (pdf, docx, xlsx… — déposé par le PC cloud)
            docs = [f for f in OUTBOX.glob(txt.stem + '.*') if f.suffix.lower() not in ('.txt', '.jpg', '.call')]
            try:
                text = txt.read_text(encoding='utf-8').strip()
                if docs:
                    for doc in docs:
                        await app.send_document(uid, str(doc), caption=text[:1000],
                                                file_name=doc.name[len(txt.stem) + 1:] or doc.name)   # « <stamp>.<nom d'origine> »
                elif img.exists():
                    await app.send_photo(uid, str(img), caption=text[:1000])
                elif text:
                    await app.send_message(uid, text[:4000])
                log.info('outbox → kouider : %s', txt.name)
                await asyncio.sleep(1.5)
            except Exception as e:
                log.error('outbox %s: %s', txt.name, e)
            finally:
                txt.unlink(missing_ok=True)
                img.unlink(missing_ok=True)
                for doc in docs:
                    doc.unlink(missing_ok=True)


# ── Démarrage ────────────────────────────────────────────────────────────────

async def main() -> None:
    global http
    http = aiohttp.ClientSession()
    await calls.start()
    me = await app.get_me()
    log.info('connecté en tant que %s (@%s)', me.first_name, me.username)
    for actor, ref in PEERS.items():
        try:
            u = await app.get_users(int(ref) if ref.lstrip('-').isdigit() else ref)
            peer_actor[u.id] = actor
            actor_peer[actor] = u.id
            log.info('%s = %s (id %s)', actor, u.first_name, u.id)
        except Exception as e:
            log.error('%s introuvable (%s): %s — il doit d\'abord écrire au compte Dzaryx', actor, ref, e)
    await ensure_fillers()
    if not ALARM_MP3.exists():
        try:
            ALARM_MP3.write_bytes(base64.b64decode((await api('/api/tts', {'text': ALARM_TEXT}, 'kouider', 30))['audio']))
        except Exception as e:
            log.warning('message d\'alarme non généré: %s', e)
    asyncio.create_task(poll_pending())
    asyncio.create_task(heartbeat())
    asyncio.create_task(outbox_loop())
    await asyncio.Event().wait()


if __name__ == '__main__':
    app.run(main())
