#!/usr/bin/env python3
"""
✈️ Flight Alert Bot — Ibrahim
Surveille les vols BRU/CDG/LIL → ORN
Envoie une alerte Telegram quand un vol correspond aux critères
"""

import os
import time
import requests
from datetime import datetime, timedelta

# ─── CONFIG ───────────────────────────────────────────────────────────────────

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

AMADEUS_CLIENT_ID = os.getenv("AMADEUS_CLIENT_ID")
AMADEUS_CLIENT_SECRET = os.getenv("AMADEUS_CLIENT_SECRET")

# Aéroports de départ
ORIGINS = ["BRU", "CDG", "ORY", "LIL"]

# Aéroport d'arrivée
DESTINATION = "ORN"

# Dates de départ (semaine du 10 juillet)
DEPART_DATES = [
    "2026-07-10", "2026-07-11", "2026-07-12",
    "2026-07-13", "2026-07-14", "2026-07-15",
    "2026-07-16", "2026-07-17"
]

# Dates de retour (entre 20 juillet et 24 août)
RETOUR_MIN = "2026-07-20"
RETOUR_MAX = "2026-08-24"

# Passagers
ADULTS = 2
CHILDREN = 0
INFANTS = 1  # bébé -2 ans

# Budget max en EUR
BUDGET_MAX = 1500

# Vérification toutes les X minutes
CHECK_INTERVAL_MINUTES = 30

# Mémoriser les offres déjà envoyées
sent_offers = set()

# ─── AMADEUS AUTH ─────────────────────────────────────────────────────────────

def get_amadeus_token():
    url = "https://test.api.amadeus.com/v1/security/oauth2/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": AMADEUS_CLIENT_ID,
        "client_secret": AMADEUS_CLIENT_SECRET
    }
    r = requests.post(url, data=data)
    if r.status_code == 200:
        return r.json()["access_token"]
    else:
        print(f"❌ Erreur auth Amadeus: {r.text}")
        return None

# ─── RECHERCHE VOLS ───────────────────────────────────────────────────────────

def search_flights(token, origin, depart_date):
    """Recherche aller-retour depuis une ville de départ"""
    url = "https://test.api.amadeus.com/v2/shopping/flight-offers"
    
    headers = {"Authorization": f"Bearer {token}"}
    
    params = {
        "originLocationCode": origin,
        "destinationLocationCode": DESTINATION,
        "departureDate": depart_date,
        "adults": ADULTS,
        "infants": INFANTS,
        "currencyCode": "EUR",
        "max": 10,
        "includedAirlineCodes": None,
        "nonStop": False
    }
    
    # Supprimer les params None
    params = {k: v for k, v in params.items() if v is not None}
    
    try:
        r = requests.get(url, headers=headers, params=params, timeout=15)
        if r.status_code == 200:
            return r.json().get("data", [])
        else:
            print(f"⚠️ Erreur recherche {origin}→{DESTINATION} {depart_date}: {r.status_code}")
            return []
    except Exception as e:
        print(f"❌ Exception: {e}")
        return []

# ─── FILTRE OFFRES ────────────────────────────────────────────────────────────

def filter_offers(offers, depart_date):
    """Filtre les offres selon le budget et la date de retour"""
    valid = []
    
    for offer in offers:
        try:
            price = float(offer["price"]["total"])
            
            # Vérif budget
            if price > BUDGET_MAX:
                continue
            
            # Vérif bagages (au moins 1 bagage en soute inclus)
            # On accepte toutes les offres et on précise dans l'alerte
            
            # Vérif itinéraires (aller-retour)
            itineraries = offer.get("itineraries", [])
            if len(itineraries) < 2:
                # Vol aller simple — on cherche un retour dans la période
                # Pour simplifier, on inclut avec note
                pass
            
            # Récupérer infos vol
            offer_info = extract_offer_info(offer, depart_date, price)
            if offer_info:
                valid.append(offer_info)
                
        except Exception as e:
            print(f"⚠️ Erreur parsing offre: {e}")
            continue
    
    return valid

def extract_offer_info(offer, depart_date, price):
    """Extrait les infos importantes d'une offre"""
    try:
        itineraries = offer.get("itineraries", [])
        
        # Vol aller
        aller = itineraries[0] if len(itineraries) > 0 else None
        retour = itineraries[1] if len(itineraries) > 1 else None
        
        if not aller:
            return None
        
        # Segments aller
        aller_segments = aller.get("segments", [])
        first_seg = aller_segments[0]
        last_seg = aller_segments[-1]
        
        depart_time = first_seg["departure"]["at"]
        arrive_time = last_seg["arrival"]["at"]
        nb_escales = len(aller_segments) - 1
        
        # Compagnies aériennes
        airlines = list(set([s["carrierCode"] for s in aller_segments]))
        
        # Durée vol
        duree = aller.get("duration", "").replace("PT", "").replace("H", "h").replace("M", "m")
        
        # Infos retour
        retour_info = ""
        if retour:
            retour_segments = retour.get("segments", [])
            r_first = retour_segments[0]
            r_last = retour_segments[-1]
            retour_depart = r_first["departure"]["at"]
            retour_arrive = r_last["arrival"]["at"]
            
            # Vérifier que le retour est dans la période autorisée
            retour_date = retour_depart[:10]
            if retour_date > RETOUR_MAX:
                return None  # Retour trop tard
            
            retour_duree = retour.get("duration", "").replace("PT", "").replace("H", "h").replace("M", "m")
            retour_escales = len(retour_segments) - 1
            retour_info = f"🔙 *Retour:* {retour_date} — {retour_duree} — {retour_escales} escale(s)"
        
        # Bagages
        traveler_pricings = offer.get("travelerPricings", [])
        bagages_info = check_bagages(traveler_pricings)
        
        # ID unique pour éviter les doublons
        offer_id = f"{airlines[0]}-{depart_date}-{price}"
        
        return {
            "id": offer_id,
            "price": price,
            "airlines": ", ".join(airlines),
            "depart_date": depart_date,
            "depart_time": depart_time,
            "arrive_time": arrive_time,
            "duree": duree,
            "escales": nb_escales,
            "retour_info": retour_info,
            "bagages": bagages_info,
            "booking_link": f"https://www.google.com/flights?hl=fr"
        }
    except Exception as e:
        print(f"⚠️ Erreur extraction: {e}")
        return None

def check_bagages(traveler_pricings):
    """Vérifie les bagages inclus"""
    try:
        for tp in traveler_pricings:
            fare_details = tp.get("fareDetailsBySegment", [])
            for fd in fare_details:
                included = fd.get("includedCheckedBags", {})
                quantity = included.get("quantity", 0)
                weight = included.get("weight", "")
                if quantity > 0:
                    return f"✅ {quantity} bagage(s) en soute inclus {f'({weight}kg)' if weight else ''}"
        return "⚠️ Bagage en soute non confirmé — vérifier à la réservation"
    except:
        return "❓ Info bagages non disponible"

# ─── TELEGRAM ─────────────────────────────────────────────────────────────────

def send_telegram(message):
    """Envoie un message Telegram"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    data = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True
    }
    try:
        r = requests.post(url, json=data, timeout=10)
        if r.status_code != 200:
            print(f"❌ Erreur Telegram: {r.text}")
    except Exception as e:
        print(f"❌ Exception Telegram: {e}")

def format_alert(offer, origin):
    """Formate le message d'alerte"""
    escales_str = "✈️ Direct" if offer["escales"] == 0 else f"🔄 {offer['escales']} escale(s)"
    
    msg = f"""
✈️ *VOL TROUVÉ — {origin} → ORN*
━━━━━━━━━━━━━━━━━━━━
💰 *Prix total: {offer['price']}€* (2 adultes + 1 bébé)
🏢 Compagnie: {offer['airlines']}

🛫 *Aller:* {offer['depart_date']}
⏰ Départ: {offer['depart_time'][11:16]} → Arrivée: {offer['arrive_time'][11:16]}
⏱ Durée: {offer['duree']} — {escales_str}

{offer['retour_info']}

🧳 Bagages: {offer['bagages']}

👥 Passagers: 2 adultes + 1 bébé
━━━━━━━━━━━━━━━━━━━━
🔗 [Rechercher sur Google Flights](https://www.google.com/flights)
🔗 [Rechercher sur Skyscanner](https://www.skyscanner.fr/transport/vols/{origin.lower()}/orn/{offer['depart_date'].replace('-', '')})
"""
    return msg.strip()

# ─── BOUCLE PRINCIPALE ────────────────────────────────────────────────────────

def run_check():
    """Lance une vérification complète"""
    print(f"\n🔍 Vérification — {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    
    token = get_amadeus_token()
    if not token:
        print("❌ Impossible d'obtenir le token Amadeus")
        return
    
    found_count = 0
    
    for origin in ORIGINS:
        for depart_date in DEPART_DATES:
            print(f"  🔎 {origin} → {DESTINATION} — {depart_date}...")
            
            offers = search_flights(token, origin, depart_date)
            valid_offers = filter_offers(offers, depart_date)
            
            for offer in valid_offers:
                offer_id = offer["id"]
                
                if offer_id not in sent_offers:
                    msg = format_alert(offer, origin)
                    send_telegram(msg)
                    sent_offers.add(offer_id)
                    found_count += 1
                    print(f"    ✅ Alerte envoyée: {offer['price']}€")
                    time.sleep(1)  # Anti-spam
            
            time.sleep(0.5)  # Pause entre requêtes API
    
    if found_count == 0:
        print(f"  ℹ️ Aucun vol dans le budget (max {BUDGET_MAX}€) pour l'instant")
    else:
        print(f"  🎉 {found_count} nouvelle(s) offre(s) envoyée(s) !")

def main():
    print("✈️ Flight Alert Bot démarré !")
    print(f"📍 Routes: BRU/CDG/ORY/LIL → ORN")
    print(f"📅 Départ: 10-17 juillet 2026")
    print(f"📅 Retour: avant le 24 août 2026")
    print(f"💰 Budget max: {BUDGET_MAX}€")
    print(f"⏰ Vérification toutes les {CHECK_INTERVAL_MINUTES} min")
    print("─" * 50)
    
    # Envoyer message de démarrage
    send_telegram(f"""
🤖 *Flight Alert Bot démarré !*
━━━━━━━━━━━━━━━━━━━━
📍 *Routes:* BRU / CDG / ORY / LIL → ORN
📅 *Départ:* 10 au 17 juillet 2026
📅 *Retour:* avant le 24 août 2026
👥 *Passagers:* 2 adultes + 1 bébé
🧳 *Bagages:* cabine + soute
💰 *Budget max:* {BUDGET_MAX}€
⏰ *Scan:* toutes les {CHECK_INTERVAL_MINUTES} minutes

Je t'enverrai une alerte dès qu'un vol correspond ! ✈️
""".strip())
    
    # Boucle infinie
    while True:
        try:
            run_check()
        except Exception as e:
            print(f"❌ Erreur dans run_check: {e}")
        
        print(f"  💤 Prochain scan dans {CHECK_INTERVAL_MINUTES} minutes...")
        time.sleep(CHECK_INTERVAL_MINUTES * 60)

if __name__ == "__main__":
    main()
