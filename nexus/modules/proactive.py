"""
NEXUS Proactive Monitor
- Railway health every 5 min → alerte si down/up
- Disk alert si >90%
- Bookings widget refresh toutes les 15 min
"""
import asyncio
import logging
import os

log = logging.getLogger('nexus.proactive')

HEALTH_INTERVAL   = 300   # 5 min — Railway + disk
BOOKINGS_INTERVAL = 900   # 15 min — bookings widget refresh


class ProactiveMonitor:
    def __init__(self, app) -> None:
        self.app = app
        self._railway_was_ok: bool | None = None  # None = not checked yet

    async def run(self) -> None:
        await asyncio.sleep(180)  # Let system settle 3 min after startup
        await asyncio.gather(
            self._health_loop(),
            self._bookings_loop(),
        )

    # ── Railway + Disk ──────────────────────────────────────────────────────

    async def _health_loop(self) -> None:
        while True:
            await self._check_railway()
            await self._check_disk()
            await asyncio.sleep(HEALTH_INTERVAL)

    async def _check_railway(self) -> None:
        import aiohttp
        url = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f'{url}/health', timeout=aiohttp.ClientTimeout(total=8)) as r:
                    is_ok = r.status == 200
        except Exception:
            is_ok = False

        await self.app.gui_send({
            'type': 'widget', 'widget': 'railway',
            'data': {'status': 'ok' if is_ok else 'offline'},
        })

        # Alert only on state change
        if self._railway_was_ok is not None:
            if self._railway_was_ok and not is_ok:
                await self.app.speak('Alerte Kouider — backend Railway inaccessible.')
                await self.app.journal('🔴 Railway offline')
            elif not self._railway_was_ok and is_ok:
                await self.app.speak('Backend Railway de nouveau en ligne.')
                await self.app.journal('🟢 Railway back online')

        self._railway_was_ok = is_ok

    async def _check_disk(self) -> None:
        try:
            import shutil
            t, u, f = shutil.disk_usage('C:')
            pct = u / t * 100
            await self.app.gui_send({
                'type': 'widget', 'widget': 'disk',
                'data': {'total': t, 'used': u, 'free': f, 'pct': round(pct, 1)},
            })
            if pct > 90:
                free_gb = round(f / 1e9, 1)
                await self.app.speak(
                    f'Attention Kouider, disque C à {pct:.0f} pourcent. '
                    f'Seulement {free_gb} giga libres.'
                )
                await self.app.journal(f'⚠️ Disque C: {pct:.0f}% plein — {free_gb}GB libres')
        except Exception as e:
            log.error('Disk check: %s', e)

    # ── Bookings widget refresh ──────────────────────────────────────────────

    async def _bookings_loop(self) -> None:
        while True:
            await asyncio.sleep(BOOKINGS_INTERVAL)
            await self._refresh_bookings()

    async def _refresh_bookings(self) -> None:
        import aiohttp
        backend = os.environ.get('BACKEND_URL', 'https://ibrahim-backend-production.up.railway.app')
        token   = os.environ.get('PC_AGENT_TOKEN', '')
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(
                    f'{backend}/api/bookings?status=ACTIVE,CONFIRMED',
                    headers={'Authorization': f'Bearer {token}'},
                    timeout=aiohttp.ClientTimeout(total=8),
                ) as r:
                    data = await r.json()
                    items = data if isinstance(data, list) else data.get('data', [])
                    count = len(items)
            await self.app.gui_send({'type': 'widget', 'widget': 'bookings', 'data': {'count': count}})
        except Exception as e:
            log.error('Bookings refresh: %s', e)
