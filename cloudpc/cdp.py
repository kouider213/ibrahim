"""Petit client CDP (Chrome du PC cloud, 127.0.0.1:9223) partagé par les scripts du PC cloud."""
import asyncio
import json
import urllib.request

import aiohttp

CDP = 'http://127.0.0.1:9223'


def cdp_json(path: str, method: str = 'GET'):
    req = urllib.request.Request(CDP + path, method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode()
    try:
        return json.loads(body or 'null')
    except json.JSONDecodeError:
        return body   # /json/activate répond « Target activated »


class Page:
    """Session CDP attachée à l'onglet dont l'adresse commence par `prefix` (créé s'il n'existe pas)."""

    def __init__(self, prefix: str, url: str):
        self.prefix, self.url = prefix, url
        self.http = self.ws = None
        self.seq = 0

    async def __aenter__(self):
        tab = next((t for t in cdp_json('/json/list') if t['type'] == 'page' and t['url'].startswith(self.prefix)), None)
        if not tab:
            tab = cdp_json('/json/new?' + self.url, 'PUT')
        self.target = tab['id']
        self.http = aiohttp.ClientSession()
        self.ws = await self.http.ws_connect(tab['webSocketDebuggerUrl'], max_msg_size=0)
        return self

    async def __aexit__(self, *_):
        if self.ws:
            await self.ws.close()
        if self.http:
            await self.http.close()

    async def call(self, method: str, params: dict | None = None) -> dict:
        self.seq += 1
        await self.ws.send_json({'id': self.seq, 'method': method, 'params': params or {}})
        while True:
            r = await asyncio.wait_for(self.ws.receive_json(), 30)
            if r.get('id') == self.seq:
                if 'error' in r:
                    raise RuntimeError(r['error'].get('message', 'CDP'))
                return r.get('result', {})

    async def js(self, expression: str):
        r = await self.call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'].get('exception', {}).get('description', 'JS'))
        return r.get('result', {}).get('value')

    async def screenshot(self) -> bytes:
        import base64
        r = await self.call('Page.captureScreenshot', {'format': 'jpeg', 'quality': 80})
        return base64.b64decode(r['data'])

    def activate(self) -> None:
        cdp_json(f'/json/activate/{self.target}')
