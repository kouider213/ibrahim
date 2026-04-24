import os
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, ConversationHandler, filters
)
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.getenv("FLIGHT_BOT_TOKEN")
AMADEUS_KEY    = os.getenv("AMADEUS_API_KEY")
AMADEUS_SECRET = os.getenv("AMADEUS_API_SECRET")

# ── États conversation ───────────────────────────────────────────────────────
ORIGIN, DESTINATION, DATE_DEP, DATE_RET, PASSENGERS = range(5)

# ── Amadeus Auth ─────────────────────────────────────────────────────────────
def get_amadeus_token():
    r = requests.post(
        "https://test.api.amadeus.com/v1/security/oauth2/token",
        data={
            "grant_type": "client_credentials",
            "client_id": AMADEUS_KEY,
            "client_secret": AMADEUS_SECRET,
        }
    )
    return r.json().get("access_token")

# ── Recherche vols ────────────────────────────────────────────────────────────
def search_flights(origin, destination, date_dep, date_ret=None, adults=1):
    token = get_amadeus_token()
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "originLocationCode": origin.upper(),
        "destinationLocationCode": destination.upper(),
        "departureDate": date_dep,
        "adults": adults,
        "max": 5,
        "currencyCode": "EUR"
    }
    if date_ret:
        params["returnDate"] = date_ret

    r = requests.get(
        "https://test.api.amadeus.com/v2/shopping/flight-offers",
        headers=headers,
        params=params
    )
    return r.json()

# ── Formatage résultat ────────────────────────────────────────────────────────
def format_flight(offer, index):
    price = offer["price"]["total"]
    currency = offer["price"]["currency"]
    itineraries = offer["itineraries"]

    lines = [f"✈️ *Option {index+1}* — {price} {currency}"]

    for i, itin in enumerate(itineraries):
        label = "🛫 Aller" if i == 0 else "🛬 Retour"
        seg = itin["segments"][0]
        dep = seg["departure"]["iataCode"]
        arr = seg["arrival"]["iataCode"]
        dep_time = seg["departure"]["at"].replace("T", " ")[:16]
        arr_time = seg["arrival"]["at"].replace("T", " ")[:16]
        duration = itin["duration"].replace("PT", "").replace("H", "h").replace("M", "min")
        carrier = seg["carrierCode"]
        stops = len(itin["segments"]) - 1
        stop_txt = "Direct 🟢" if stops == 0 else f"{stops} escale(s) 🟡"

        lines.append(
            f"{label}: {dep} → {arr}\n"
            f"  📅 {dep_time} → {arr_time}\n"
            f"  ⏱ Durée: {duration} | {stop_txt} | ✈️ {carrier}"
        )

    return "\n".join(lines)

# ── /start ────────────────────────────────────────────────────────────────────
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "✈️ *Bot Recherche Vols* — Fik Conciergerie\n\n"
        "Je vais t'aider à trouver les meilleurs billets !\n\n"
        "Tape /chercher pour commencer 🚀",
        parse_mode="Markdown"
    )

# ── /chercher ─────────────────────────────────────────────────────────────────
async def chercher(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🛫 *Aéroport de départ ?*\n\n"
        "Exemples: `ORN` (Oran), `ALG` (Alger), `CDG` (Paris), `DXB` (Dubai)",
        parse_mode="Markdown"
    )
    return ORIGIN

async def get_origin(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["origin"] = update.message.text.strip().upper()
    await update.message.reply_text(
        "🛬 *Aéroport de destination ?*\n\n"
        "Exemples: `CDG` (Paris), `LYS` (Lyon), `DXB` (Dubai), `IST` (Istanbul)",
        parse_mode="Markdown"
    )
    return DESTINATION

async def get_destination(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["destination"] = update.message.text.strip().upper()
    await update.message.reply_text(
        "📅 *Date de départ ?*\n\nFormat: `YYYY-MM-DD`\nExemple: `2026-06-15`",
        parse_mode="Markdown"
    )
    return DATE_DEP

async def get_date_dep(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["date_dep"] = update.message.text.strip()
    keyboard = [
        [InlineKeyboardButton("✅ Aller simple", callback_data="simple"),
         InlineKeyboardButton("🔄 Aller-retour", callback_data="retour")]
    ]
    await update.message.reply_text(
        "🎫 *Type de voyage ?*",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )
    return DATE_RET

async def get_trip_type(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    ctx.user_data["trip_type"] = query.data

    if query.data == "retour":
        await query.edit_message_text(
            "📅 *Date de retour ?*\n\nFormat: `YYYY-MM-DD`\nExemple: `2026-06-22`",
            parse_mode="Markdown"
        )
        return DATE_RET
    else:
        ctx.user_data["date_ret"] = None
        await query.edit_message_text(
            "👥 *Nombre de passagers ?* (1-9)",
            parse_mode="Markdown"
        )
        return PASSENGERS

async def get_date_ret(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["date_ret"] = update.message.text.strip()
    await update.message.reply_text(
        "👥 *Nombre de passagers ?* (1-9)",
        parse_mode="Markdown"
    )
    return PASSENGERS

async def get_passengers(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        adults = int(update.message.text.strip())
        if adults < 1 or adults > 9:
            raise ValueError
    except ValueError:
        await update.message.reply_text("❌ Nombre invalide. Entre 1 et 9.")
        return PASSENGERS

    ctx.user_data["adults"] = adults
    data = ctx.user_data

    await update.message.reply_text(
        f"🔍 Recherche en cours...\n\n"
        f"✈️ {data['origin']} → {data['destination']}\n"
        f"📅 {data['date_dep']}"
        + (f" → {data.get('date_ret', '')}" if data.get('date_ret') else "") +
        f"\n👥 {adults} passager(s)",
        parse_mode="Markdown"
    )

    try:
        result = search_flights(
            data["origin"],
            data["destination"],
            data["date_dep"],
            data.get("date_ret"),
            adults
        )

        offers = result.get("data", [])
        if not offers:
            await update.message.reply_text(
                "😕 Aucun vol trouvé pour ces critères.\n"
                "Essaie d'autres dates ou destinations."
            )
        else:
            await update.message.reply_text(
                f"✅ *{len(offers)} vol(s) trouvé(s) !*\n\n" +
                "\n\n─────────────────\n\n".join(
                    [format_flight(o, i) for i, o in enumerate(offers)]
                ),
                parse_mode="Markdown"
            )
    except Exception as e:
        await update.message.reply_text(f"❌ Erreur: {str(e)}")

    await update.message.reply_text(
        "🔄 Nouvelle recherche ? Tape /chercher\n"
        "❓ Aide ? Tape /aide"
    )
    return ConversationHandler.END

# ── /aide ─────────────────────────────────────────────────────────────────────
async def aide(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "✈️ *Codes aéroports courants:*\n\n"
        "🇩🇿 Algérie:\n"
        "  • `ORN` — Oran Es-Sénia\n"
        "  • `ALG` — Alger Houari Boumediene\n"
        "  • `CZL` — Constantine\n\n"
        "🇫🇷 France:\n"
        "  • `CDG` — Paris Charles de Gaulle\n"
        "  • `ORY` — Paris Orly\n"
        "  • `LYS` — Lyon\n"
        "  • `MRS` — Marseille\n\n"
        "🌍 Autres:\n"
        "  • `DXB` — Dubai\n"
        "  • `IST` — Istanbul\n"
        "  • `MAD` — Madrid\n"
        "  • `FCO` — Rome\n\n"
        "Tape /chercher pour lancer une recherche !",
        parse_mode="Markdown"
    )

# ── /annuler ──────────────────────────────────────────────────────────────────
async def annuler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Recherche annulée. Tape /chercher pour recommencer.")
    return ConversationHandler.END

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("chercher", chercher)],
        states={
            ORIGIN:      [MessageHandler(filters.TEXT & ~filters.COMMAND, get_origin)],
            DESTINATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_destination)],
            DATE_DEP:    [MessageHandler(filters.TEXT & ~filters.COMMAND, get_date_dep)],
            DATE_RET:    [
                CallbackQueryHandler(get_trip_type),
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_date_ret)
            ],
            PASSENGERS:  [MessageHandler(filters.TEXT & ~filters.COMMAND, get_passengers)],
        },
        fallbacks=[CommandHandler("annuler", annuler)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("aide", aide))
    app.add_handler(conv_handler)

    print("✈️ Bot vols démarré !")
    app.run_polling()

if __name__ == "__main__":
    main()
