"""Connexion du compte Telegram Dzaryx (une seule fois), en 2 étapes :

  .venv/bin/python login.py send +213XXXXXXXXX     → Telegram envoie un code
  .venv/bin/python login.py code 12345 [motdepasse2FA]

La session est gardée dans dzaryx.session (ne jamais la partager).
"""
import asyncio
import json
import sys
from pathlib import Path

from pyrogram import Client
from pyrogram.errors import SessionPasswordNeeded

from dzaryx_tg import API_HASH, API_ID, HERE

STATE = HERE / '.login_state.json'


async def main() -> None:
    step = sys.argv[1]
    app = Client('dzaryx', api_id=API_ID, api_hash=API_HASH, workdir=str(HERE))
    await app.connect()
    if step == 'send':
        phone = sys.argv[2]
        sent = await app.send_code(phone)
        STATE.write_text(json.dumps({'phone': phone, 'hash': sent.phone_code_hash}))
        print(f'Code envoyé ({sent.type}). Lance : login.py code <CODE>')
    elif step == 'code':
        st = json.loads(STATE.read_text())
        try:
            await app.sign_in(st['phone'], st['hash'], sys.argv[2])
        except SessionPasswordNeeded:
            if len(sys.argv) < 4:
                print('Ce compte a un mot de passe (2FA) : login.py code <CODE> <MOTDEPASSE>')
                return
            await app.check_password(sys.argv[3])
        me = await app.get_me()
        STATE.unlink(missing_ok=True)
        print(f'Connecté : {me.first_name} (id {me.id})')
    await app.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
