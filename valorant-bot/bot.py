import os
import re
import asyncio
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, ConversationHandler, filters,
)

# ── Config ────────────────────────────────────────────────────────────────────
TELEGRAM_TOKEN = os.getenv("VOLORANBOT_TOKEN")
HENRIK_API_KEY = os.getenv("HENRIK_API_KEY", "")  # optional — rate limit is higher with key

HENRIK_BASE = "https://api.henrikdev.xyz/valorant"

# ── États conversation ────────────────────────────────────────────────────────
ASK_PLAYER = 0

# ── Rank emoji mapping ────────────────────────────────────────────────────────
RANK_EMOJI = {
    "Iron":        "🪨",
    "Bronze":      "🥉",
    "Silver":      "🥈",
    "Gold":        "🥇",
    "Platinum":    "💎",
    "Diamond":     "💠",
    "Ascendant":   "🟢",
    "Immortal":    "🔴",
    "Radiant":     "🌟",
    "Unranked":    "⬜",
}

AGENT_EMOJI = {
    "Jett": "💨", "Reyna": "🔴", "Phoenix": "🔥", "Raze": "💥",
    "Neon": "⚡", "Yoru": "👻", "Iso": "🛡️",
    "Sova": "🏹", "Fade": "🌑", "Breach": "💢", "KAY/O": "🤖",
    "Skye": "🌿", "Gekko": "🦎", "Harbor": "🌊",
    "Brimstone": "☁️", "Omen": "🌫️", "Astra": "✨", "Viper": "☠️", "Clove": "🍀",
    "Cypher": "🕵️", "Chamber": "🎩", "Killjoy": "🔧", "Sage": "💚", "Deadlock": "⛓️",
}

# ── Helpers API ───────────────────────────────────────────────────────────────
def henrik_headers():
    h = {"Content-Type": "application/json"}
    if HENRIK_API_KEY:
        h["Authorization"] = HENRIK_API_KEY
    return h

def parse_name_tag(text: str):
    text = text.strip()
    if "#" in text:
        parts = text.split("#", 1)
        return parts[0].strip(), parts[1].strip()
    return None, None

def rank_emoji(tier_name: str) -> str:
    for key, emoji in RANK_EMOJI.items():
        if key.lower() in tier_name.lower():
            return emoji
    return "❓"

def agent_emoji(agent: str) -> str:
    return AGENT_EMOJI.get(agent, "🎮")

# ── Appels API ─────────────────────────────────────────────────────────────────
def get_mmr(name: str, tag: str) -> dict | None:
    try:
        r = requests.get(
            f"{HENRIK_BASE}/v2/mmr/eu/{name}/{tag}",
            headers=henrik_headers(), timeout=10
        )
        if r.status_code == 200:
            return r.json().get("data")
    except Exception:
        pass
    return None

def get_account(name: str, tag: str) -> dict | None:
    try:
        r = requests.get(
            f"{HENRIK_BASE}/v1/account/{name}/{tag}",
            headers=henrik_headers(), timeout=10
        )
        if r.status_code == 200:
            return r.json().get("data")
    except Exception:
        pass
    return None

def get_matches(name: str, tag: str, count: int = 5) -> list:
    try:
        r = requests.get(
            f"{HENRIK_BASE}/v3/matches/eu/{name}/{tag}?size={count}",
            headers=henrik_headers(), timeout=10
        )
        if r.status_code == 200:
            return r.json().get("data", [])
    except Exception:
        pass
    return []

# ── Formateurs ────────────────────────────────────────────────────────────────
def format_rank(mmr: dict) -> str:
    current = mmr.get("current_data", {})
    tier = current.get("currenttierpatched", "Unranked")
    rr = current.get("ranking_in_tier", 0)
    elo = current.get("elo", 0)
    peak = mmr.get("highest_rank", {})
    peak_tier = peak.get("patched_tier", "—")
    peak_act = peak.get("season", "—")

    emoji = rank_emoji(tier)
    peak_emoji = rank_emoji(peak_tier)

    return (
        f"{emoji} *Rank actuel:* {tier} — {rr} RR\n"
        f"📊 *ELO total:* {elo}\n"
        f"{peak_emoji} *Peak:* {peak_tier} ({peak_act})"
    )

def format_account(account: dict) -> str:
    name = account.get("name", "?")
    tag = account.get("tag", "?")
    level = account.get("account_level", "?")
    card = account.get("card", {}).get("small", "")
    return f"👤 *{name}#{tag}* — Niveau {level}", card

def format_match(match: dict, player_name: str, player_tag: str) -> str:
    meta = match.get("metadata", {})
    players = match.get("players", {}).get("all_players", [])

    map_name = meta.get("map", "?")
    mode = meta.get("mode", "?")
    rounds_won = match.get("teams", {})
    my_team = None

    # Trouver le joueur dans ce match
    me = None
    for p in players:
        if p.get("name", "").lower() == player_name.lower() and \
           p.get("tag", "").lower() == player_tag.lower():
            me = p
            my_team = p.get("team", "").lower()
            break

    if not me:
        return f"🗺️ {map_name} — {mode}"

    stats = me.get("stats", {})
    kills = stats.get("kills", 0)
    deaths = stats.get("deaths", 1)
    assists = stats.get("assists", 0)
    kda = round((kills + assists) / max(deaths, 1), 2)
    agent = me.get("character", "?")
    score = me.get("competitive_rank", "")

    team_data = match.get("teams", {})
    won = False
    if my_team in team_data:
        won = team_data[my_team].get("has_won", False)

    result = "✅ Victoire" if won else "❌ Défaite"
    a_emoji = agent_emoji(agent)

    return (
        f"{result} • 🗺️ {map_name} • {a_emoji} {agent}\n"
        f"   K/D/A: *{kills}/{deaths}/{assists}* (KDA {kda})"
    )

# ── /start ─────────────────────────────────────────────────────────────────────
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🎮 *voloranbot*\n\n"
        "Consulte les stats de n'importe quel joueur Valorant !\n\n"
        "📌 *Commandes :*\n"
        "• /stats — Stats complètes d'un joueur\n"
        "• /rank — Rang actuel\n"
        "• /matches — 5 dernières parties\n"
        "• /aide — Aide\n\n"
        "Format joueur : `Pseudo#TAG`\n"
        "Exemple : `TenZ#000`",
        parse_mode="Markdown",
    )

# ── /aide ──────────────────────────────────────────────────────────────────────
async def aide(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "ℹ️ *Aide — Valorant Stats Bot*\n\n"
        "Toutes les commandes prennent un pseudo Valorant au format `Pseudo#TAG`\n\n"
        "*Commandes :*\n"
        "• `/stats Pseudo#TAG` — Niveau, rang, peak, KDA moyen\n"
        "• `/rank Pseudo#TAG` — Rang + RR actuels\n"
        "• `/matches Pseudo#TAG` — 5 dernières parties\n\n"
        "💡 Tu peux aussi envoyer juste la commande sans argument, le bot te demandera le pseudo.\n\n"
        "🌍 *Région supportée :* EU (par défaut)\n"
        "📡 *Données :* Henrik's Valorant API",
        parse_mode="Markdown",
    )

# ── Commande générique avec ou sans argument ──────────────────────────────────
async def cmd_stats(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["mode"] = "stats"
    return await _ask_or_exec(update, ctx)

async def cmd_rank(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["mode"] = "rank"
    return await _ask_or_exec(update, ctx)

async def cmd_matches(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    ctx.user_data["mode"] = "matches"
    return await _ask_or_exec(update, ctx)

async def _ask_or_exec(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    args = ctx.args
    if args:
        player_str = " ".join(args)
        name, tag = parse_name_tag(player_str)
        if name and tag:
            await _execute(update, ctx, name, tag)
            return ConversationHandler.END
    await update.message.reply_text(
        "👤 *Quel joueur ?*\n\nEnvoie le pseudo au format `Pseudo#TAG`",
        parse_mode="Markdown",
    )
    return ASK_PLAYER

async def receive_player(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    name, tag = parse_name_tag(text)
    if not name or not tag:
        await update.message.reply_text(
            "❌ Format invalide. Utilise : `Pseudo#TAG`\n"
            "Exemple : `TenZ#000`",
            parse_mode="Markdown",
        )
        return ASK_PLAYER
    await _execute(update, ctx, name, tag)
    return ConversationHandler.END

async def _execute(update: Update, ctx: ContextTypes.DEFAULT_TYPE, name: str, tag: str):
    mode = ctx.user_data.get("mode", "stats")
    msg = await update.message.reply_text(f"🔍 Recherche de *{name}#{tag}*...", parse_mode="Markdown")

    keyboard = [
        [
            InlineKeyboardButton("📊 Stats", callback_data=f"stats|{name}|{tag}"),
            InlineKeyboardButton("🏆 Rank", callback_data=f"rank|{name}|{tag}"),
            InlineKeyboardButton("🕹️ Matches", callback_data=f"matches|{name}|{tag}"),
        ]
    ]

    if mode == "rank":
        text = await _build_rank_text(name, tag)
    elif mode == "matches":
        text = await _build_matches_text(name, tag)
    else:
        text = await _build_stats_text(name, tag)

    await msg.edit_text(text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard))

# ── Builders de texte ─────────────────────────────────────────────────────────
async def _build_stats_text(name: str, tag: str) -> str:
    account = get_account(name, tag)
    mmr = get_mmr(name, tag)

    if not account and not mmr:
        return f"❌ Joueur *{name}#{tag}* introuvable.\n\nVérifie le pseudo et le tag."

    lines = [f"🎮 *{name}#{tag}*\n"]

    if account:
        level = account.get("account_level", "?")
        lines.append(f"🔰 *Niveau :* {level}")

    if mmr:
        lines.append("")
        lines.append(format_rank(mmr))
    else:
        lines.append("⬜ *Rank :* Non classé")

    matches = get_matches(name, tag, 5)
    if matches:
        kills_total, deaths_total, assists_total, count = 0, 0, 0, 0
        wins = 0
        for m in matches:
            players = m.get("players", {}).get("all_players", [])
            for p in players:
                if p.get("name", "").lower() == name.lower() and \
                   p.get("tag", "").lower() == tag.lower():
                    s = p.get("stats", {})
                    kills_total += s.get("kills", 0)
                    deaths_total += s.get("deaths", 0)
                    assists_total += s.get("assists", 0)
                    my_team = p.get("team", "").lower()
                    team_data = m.get("teams", {})
                    if my_team in team_data and team_data[my_team].get("has_won"):
                        wins += 1
                    count += 1
                    break

        if count:
            avg_kda = round((kills_total + assists_total) / max(deaths_total, 1), 2)
            winrate = round(wins / count * 100)
            lines.append(f"\n📈 *5 dernières parties :*")
            lines.append(f"• K/D/A moyen : *{round(kills_total/count, 1)}/{round(deaths_total/count, 1)}/{round(assists_total/count, 1)}*")
            lines.append(f"• KDA : *{avg_kda}*")
            lines.append(f"• Winrate : *{winrate}%* ({wins}/5)")

    return "\n".join(lines)

async def _build_rank_text(name: str, tag: str) -> str:
    mmr = get_mmr(name, tag)
    if not mmr:
        return f"❌ Joueur *{name}#{tag}* introuvable ou non classé."

    lines = [f"🏆 *Rang — {name}#{tag}*\n", format_rank(mmr)]

    history = mmr.get("by_season", {})
    if history:
        last_seasons = list(history.items())[-3:]
        lines.append("\n📅 *Historique récent :*")
        for season, data in reversed(last_seasons):
            tier = data.get("final_rank_patched", "—")
            e = rank_emoji(tier)
            lines.append(f"• {season}: {e} {tier}")

    return "\n".join(lines)

async def _build_matches_text(name: str, tag: str) -> str:
    matches = get_matches(name, tag, 5)
    if not matches:
        return f"❌ Aucune partie trouvée pour *{name}#{tag}*."

    lines = [f"🕹️ *5 dernières parties — {name}#{tag}*\n"]
    for m in matches:
        lines.append(format_match(m, name, tag))
        lines.append("")

    return "\n".join(lines).strip()

# ── Callbacks boutons inline ──────────────────────────────────────────────────
async def button_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    parts = query.data.split("|", 2)
    if len(parts) != 3:
        return

    mode, name, tag = parts

    await query.message.edit_text(
        f"🔍 Chargement *{name}#{tag}*...", parse_mode="Markdown"
    )

    keyboard = [
        [
            InlineKeyboardButton("📊 Stats", callback_data=f"stats|{name}|{tag}"),
            InlineKeyboardButton("🏆 Rank", callback_data=f"rank|{name}|{tag}"),
            InlineKeyboardButton("🕹️ Matches", callback_data=f"matches|{name}|{tag}"),
        ]
    ]

    if mode == "rank":
        text = await _build_rank_text(name, tag)
    elif mode == "matches":
        text = await _build_matches_text(name, tag)
    else:
        text = await _build_stats_text(name, tag)

    await query.message.edit_text(
        text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard)
    )

# ── /annuler ──────────────────────────────────────────────────────────────────
async def annuler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Annulé.")
    return ConversationHandler.END

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()

    conv = ConversationHandler(
        entry_points=[
            CommandHandler("stats", cmd_stats),
            CommandHandler("rank", cmd_rank),
            CommandHandler("matches", cmd_matches),
        ],
        states={
            ASK_PLAYER: [MessageHandler(filters.TEXT & ~filters.COMMAND, receive_player)],
        },
        fallbacks=[CommandHandler("annuler", annuler)],
    )

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("aide", aide))
    app.add_handler(CommandHandler("help", aide))
    app.add_handler(CallbackQueryHandler(button_callback))
    app.add_handler(conv)

    print("🎮 voloranbot démarré !")
    app.run_polling()

if __name__ == "__main__":
    main()
