"""
NEXUS Wake-on-LAN
- send_wol(mac): broadcast magic packet (use from backend or another PC)
- WoLService: keeps alive, exposes send_wol to nexus command handler
"""
import asyncio
import logging
import socket

log = logging.getLogger('nexus.wol')


def send_wol(mac: str, broadcast: str = '255.255.255.255', port: int = 9) -> bool:
    """Send WoL magic packet. MAC format: aa:bb:cc:dd:ee:ff"""
    try:
        clean = mac.replace(':', '').replace('-', '')
        if len(clean) != 12:
            raise ValueError(f'Invalid MAC: {mac}')
        packet = b'\xff' * 6 + bytes.fromhex(clean) * 16
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.sendto(packet, (broadcast, port))
        log.info('WoL sent → %s @ %s:%d', mac, broadcast, port)
        return True
    except Exception as e:
        log.error('WoL error: %s', e)
        return False


class WoLService:
    def __init__(self, app) -> None:
        self.app = app

    async def run(self) -> None:
        log.info('WoL service ready (send_wol available)')
        await asyncio.Future()  # keep alive
