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
import subprocess
import tempfile
import time
import wave
from pathlib import Path

import aiohttp
from pyrogram import Client, filters as pfilters
from pyrogram.types import Message
from pytgcalls import PyTgCalls, filters as cfilters
from pytgcalls.types.raw import AudioParameters
from pytgcalls.types import (
    CallConfig, ChatUpdate, Direction, MediaStream, RecordStream,
    StreamEnded, StreamFrames,
)

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
        self.buf = bytearray()
        self.voiced_s = 0.0
        self.silence_s = 0.0


active: dict[int, CallState] = {}


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
    if active.pop(update.chat_id, None):
        log.info('appel terminé avec %s', update.chat_id)


@calls.on_update(cfilters.stream_end())
async def on_end(_, update: StreamEnded) -> None:
    st = active.get(update.chat_id)
    log.info('fin de flux %s %s', update.stream_type, update.device)
    if st:
        st.speaking_until = min(st.speaking_until, time.monotonic() + 0.3)


async def start_call(actor: str, user_id: int) -> None:
    if user_id in active:
        return
    active[user_id] = CallState(actor)
    try:
        # answer = phrase d'accueil (motif de l'appel en attente, sinon "je t'écoute") + retire l'attente
        ans = await api('/api/call/answer', {}, actor)
        log.info('appel %s → %r', actor, ans.get('text'))
        await say(user_id, ans.get('audio'), first=True)
    except Exception as e:
        log.error('appel %s impossible: %s', actor, e)
        active.pop(user_id, None)
        try:
            await calls.leave_call(user_id)
        except Exception:
            pass


async def poll_pending() -> None:
    while True:
        for actor, uid in actor_peer.items():
            if uid in active:
                continue
            try:
                res = await api('/api/call/pending', {}, actor, 15)
                if res.get('call'):
                    log.info('appel en attente pour %s → je compose', actor)
                    asyncio.create_task(start_call(actor, uid))
            except Exception as e:
                log.warning('pending %s: %s', actor, e)
        await asyncio.sleep(POLL_S)


# ── Messages privés ──────────────────────────────────────────────────────────

@app.on_message(pfilters.private & pfilters.incoming)
async def on_message(_, msg: Message) -> None:
    uid = msg.from_user.id if msg.from_user else 0
    actor = peer_actor.get(uid)
    if actor is None:
        log.info('message de %s (@%s) ignoré — ajoute son id dans .env', uid,
                 msg.from_user.username if msg.from_user else '?')
        return
    try:
        if msg.voice or msg.audio:
            path = await msg.download(file_name=tempfile.mktemp(prefix='dzin_', suffix='.ogg'))
            b64 = base64.b64encode(Path(path).read_bytes()).decode()
            os.unlink(path)
            tr = await api('/api/transcribe', {'audio': b64, 'mimeType': 'audio/ogg'}, actor, 40)
            text = (tr.get('text') or '').strip()
            if not text:
                await msg.reply_text("Je n'ai pas bien entendu, tu peux répéter ?")
                return
            await app.send_chat_action(uid, 'record_audio')
            out = await api('/api/call/turn', {'message': text}, actor)
            if out.get('audio'):
                mp3 = save_mp3(out['audio'])
                ogg = mp3[:-4] + '.ogg'
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', ogg], check=True)
                await msg.reply_voice(ogg)
                os.unlink(mp3); os.unlink(ogg)
            else:
                await msg.reply_text(out.get('text') or '…')
        elif msg.text:
            await app.send_chat_action(uid, 'typing')
            out = await api('/api/call/turn', {'message': msg.text, 'textOnly': True}, actor)
            await msg.reply_text(out.get('text') or '…')
    except Exception as e:
        log.error('message échoué: %s', e)
        await msg.reply_text('Petit souci technique, réessaie dans un instant.')


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
    asyncio.create_task(poll_pending())
    await asyncio.Event().wait()


if __name__ == '__main__':
    app.run(main())
