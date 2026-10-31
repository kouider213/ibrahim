"""
Cerveau GRATUIT pour le pilote de navigateur (31/10/2026 — « Dzaryx à 0 € ») : imite client.messages.create()
du SDK Anthropic mais parle à Gemini (endpoint compatible OpenAI, clés GEMINI_API_KEY + GEMINI_API_KEYS).
Avant : la surveillance Air Algérie finissait sur « Your credit balance is too low to access the Anthropic API ».

Les messages restent au format Anthropic (blocs text / tool_use / tool_result / image) : ce module les traduit
à chaque appel, et rend des blocs avec .type/.text/.id/.name/.input + .stop_reason comme le SDK.
Stdlib seulement (urllib) : tourne aussi sur le PC Windows de Kouider sans pip install.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request

log = logging.getLogger('nexus.free_llm')

URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
MODELS = [m.strip() for m in os.getenv('NEXUS_BROWSER_GEMINI_MODELS',
          'gemini-3.5-flash,gemini-3-flash-preview,gemini-flash-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite').split(',') if m.strip()]
SKIP_SIGNATURE = {'google': {'thought_signature': 'skip_thought_signature_validator'}}


def gemini_keys() -> list[str]:
    keys = [os.getenv('GEMINI_API_KEY', ''), *os.getenv('GEMINI_API_KEYS', '').split(',')]
    out: list[str] = []
    for k in keys:
        k = k.strip()
        if k and k not in out:
            out.append(k)
    return out


class Block:
    def __init__(self, type: str, text: str = '', id: str = '', name: str = '', input: dict | None = None, raw: dict | None = None):
        self.type, self.text, self.id, self.name, self.input, self.raw = type, text, id, name, input or {}, raw


class Resp:
    def __init__(self, content: list[Block], stop_reason: str):
        self.content, self.stop_reason = content, stop_reason


def _get(b, k, default=None):
    return b.get(k, default) if isinstance(b, dict) else getattr(b, k, default)


def _tools(tools: list[dict]) -> list[dict]:
    return [{'type': 'function', 'function': {'name': t['name'], 'description': t.get('description', '')[:1000],
                                              'parameters': t.get('input_schema') or {'type': 'object', 'properties': {}}}}
            for t in tools]


def _messages(system: str, messages: list) -> list[dict]:
    out: list[dict] = [{'role': 'system', 'content': system}] if system else []
    for m in messages:
        c = m['content']
        if isinstance(c, str):
            out.append({'role': m['role'], 'content': c})
            continue
        if m['role'] == 'assistant':
            text = ''.join(_get(b, 'text', '') or '' for b in c if _get(b, 'type') == 'text')
            calls = []
            for b in c:
                if _get(b, 'type') != 'tool_use':
                    continue
                raw = _get(b, 'raw')
                if raw:
                    calls.append(raw)      # garde la thought_signature de Gemini telle quelle
                else:                      # appel venu de Claude (bascule en cours de tâche)
                    calls.append({'id': _get(b, 'id'), 'type': 'function', 'extra_content': SKIP_SIGNATURE,
                                  'function': {'name': _get(b, 'name'), 'arguments': json.dumps(_get(b, 'input') or {})}})
            msg: dict = {'role': 'assistant', 'content': text or None}
            if calls:
                msg['tool_calls'] = calls
            out.append(msg)
            continue
        # user : résultats d'outils → messages « tool » ; images et texte libre → un message user après
        extra: list[dict] = []
        for b in c:
            t = _get(b, 'type')
            if t == 'tool_result':
                rc = _get(b, 'content')
                if isinstance(rc, str):
                    txt = rc
                else:
                    txt = '\n'.join(x.get('text', '') for x in rc or [] if x.get('type') == 'text')
                    for x in rc or []:
                        if x.get('type') == 'image':
                            src = x['source']
                            extra.append({'type': 'image_url', 'image_url': {'url': f"data:{src.get('media_type', 'image/jpeg')};base64,{src['data']}"}})
                out.append({'role': 'tool', 'tool_call_id': _get(b, 'tool_use_id'), 'content': txt or '(vide)'})
            elif t == 'text':
                extra.append({'type': 'text', 'text': _get(b, 'text', '')})
            elif t == 'image':
                src = _get(b, 'source')
                extra.append({'type': 'image_url', 'image_url': {'url': f"data:{src.get('media_type', 'image/jpeg')};base64,{src['data']}"}})
        if extra:
            if not any(x['type'] == 'text' for x in extra):
                extra.insert(0, {'type': 'text', 'text': 'Capture de la page :'})
            out.append({'role': 'user', 'content': extra})
    return out


class _Messages:
    def __init__(self) -> None:
        self._skip: dict[str, float] = {}   # modèle#clé → saturé jusqu'à

    def create(self, model: str = '', max_tokens: int = 4000, system: str = '', tools: list | None = None,
               messages: list | None = None, tool_choice: dict | None = None, **_) -> Resp:
        keys = gemini_keys()
        if not keys:
            raise RuntimeError('GEMINI_API_KEY manquant')
        body: dict = {'messages': _messages(system, messages or []), 'max_tokens': max_tokens, 'reasoning_effort': 'low'}
        if tools:
            body['tools'] = _tools(tools)
            if tool_choice and tool_choice.get('type') == 'tool':
                body['tool_choice'] = {'type': 'function', 'function': {'name': tool_choice['name']}}
        last = ''
        for mdl in MODELS:
            for i, key in enumerate(keys):
                qid = f'{mdl}#{i}'
                if self._skip.get(qid, 0) > time.time():
                    continue
                req = urllib.request.Request(URL, data=json.dumps({**body, 'model': mdl}).encode(),
                                             headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
                try:
                    with urllib.request.urlopen(req, timeout=120) as r:
                        data = json.loads(r.read())
                except urllib.error.HTTPError as e:
                    last = f'{mdl} HTTP {e.code} {e.read()[:200]!r}'
                    if e.code in (429, 503, 404, 500):
                        self._skip[qid] = time.time() + (900 if e.code in (429, 404) else 60)
                    log.warning('free_llm %s', last)
                    continue
                except Exception as e:  # réseau / timeout
                    last = f'{mdl} {type(e).__name__}: {e}'
                    log.warning('free_llm %s', last)
                    continue
                ch = (data.get('choices') or [{}])[0]
                msg = ch.get('message') or {}
                blocks: list[Block] = []
                if msg.get('content'):
                    blocks.append(Block('text', text=msg['content']))
                for tc in msg.get('tool_calls') or []:
                    try:
                        args = json.loads(tc['function'].get('arguments') or '{}')
                    except json.JSONDecodeError:
                        args = {}
                    blocks.append(Block('tool_use', id=tc.get('id') or f'call_{len(blocks)}', name=tc['function']['name'],
                                        input=args, raw={**tc, 'id': tc.get('id') or f'call_{len(blocks)}'}))
                fr = ch.get('finish_reason')
                stop = 'tool_use' if any(b.type == 'tool_use' for b in blocks) else ('max_tokens' if fr == 'length' else 'end_turn')
                return Resp(blocks, stop)
        raise RuntimeError(f'Tous les modèles Gemini gratuits ont échoué ({last})')


class FreeClient:
    """Remplaçant gratuit de anthropic.Anthropic() pour messages.create()."""
    def __init__(self) -> None:
        self.messages = _Messages()


class FallbackClient:
    """Gemini gratuit d'abord ; Claude seulement si Gemini est en panne ET qu'il reste du crédit."""
    def __init__(self, free: FreeClient | None, claude) -> None:
        self.free, self.claude = free, claude
        self.messages = self

    def create(self, **kw):
        if self.free:
            try:
                return self.free.messages.create(**kw)
            except Exception as e:
                if not self.claude:
                    raise
                log.warning('free_llm KO → Claude : %s', e)
        msgs = [{**m, 'content': [_as_dict(b) for b in m['content']]} if isinstance(m['content'], list) else m
                for m in kw.get('messages') or []]
        return self.claude.messages.create(**{**kw, 'messages': msgs})


def _as_dict(b):
    if isinstance(b, Block):
        return {'type': 'text', 'text': b.text} if b.type == 'text' else {'type': 'tool_use', 'id': b.id, 'name': b.name, 'input': b.input}
    return b
