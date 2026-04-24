import os
import re
import asyncio
import requests
from bs4 import BeautifulSoup
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, ConversationHandler, filters
)
from datetime import datetime

# ── Config ───────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.getenv("FLIGHT_BOT_TOKEN")

# ── États conversation ────────────────────────────────────────────────────────
ORIGIN, DESTINATION, DATE_DEP, DATE_RET, PASSENGERS = range(5)

# ── Codes IATA communs ────────────────────────────────────────────────────────
AIRPORTS = {
    "oran": "ORN", "orn": "ORN",
    "alger": "ALG", "alg": "ALG",
    "paris": "CDG", "cdg": "CDG",
    "lyon": "LYS", "lys": "LYS",
    "marseille": "MRS", "mrs": "MRS",
    "dubai": "DXB", "dxb": "DXB",
    "istanbul": "IST", "ist": "IST",
    "london": "LHR", "lhr": "LHR",
    "madrid": "MAD", "mad": "MAD",
    "rome": "FCO", "fco": "FCO",
    "montreal": "YUL", "yul": "YUL",
    "bruxelles": "BRU", "bru": "BRU",
    "amsterdam": "AMS", "ams": "AMS",
    "frankfurt": "FRA", "fra": "FRA",
    "tunis": "TUN", "tun": "TUN",
    "casablanca": "CMN", "cmn": "CMN",
    "doha": "DOH", "doh": "DOH",
    "new york": "JFK", "jfk": "JFK",
    "barcelone": "BCN", "bcn": "BCN",
    "nice": "NCE", "nce": "NCE",
}

def resolve_airport(text):
    text = text.strip().lower()
    return AIRPORTS.get(text, text.upper())

# ── Scraper eDreams ───────────────────────────────────────────────────────────
def scrape_edreams(origin, destination, date_dep, date_ret=None, adults=1):
    """
    Scrape eDreams pour les vols disponibles.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    # Format date eDreams: DD/MM/YYYY
    try:
        d = datetime.strptime(date_dep, "%Y-%m-%d")
        date_edreams = d.strftime("%d/%m/%Y")
    except:
        date_edreams = date_dep

    if date_ret:
        try:
            dr = datetime.strptime(date_ret, "%Y-%m-%d")
            date_ret_edreams = dr.strftime("%d/%m/%Y")
        except:
            date_ret_edreams = date_ret
        trip_type = "round"
        url = (
            f"https://www.edreams.fr/flight/"
            f"#results/type=R;from={origin};to={destination};"
            f"dep={date_edreams};ret={date_ret_edreams};adults={adults};children=0;infants=0"
        )
    else:
        trip_type = "oneway"
        url = (
            f"https://www.edreams.fr/flight/"
            f"#results/type=O;from={origin};to={destination};"
            f"dep={date_edreams};adults={adults};children=0;infants=0"
        )

    # eDreams charge en JS — on utilise leur API interne
    api_url = build_edreams_api(origin, destination, date_dep, date_ret, adults)
    
    try:
        response = requests.get(api_url, headers=headers, timeout=15)
        if response.status_code == 200:
            flights = parse_edreams_response(response, origin, destination, date_dep, date_ret)
            return flights, url
    except Exception as e:
        pass

    # Fallback: retourner le lien direct
    return [], url

def build_edreams_api(origin, destination, date_dep, date_ret, adults):
    """Construit l'URL de recherche eDreams"""
    try:
        d = datetime.strptime(date_dep, "%Y-%m-%d")
        dep_fmt = d.strftime("%d/%m/%Y")
    except:
        dep_fmt = date_dep

    if date_ret:
        try:
            dr = datetime.strptime(date_ret, "%Y-%m-%d")
            ret_fmt = dr.strftime("%d/%m/%Y")
        except:
            ret_fmt = date_ret
        return (
            f"https://www.edreams.fr/fr/vol-pas-cher/"
            f"{origin.lower()}-{destination.lower()}/"
            f"?departureDate={dep_fmt}&returnDate={ret_fmt}&adults={adults}"
        )
    else:
        return (
            f"https://www.edreams.fr/fr/vol-pas-cher/"
            f"{origin.lower()}-{destination.lower()}/"
            f"?departureDate={dep_fmt}&adults={adults}"
        )

def parse_edreams_response(response, origin, destination, date_dep, date_ret):
    """Parse la réponse HTML d'eDreams"""
    flights = []
    soup = BeautifulSoup(response.text, "html.parser")

    # Chercher les éléments de prix
    price_elements = soup.find_all(class_=re.compile(r'price|Price|prix|Prix'))
    
    for i, el in enumerate(price_elements[:5]):
        text = el.get_text(strip=True)
        price_match = re.search(r'(\d+[\s,.]?\d*)\s*€', text)
        if price_match:
            flights.append({
                "price": price_match.group(0),
                "origin": origin,
                "destination": destination,
                "date": date_dep,
                "index": i + 1
            })

    return flights

# ── Générer lien eDreams ──────────────────────────────────────────────────────
def generate_edreams_link(origin, destination, date_dep, date_ret=None, adults=1):
    try:
        d = datetime.strptime(date_dep, "%Y-%m-%d")
        dep_fmt = d.strftime("%d/%m/%Y")
    except:
        dep_fmt = date_dep

    if date_ret:
        try:
            dr = datetime.strptime(date_ret, "%Y-%m-%d")
            ret_fmt = dr.strftime("%d/%m/%Y")
        except:
            ret_fmt = date_ret
        return (
            f"https://www.edreams.fr/#results/type=R;"
            f"from={origin};to={destination};"
            f"dep={dep_fmt};ret={ret_fmt};"
            f"adults={adults};children=0;infants=0"
        )
    else:
        return (
            f"https://www.edreams.fr/#results/type=O;"
            f"from={origin};to={destination};"
            f"dep={dep_fmt};"
            f"adults={adults};children=0;infants=0"
        )

# ── /start ────────────────────────────────────────────────────────────────────
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "✈️ *Bot Recherche Vols — Fik Conciergerie*\n\n"
        "Je cherche les meilleurs billets sur *eDreams* pour toi !\n\n"
        "📌 Commandes disponibles :\n"
        "• /chercher — Rechercher un vol\n"
        "• /aide — Aide & codes aéroports\n\n"
        "Tape /chercher pour commencer 🚀",
        parse_mode="Markdown"
    )

# ── /aide ─────────────────────────────────────────────────────────────────────
async def aide(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "✈️ *Codes Aéroports Fréquents*\n\n"
        "🇩🇿 *Algérie:*\n"
        "• Oran → `ORN`\n"
        "• Alger → `ALG`\n\n"
        "🇫🇷 *France:*\n"
        "• Paris CDG → `CDG`\n"
        "• Lyon → `LYS`\n"
        "• Marseille → `MRS`\n"
        "• Nice → `NCE`\n"
        "• Bordeaux → `BOD`\n\n"
        "🌍 *Autres:*\n"
        "• Dubai → `DXB`\n"
        "• Istanbul → `IST`\n"
        "• Bruxelles → `BRU`\n"
        "• Amsterdam → `AMS`\n"
        "• Madrid → `MAD`\n"
        "• Casablanca → `CMN`\n"
        "• Tunis → `TUN`\n\n"
        "💡 Tu peux aussi écrire le nom de la ville directement !",
        parse_mode="Markdown"
    )

# ── /chercher ─────────────────────────────────────────────────────────────────
async def chercher(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🛫 *Ville ou aéroport de départ ?*\n\n"
        "Exemples: `Oran`, `ORN`, `Paris`, `CDG`\n\n"
        "Tape /aide pour voir tous les codes",
        parse_mode="Markdown"
    )
    return ORIGIN

async def get_origin(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    code = resolve_airport(update.message.text)
    ctx.user_data["origin"] = code
    await update.message.reply_text(
        f"✅ Départ: *{code}*\n\n"
        f"🛬 *Destination ?*\n\n"
        f"Exemples: `Paris`, `CDG`, `Dubai`, `DXB`",
        parse_mode="Markdown"
    )
    return DESTINATION

async def get_destination(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    code = resolve_airport(update.message.text)
    ctx.user_data["destination"] = code
    await update.message.reply_text(
        f"✅ Destination: *{code}*\n\n"
        f"📅 *Date de départ ?*\n\n"
        f"Format: `JJ/MM/AAAA`\n"
        f"Exemple: `15/06/2025`",
        parse_mode="Markdown"
    )
    return DATE_DEP

async def get_date_dep(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.strip()
    # Accepter JJ/MM/AAAA ou AAAA-MM-JJ
    try:
        if "/" in raw:
            d = datetime.strptime(raw, "%d/%m/%Y")
        else:
            d = datetime.strptime(raw, "%Y-%m-%d")
        ctx.user_data["date_dep"] = d.strftime("%Y-%m-%d")
        ctx.user_data["date_dep_display"] = d.strftime("%d/%m/%Y")
    except:
        await update.message.reply_text(
            "❌ Format invalide. Utilise: `15/06/2025`",
            parse_mode="Markdown"
        )
        return DATE_DEP

    keyboard = [
        [InlineKeyboardButton("✈️ Aller simple", callback_data="oneway")],
        [InlineKeyboardButton("🔄 Aller-Retour", callback_data="roundtrip")],
    ]
    await update.message.reply_text(
        f"✅ Date départ: *{ctx.user_data['date_dep_display']}*\n\n"
        f"🔄 *Type de voyage ?*",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )
    return DATE_RET

async def get_trip_type(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "oneway":
        ctx.user_data["date_ret"] = None
        await query.message.reply_text(
            "👥 *Nombre de passagers adultes ?*\n\n"
            "Réponds avec un chiffre: `1`, `2`, `3`...",
            parse_mode="Markdown"
        )
        return PASSENGERS
    else:
        await query.message.reply_text(
            "📅 *Date de retour ?*\n\n"
            "Format: `JJ/MM/AAAA`\n"
            "Exemple: `25/06/2025`",
            parse_mode="Markdown"
        )
        return DATE_RET

async def get_date_ret(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    raw = update.message.text.strip()
    try:
        if "/" in raw:
            d = datetime.strptime(raw, "%d/%m/%Y")
        else:
            d = datetime.strptime(raw, "%Y-%m-%d")
        ctx.user_data["date_ret"] = d.strftime("%Y-%m-%d")
        ctx.user_data["date_ret_display"] = d.strftime("%d/%m/%Y")
    except:
        await update.message.reply_text(
            "❌ Format invalide. Utilise: `25/06/2025`",
            parse_mode="Markdown"
        )
        return DATE_RET

    await update.message.reply_text(
        f"✅ Date retour: *{ctx.user_data['date_ret_display']}*\n\n"
        f"👥 *Nombre de passagers adultes ?*\n\n"
        f"Réponds avec un chiffre: `1`, `2`, `3`...",
        parse_mode="Markdown"
    )
    return PASSENGERS

async def get_passengers(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        adults = int(update.message.text.strip())
        if adults < 1 or adults > 9:
            raise ValueError
    except:
        await update.message.reply_text("❌ Nombre invalide. Entre 1 et 9.")
        return PASSENGERS

    ctx.user_data["adults"] = adults

    origin = ctx.user_data["origin"]
    destination = ctx.user_data["destination"]
    date_dep = ctx.user_data["date_dep"]
    date_dep_display = ctx.user_data["date_dep_display"]
    date_ret = ctx.user_data.get("date_ret")
    date_ret_display = ctx.user_data.get("date_ret_display", "")
    trip_label = f"🔄 {date_dep_display} → {date_ret_display}" if date_ret else f"✈️ {date_dep_display}"

    await update.message.reply_text(
        f"🔍 *Recherche en cours...*\n\n"
        f"• Trajet: *{origin} → {destination}*\n"
        f"• {trip_label}\n"
        f"• Passagers: *{adults}*\n\n"
        f"⏳ Merci de patienter...",
        parse_mode="Markdown"
    )

    # Générer le lien eDreams
    link = generate_edreams_link(origin, destination, date_dep, date_ret, adults)

    # Chercher aussi sur d'autres sites
    google_link = generate_google_flights(origin, destination, date_dep, date_ret, adults)
    skyscanner_link = generate_skyscanner(origin, destination, date_dep, date_ret, adults)

    keyboard = [
        [InlineKeyboardButton("🔵 Voir sur eDreams", url=link)],
        [InlineKeyboardButton("🔍 Google Flights", url=google_link)],
        [InlineKeyboardButton("🟠 Skyscanner", url=skyscanner_link)],
        [InlineKeyboardButton("🔄 Nouvelle recherche", callback_data="new_search")],
    ]

    trip_type_txt = "Aller-Retour" if date_ret else "Aller Simple"
    ret_txt = f"\n• Retour: *{date_ret_display}*" if date_ret else ""

    await update.message.reply_text(
        f"✅ *Résultats trouvés !*\n\n"
        f"🛫 *{origin}* → 🛬 *{destination}*\n"
        f"• Type: *{trip_type_txt}*\n"
        f"• Départ: *{date_dep_display}*{ret_txt}\n"
        f"• Passagers: *{adults} adulte(s)*\n\n"
        f"👇 *Clique pour voir les prix en temps réel:*",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

    return ConversationHandler.END

# ── Liens alternatifs ─────────────────────────────────────────────────────────
def generate_google_flights(origin, destination, date_dep, date_ret, adults):
    try:
        d = datetime.strptime(date_dep, "%Y-%m-%d")
        dep_fmt = d.strftime("%Y-%m-%d")
    except:
        dep_fmt = date_dep

    if date_ret:
        try:
            dr = datetime.strptime(date_ret, "%Y-%m-%d")
            ret_fmt = dr.strftime("%Y-%m-%d")
        except:
            ret_fmt = date_ret
        return (
            f"https://www.google.com/travel/flights?"
            f"q=Vols+{origin}+vers+{destination}"
            f"&hl=fr&curr=EUR"
        )
    return (
        f"https://www.google.com/travel/flights?"
        f"q=Vols+{origin}+vers+{destination}"
        f"&hl=fr&curr=EUR"
    )

def generate_skyscanner(origin, destination, date_dep, date_ret, adults):
    try:
        d = datetime.strptime(date_dep, "%Y-%m-%d")
        dep_fmt = d.strftime("%yyMM%dd").replace("yy", d.strftime("%y"))
        dep_sky = d.strftime("%y%m%d")
    except:
        dep_sky = ""

    if date_ret:
        try:
            dr = datetime.strptime(date_ret, "%Y-%m-%d")
            ret_sky = dr.strftime("%y%m%d")
        except:
            ret_sky = ""
        return (
            f"https://www.skyscanner.fr/transport/vols/"
            f"{origin.lower()}/{destination.lower()}/"
            f"{dep_sky}/{ret_sky}/?adults={adults}"
        )
    return (
        f"https://www.skyscanner.fr/transport/vols/"
        f"{origin.lower()}/{destination.lower()}/"
        f"{dep_sky}/?adults={adults}"
    )

# ── Callback nouvelle recherche ───────────────────────────────────────────────
async def new_search_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    await query.message.reply_text(
        "🛫 *Nouvelle recherche !*\n\n"
        "Ville ou aéroport de départ ?",
        parse_mode="Markdown"
    )
    return ORIGIN

# ── /annuler ──────────────────────────────────────────────────────────────────
async def annuler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "❌ Recherche annulée.\n\nTape /chercher pour recommencer."
    )
    return ConversationHandler.END

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    conv = ConversationHandler(
        entry_points=[
            CommandHandler("chercher", chercher),
            CallbackQueryHandler(new_search_callback, pattern="^new_search$"),
        ],
        states={
            ORIGIN: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_origin)],
            DESTINATION: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_destination)],
            DATE_DEP: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_date_dep)],
            DATE_RET: [
                CallbackQueryHandler(get_trip_type, pattern="^(oneway|roundtrip)$"),
                MessageHandler(filters.TEXT & ~filters.COMMAND, get_date_ret),
            ],
            PASSENGERS: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_passengers)],
        },
        fallbacks=[CommandHandler("annuler", annuler)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("aide", aide))
    app.add_handler(conv)

    print("✈️ Bot eDreams démarré !")
    app.run_polling()

if __name__ == "__main__":
    main()
