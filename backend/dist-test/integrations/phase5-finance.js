"use strict";
/**
 * PHASE 5 — Dzaryx gère tes finances
 * 1. Suivi encaissements & acomptes
 * 2. Calcul CA automatique (semaine/mois/année/véhicule)
 * 3. Relance clients impayés
 * 4. Génération reçu PDF simple
 * 5. Tableau de bord financier
 * 6. Alerte dépense anormale
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentStatus = getPaymentStatus;
exports.recordPayment = recordPayment;
exports.getCAReport = getCAReport;
exports.getUnpaidBookings = getUnpaidBookings;
exports.generateRelanceMessage = generateRelanceMessage;
exports.generateReceipt = generateReceipt;
exports.getFinancialDashboard = getFinancialDashboard;
exports.checkAnomalies = checkAnomalies;
exports.generatePdfReceipt = generatePdfReceipt;
exports.getDashboardData = getDashboardData;
const supabase_js_1 = require("./supabase.js");
const pricing_js_1 = require("../config/pricing.js");
function resolveFinancials(b) {
    const nb_days = b.nb_days ?? Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000));
    const discount_applied = b.discount_applied ?? 0;
    // client_ppd: prix négocié réel (jamais catalogue)
    let client_ppd;
    if (b.client_price_per_day != null && b.client_price_per_day > 0) {
        client_ppd = b.client_price_per_day;
    }
    else if (b.final_price != null && b.final_price > 0) {
        client_ppd = Math.round((b.final_price / nb_days) * 100) / 100;
    }
    else {
        client_ppd = null;
    }
    // owner_ppd: prix Houari réel (jamais catalogue)
    const owner_ppd = (b.owner_price_per_day != null && b.owner_price_per_day > 0)
        ? b.owner_price_per_day
        : null;
    const gross_ca = client_ppd != null
        ? Math.round(client_ppd * nb_days * 100) / 100
        : (b.final_price ?? null);
    const owner_cost = owner_ppd != null
        ? Math.round(owner_ppd * nb_days * 100) / 100
        : null;
    const profit = (client_ppd != null && owner_ppd != null)
        ? Math.round((client_ppd - owner_ppd) * nb_days * 100) / 100
        : null;
    const data_complete = client_ppd != null && owner_ppd != null;
    return { nb_days, client_ppd, owner_ppd, gross_ca, owner_cost, profit, data_complete, discount_applied };
}
// ─────────────────────────────────────────────
// 1. SUIVI ENCAISSEMENTS & ACOMPTES
// ─────────────────────────────────────────────
async function getPaymentStatus(bookingId) {
    let query = supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, client_phone, final_price, paid_amount, payment_status, last_payment_date, start_date, end_date, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);
    if (bookingId)
        query = query.eq('id', bookingId);
    const { data, error } = await query.order('start_date', { ascending: false }).limit(20);
    if (error)
        return `Erreur: ${error.message}`;
    if (!data?.length)
        return 'Aucune réservation trouvée.';
    const rows = data.map(b => {
        const paid = b.paid_amount ?? 0;
        const total = b.final_price ?? 0;
        const remaining = total - paid;
        const st = paid >= total ? '✅ PAYÉ' : paid > 0 ? '⚠️ PARTIEL' : '❌ IMPAYÉ';
        const car = b.cars?.name ?? '?';
        return `- ${b.client_name} | ${car} | ${b.start_date}→${b.end_date} | Total: ${total}€ | Payé: ${paid}€ | Reste: ${remaining}€ | ${st}`;
    });
    const totalImpaye = data.reduce((sum, b) => {
        const paid = b.paid_amount ?? 0;
        const total = b.final_price ?? 0;
        return sum + Math.max(0, total - paid);
    }, 0);
    return `💰 ENCAISSEMENTS (${data.length} réservations):\n${rows.join('\n')}\n\n💸 Total restant à encaisser: ${totalImpaye}€`;
}
async function recordPayment(bookingId, amount, type = 'partiel', note) {
    if (!bookingId)
        return '❌ booking_id manquant';
    if (!amount || amount <= 0)
        return '❌ Le montant doit être supérieur à 0';
    const { data: booking, error: fetchErr } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, final_price, paid_amount, acompte_amount')
        .eq('id', bookingId)
        .single();
    if (fetchErr || !booking)
        return `Réservation introuvable: ${fetchErr?.message}`;
    const b = booking;
    const currentPaid = b.paid_amount ?? 0;
    const newPaid = currentPaid + amount;
    const total = b.final_price ?? 0;
    const newStatus = newPaid >= total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING';
    // Mise à jour acompte si c'est un acompte
    const updateData = {
        paid_amount: newPaid,
        payment_status: newStatus,
        last_payment_date: new Date().toISOString().split('T')[0],
        payment_notes: note ?? null,
        solde_paid: newPaid >= total,
    };
    if (type === 'acompte') {
        updateData.acompte_amount = (b.acompte_amount ?? 0) + amount;
        updateData.acompte_date = new Date().toISOString().split('T')[0];
    }
    // Log dans payment_logs
    await supabase_js_1.supabase.from('payment_logs').insert({
        booking_id: bookingId,
        amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        note: `[${type}] ${note ?? ''}`.trim(),
    });
    const { error } = await supabase_js_1.supabase
        .from('bookings')
        .update(updateData)
        .eq('id', bookingId);
    if (error)
        return `Erreur enregistrement paiement: ${error.message}`;
    const remaining = total - newPaid;
    const statusEmoji = newStatus === 'PAID' ? '✅' : '⚠️';
    return `${statusEmoji} Paiement enregistré!\n` +
        `👤 Client: ${b.client_name}\n` +
        `💵 Type: ${type.toUpperCase()}\n` +
        `➕ Montant encaissé: +${amount}€\n` +
        `💰 Total payé: ${newPaid}€ / ${total}€\n` +
        `📊 Reste: ${remaining}€\n` +
        `🏷️ Statut: ${newStatus}` +
        (remaining <= 0 ? '\n\n🎉 Réservation entièrement payée!' : '');
}
// ─────────────────────────────────────────────
// 2. CALCUL CA AUTOMATIQUE
// ─────────────────────────────────────────────
async function getCAReport(year, month, week) {
    let startDate;
    let endDate;
    let period;
    if (week !== undefined && month !== undefined) {
        const firstDay = new Date(year, month - 1, 1);
        const startW = new Date(firstDay);
        startW.setDate(firstDay.getDate() + (week - 1) * 7);
        const endW = new Date(startW);
        endW.setDate(startW.getDate() + 6);
        startDate = startW.toISOString().split('T')[0];
        endDate = endW.toISOString().split('T')[0];
        period = `Semaine ${week} — ${month}/${year}`;
    }
    else if (month !== undefined) {
        const mm = String(month).padStart(2, '0');
        startDate = `${year}-${mm}-01`;
        endDate = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
        period = `${mm}/${year}`;
    }
    else {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        period = String(year);
    }
    // Réservations dont la période CHEVAUCHE l'intervalle demandé
    const { data, error } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, final_price, client_price_per_day, owner_price_per_day, nb_days, start_date, end_date, rented_by, status, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
        .lte('start_date', endDate)
        .gte('end_date', startDate)
        .order('start_date');
    if (error)
        return `Erreur CA: ${error.message}`;
    if (!data?.length)
        return `Aucune réservation pour ${period}.`;
    const byVehicle = {};
    let totalGrossCA = 0;
    let totalProfit = 0;
    let totalOwnerCost = 0;
    let totalKouider = 0;
    let totalHouari = 0;
    let missingOwnerPpd = 0;
    for (const b of data) {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        const carName = carArr?.name ?? 'Inconnu';
        const rentedBy = b.rented_by ?? 'Kouider';
        const fin = resolveFinancials(b);
        const grossCA = fin.gross_ca ?? 0;
        if (!byVehicle[carName])
            byVehicle[carName] = { count: 0, grossCA: 0, profit: 0, ownerCost: 0 };
        byVehicle[carName].count++;
        byVehicle[carName].grossCA += grossCA;
        byVehicle[carName].ownerCost += fin.owner_cost ?? 0;
        byVehicle[carName].profit += rentedBy === 'Houari' ? 0 : (fin.profit ?? 0);
        totalGrossCA += grossCA;
        totalOwnerCost += fin.owner_cost ?? 0;
        totalProfit += rentedBy === 'Houari' ? 0 : (fin.profit ?? 0);
        if (fin.owner_ppd == null && rentedBy !== 'Houari')
            missingOwnerPpd++;
        if (rentedBy === 'Houari')
            totalHouari++;
        else
            totalKouider++;
    }
    const vehicleRows = Object.entries(byVehicle)
        .sort(([, a], [, b]) => b.grossCA - a.grossCA)
        .map(([name, v]) => `  - ${name}: ${v.count} loc. | CA: ${v.grossCA}€ | Houari: ${v.ownerCost}€ | Bénéfice Kouider: ${v.profit}€`);
    const missingWarn = missingOwnerPpd > 0
        ? `\n⚠️ DONNÉES MANQUANTES: ${missingOwnerPpd} résa sans owner_price_per_day → bénéfice partiel\n   Impossible de calculer sans données financières réelles pour ces réservations.\n`
        : '';
    return `📊 CHIFFRE D'AFFAIRES — ${period}\n` +
        `${'─'.repeat(40)}\n` +
        `📈 CA Brut (prix réels clients): ${totalGrossCA}€\n` +
        `🏢 Coût Houari (prix réels):     ${totalOwnerCost}€\n` +
        `💰 Bénéfice Kouider NET:         ${totalProfit}€\n` +
        `📋 Réservations: ${data.length} (Kouider: ${totalKouider} | Houari: ${totalHouari})\n` +
        missingWarn +
        `\n🚗 PAR VÉHICULE:\n${vehicleRows.join('\n')}`;
}
// ─────────────────────────────────────────────
// 3. RELANCE CLIENTS IMPAYÉS
// ─────────────────────────────────────────────
async function getUnpaidBookings() {
    const now = new Date();
    const { data, error } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, client_phone, final_price, paid_amount, payment_status, start_date, end_date, created_at, cars(name)')
        .in('payment_status', ['PENDING', 'PARTIAL'])
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
        .order('start_date', { ascending: false });
    if (error)
        return `Erreur: ${error.message}`;
    if (!data?.length)
        return '✅ Aucun impayé — tout est à jour!';
    const rows = data.map(b => {
        const paid = b.paid_amount ?? 0;
        const total = b.final_price ?? 0;
        const remaining = total - paid;
        const created = new Date(b.created_at);
        const hoursAgo = Math.floor((now.getTime() - created.getTime()) / 3_600_000);
        const daysAgo = Math.floor(hoursAgo / 24);
        const urgence = hoursAgo >= 72 ? '🔴' : hoursAgo >= 48 ? '🟡' : '🟢';
        const car = b.cars?.name ?? '?';
        return `${urgence} ${b.client_name} | ${car} | Reste: ${remaining}€ | Depuis: ${daysAgo}j ${hoursAgo % 24}h | 📱 ${b.client_phone ?? 'N/A'}`;
    });
    const urgent = data.filter(b => {
        const hoursAgo = Math.floor((now.getTime() - new Date(b.created_at).getTime()) / 3_600_000);
        return hoursAgo >= 48;
    }).length;
    return `⚠️ IMPAYÉS (${data.length} clients | ${urgent} urgents):\n${rows.join('\n')}\n\n` +
        `🔴 = +72h (relance urgente) | 🟡 = +48h (relance normale) | 🟢 = récent`;
}
// Message de relance WhatsApp
function generateRelanceMessage(clientName, amount, carName, attempt) {
    if (attempt === 1) {
        return `Bonjour ${clientName} 👋\n\nNous vous rappelons que le paiement de ${amount}€ pour la location de votre ${carName} est en attente.\n\nMerci de régulariser votre situation dès que possible.\n\n📞 AutoLux Oran — Fik Conciergerie`;
    }
    else {
        return `Bonjour ${clientName},\n\nMalgré notre premier rappel, le paiement de ${amount}€ pour la location de votre ${carName} reste impayé.\n\nNous vous demandons de régulariser cette situation dans les plus brefs délais pour éviter toute complication.\n\n📞 AutoLux Oran — Fik Conciergerie`;
    }
}
// ─────────────────────────────────────────────
// 4. GÉNÉRATION REÇU SIMPLE (texte formaté)
// ─────────────────────────────────────────────
async function generateReceipt(bookingId) {
    const { data: b, error } = await supabase_js_1.supabase
        .from('bookings')
        .select('*, cars(name)')
        .eq('id', bookingId)
        .single();
    if (error || !b)
        return `Réservation introuvable: ${error?.message}`;
    const booking = b;
    const carName = booking.cars?.name ?? 'Véhicule';
    const startDt = new Date(booking.start_date);
    const endDt = new Date(booking.end_date);
    const nbDays = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const daily = Math.round(booking.final_price / nbDays);
    const acompte = booking.acompte_amount ?? 0;
    const solde = (booking.final_price ?? 0) - acompte;
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const refNum = booking.id.split('-')[0].toUpperCase();
    const receipt = `
╔══════════════════════════════════════╗
║        AUTOLUX ORAN — REÇU           ║
║        Fik Conciergerie              ║
╠══════════════════════════════════════╣
  Réf: #${refNum}
  Date: ${dateStr}
──────────────────────────────────────
  CLIENT
  Nom: ${booking.client_name}
  Tél: ${booking.client_phone ?? 'N/A'}
──────────────────────────────────────
  LOCATION
  Véhicule: ${carName}
  Du: ${booking.start_date}
  Au: ${booking.end_date}
  Durée: ${nbDays} jour(s)
  Prix/jour: ${daily}€
──────────────────────────────────────
  PAIEMENT
  Total: ${booking.final_price}€
  Acompte versé: ${acompte}€
  Solde à payer: ${solde}€
  Statut: ${booking.payment_status ?? 'PENDING'}
╚══════════════════════════════════════╝
  Merci pour votre confiance!
  📍 Oran, Algérie
`.trim();
    return receipt;
}
// ─────────────────────────────────────────────
// 5. TABLEAU DE BORD FINANCIER
// ─────────────────────────────────────────────
async function getFinancialDashboard() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    // Mois courant
    const mm = String(month).padStart(2, '0');
    const ppm = String(prevMonth).padStart(2, '0');
    const curEnd = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    const prevEnd = `${prevYear}-${ppm}-${new Date(prevYear, prevMonth, 0).getDate()}`;
    const [curRes, prevRes, unpaidRes] = await Promise.all([
        supabase_js_1.supabase
            .from('bookings')
            .select('final_price, client_price_per_day, owner_price_per_day, paid_amount, payment_status, rented_by, nb_days, start_date, end_date, cars(name)')
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', curEnd)
            .gte('end_date', `${year}-${mm}-01`),
        supabase_js_1.supabase
            .from('bookings')
            .select('final_price, client_price_per_day, owner_price_per_day, rented_by, nb_days, start_date, end_date, cars(name)')
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', prevEnd)
            .gte('end_date', `${prevYear}-${ppm}-01`),
        supabase_js_1.supabase
            .from('bookings')
            .select('final_price, paid_amount')
            .in('payment_status', ['PENDING', 'PARTIAL'])
            .in('status', ['CONFIRMED', 'ACTIVE']),
    ]);
    const curData = (curRes.data ?? []);
    const prevData = (prevRes.data ?? []);
    const unpaid = (unpaidRes.data ?? []);
    // Calculs mois courant — prix réels uniquement
    const curData2 = curData.map((b) => {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        return { ...b, cars: carArr };
    });
    const curCA = curData2.reduce((s, b) => s + (resolveFinancials(b).gross_ca ?? 0), 0);
    const curProfit = curData2.reduce((s, b) => {
        const fin = resolveFinancials(b);
        return s + ((b.rented_by ?? 'Kouider') === 'Houari' ? 0 : (fin.profit ?? 0));
    }, 0);
    const curEncaisse = curData.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
    // Calculs mois précédent — prix réels
    const prevCA = prevData.reduce((s, b) => {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        return s + (resolveFinancials({ ...b, cars: carArr }).gross_ca ?? 0);
    }, 0);
    // Évolution
    const evol = prevCA > 0 ? Math.round(((curCA - prevCA) / prevCA) * 100) : 0;
    const evolEmoji = evol >= 0 ? '📈' : '📉';
    // Impayés
    const totalImpaye = unpaid.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)), 0);
    // Prévision mois suivant (basée sur mois courant + 10% croissance)
    const nextMonthForecast = Math.round(curCA * 1.1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysElapsed = now.getDate();
    const dailyAvg = daysElapsed > 0 ? Math.round(curCA / daysElapsed) : 0;
    const projectedMonth = Math.round(dailyAvg * daysInMonth);
    return `📊 TABLEAU DE BORD FINANCIER\n` +
        `${'═'.repeat(40)}\n` +
        `📅 ${mm}/${year}\n\n` +
        `💰 REVENUS\n` +
        `  CA Mois courant:    ${curCA}€\n` +
        `  CA Mois précédent:  ${prevCA}€\n` +
        `  Évolution:          ${evolEmoji} ${evol > 0 ? '+' : ''}${evol}%\n` +
        `  Encaissé:           ${curEncaisse}€\n` +
        `  À encaisser:        ${totalImpaye}€\n\n` +
        `💵 BÉNÉFICE KOUIDER\n` +
        `  Bénéfice mois:      ${curProfit}€\n\n` +
        `🔮 PRÉVISIONS\n` +
        `  Projection mois:    ${projectedMonth}€\n` +
        `  Mois prochain (est): ${nextMonthForecast}€\n` +
        `  Moyenne/jour:        ${dailyAvg}€\n\n` +
        `📋 ACTIVITÉ\n` +
        `  Réservations:       ${curData.length}\n` +
        `  Impayés:            ${unpaid.length} client(s) (${totalImpaye}€)`;
}
// ─────────────────────────────────────────────
// 6. ALERTE DÉPENSE ANORMALE
// ─────────────────────────────────────────────
async function checkAnomalies() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const mm = String(month).padStart(2, '0');
    const { data, error } = await supabase_js_1.supabase
        .from('bookings')
        .select('client_name, final_price, start_date, end_date, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
        .gte('start_date', `${year}-${mm}-01`)
        .lte('start_date', `${year}-${mm}-${new Date(year, month, 0).getDate()}`);
    if (error)
        return `Erreur: ${error.message}`;
    if (!data?.length)
        return 'Aucune donnée pour analyse.';
    const alerts = [];
    for (const b of data) {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        const carName = carArr?.name ?? '?';
        const fin = resolveFinancials({ ...b, cars: carArr });
        const pricing = (0, pricing_js_1.getPricingForVehicle)(carName);
        // Alerte : prix client < prix Houari → perte réelle (seulement si les deux renseignés)
        if (fin.client_ppd != null && fin.owner_ppd != null && fin.client_ppd < fin.owner_ppd) {
            alerts.push(`🔴 PERTE RÉELLE: ${b.client_name} | ${carName} | client ${fin.client_ppd}€/j < Houari ${fin.owner_ppd}€/j → perte ${Math.round((fin.owner_ppd - fin.client_ppd) * fin.nb_days)}€`);
        }
        // Alerte : owner_price_per_day manquant → profit inconnu
        if (fin.owner_ppd == null && (b.rented_by ?? 'Kouider') !== 'Houari') {
            alerts.push(`⚠️ PROFIT INCONNU: ${b.client_name} | ${carName} | owner_price_per_day absent → Impossible de calculer sans données financières réelles`);
        }
        // Alerte : remise > 30% vs catalogue (informatif — pas utilisé pour calculs)
        if (pricing && fin.client_ppd != null && pricing.kouiderPrice > 0) {
            const diff = pricing.kouiderPrice - fin.client_ppd;
            const pct = Math.round((diff / pricing.kouiderPrice) * 100);
            if (pct > 30) {
                alerts.push(`🟡 Remise importante: ${b.client_name} | ${carName} | ${fin.client_ppd}€/j (catalogue ref: ${pricing.kouiderPrice}€/j, écart ${pct}%)`);
            }
        }
        // Alerte : grande réservation > 2000€
        const total = fin.gross_ca ?? (b.final_price ?? 0);
        if (total > 2000) {
            alerts.push(`🔵 Grande réservation: ${b.client_name} | ${carName} | ${total}€ total`);
        }
    }
    if (!alerts.length)
        return '✅ Aucune anomalie détectée ce mois-ci.';
    return `🚨 ANOMALIES DÉTECTÉES (${alerts.length}):\n${alerts.join('\n')}`;
}
// ─────────────────────────────────────────────
// 7. GÉNÉRATION PDF FACTURE
// ─────────────────────────────────────────────
async function generatePdfReceipt(bookingId) {
    const { data: b, error } = await supabase_js_1.supabase
        .from('bookings').select('*, cars(name)').eq('id', bookingId).single();
    if (error || !b)
        throw new Error(`Réservation introuvable: ${error?.message}`);
    const booking = b;
    const carName = booking.cars?.name ?? 'Véhicule';
    const startDt = new Date(booking.start_date);
    const endDt = new Date(booking.end_date);
    const nbDays = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const daily = Math.round((booking.final_price ?? 0) / nbDays);
    const acompte = booking.acompte_amount ?? 0;
    const solde = (booking.final_price ?? 0) - acompte;
    const refNum = booking.id.split('-')[0].toUpperCase();
    const dateStr = new Date().toLocaleDateString('fr-FR');
    // Génération PDF avec pdfkit
    const PDFDocument = (await Promise.resolve().then(() => __importStar(require('pdfkit')))).default;
    const pdfBuffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // En-tête
        doc.fontSize(22).font('Helvetica-Bold').text('AUTOLUX ORAN', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Fik Conciergerie — Location de véhicules', { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        // Référence et date
        doc.fontSize(11).font('Helvetica-Bold').text(`FACTURE / REÇU  #${refNum}`, { continued: true });
        doc.font('Helvetica').text(`     Date: ${dateStr}`, { align: 'right' });
        doc.moveDown(1);
        // Client
        doc.fontSize(12).font('Helvetica-Bold').text('CLIENT');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica')
            .text(`Nom:       ${booking.client_name}`)
            .text(`Téléphone: ${booking.client_phone ?? 'N/A'}`)
            .text(`Âge:       ${booking.client_age ?? 'N/A'}`);
        doc.moveDown(1);
        // Location
        doc.fontSize(12).font('Helvetica-Bold').text('DÉTAIL DE LA LOCATION');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica')
            .text(`Véhicule:    ${carName}`)
            .text(`Début:       ${booking.start_date}`)
            .text(`Fin:         ${booking.end_date}`)
            .text(`Durée:       ${nbDays} jour(s)`)
            .text(`Prix/jour:   ${daily} €`);
        doc.moveDown(1);
        // Paiement
        doc.fontSize(12).font('Helvetica-Bold').text('PAIEMENT');
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(11).font('Helvetica')
            .text(`Total:          ${booking.final_price ?? 0} €`)
            .text(`Acompte versé:  ${acompte} €`)
            .text(`Solde restant:  ${solde} €`)
            .text(`Statut:         ${booking.payment_status ?? 'PENDING'}`);
        doc.moveDown(1.5);
        // Pied de page
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('gray')
            .text('Merci pour votre confiance — AutoLux Oran, Algérie', { align: 'center' });
        doc.end();
    });
    // Upload Supabase Storage
    const storagePath = `receipts/${bookingId}.pdf`;
    const BUCKET = 'client-documents';
    await supabase_js_1.supabase.storage.createBucket(BUCKET, { public: true }).catch(() => { });
    await supabase_js_1.supabase.storage.from(BUCKET).upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
    });
    const { data: urlData } = supabase_js_1.supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const url = urlData.publicUrl;
    // Sauvegarder l'URL dans la réservation
    await supabase_js_1.supabase.from('bookings').update({ pdf_url: url }).eq('id', bookingId);
    const text = `✅ Facture PDF générée pour ${booking.client_name}\n🔗 ${url}`;
    return { url, text };
}
async function getDashboardData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const mm = String(month).padStart(2, '0');
    const ppm = String(prevMonth).padStart(2, '0');
    const curEndDate = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    const prevEndDate = `${prevYear}-${ppm}-${new Date(prevYear, prevMonth, 0).getDate()}`;
    const [curRes, prevRes, unpaidRes] = await Promise.all([
        supabase_js_1.supabase.from('bookings')
            .select('id, final_price, client_price_per_day, owner_price_per_day, nb_days, paid_amount, payment_status, rented_by, start_date, end_date, cars(name)')
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', curEndDate)
            .gte('end_date', `${year}-${mm}-01`),
        supabase_js_1.supabase.from('bookings')
            .select('final_price, client_price_per_day, owner_price_per_day, nb_days, rented_by, start_date, end_date, cars(name)')
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', prevEndDate)
            .gte('end_date', `${prevYear}-${ppm}-01`),
        supabase_js_1.supabase.from('bookings')
            .select('id, client_name, client_phone, final_price, paid_amount, cars(name)')
            .in('payment_status', ['PENDING', 'PARTIAL'])
            .in('status', ['CONFIRMED', 'ACTIVE']),
    ]);
    const cur = (curRes.data ?? []);
    const prev = (prevRes.data ?? []);
    const unpaid = (unpaidRes.data ?? []);
    // Revenus réels : client_price_per_day × nb_days (jamais catalogue)
    const curCA = cur.reduce((s, b) => {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        return s + (resolveFinancials({ ...b, cars: carArr }).gross_ca ?? 0);
    }, 0);
    const prevCA = prev.reduce((s, b) => {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        return s + (resolveFinancials({ ...b, cars: carArr }).gross_ca ?? 0);
    }, 0);
    const evol = prevCA > 0 ? Math.round(((curCA - prevCA) / prevCA) * 100) : 0;
    const collected = cur.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
    const outstanding = unpaid.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)), 0);
    // Profit réel : client_ppd - owner_ppd (null si owner_ppd manquant)
    const profit = cur.reduce((s, b) => {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        const fin = resolveFinancials({ ...b, cars: carArr });
        return s + ((b.rented_by ?? 'Kouider') === 'Houari' ? 0 : (fin.profit ?? 0));
    }, 0);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyAvg = now.getDate() > 0 ? Math.round(curCA / now.getDate()) : 0;
    // Répartition par véhicule — prix réels
    const vehicleMap = {};
    for (const b of cur) {
        const carArr = Array.isArray(b.cars) ? b.cars[0] : b.cars;
        const name = carArr?.name ?? 'Inconnu';
        const fin = resolveFinancials({ ...b, cars: carArr });
        if (!vehicleMap[name])
            vehicleMap[name] = { ca: 0, bookings: 0 };
        vehicleMap[name].ca += fin.gross_ca ?? 0;
        vehicleMap[name].bookings++;
    }
    const vehicles = Object.entries(vehicleMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.ca - a.ca);
    return {
        month, year,
        ca: { current: curCA, previous: prevCA, evolution: evol },
        payments: { collected, outstanding },
        profit,
        forecast: { projected: dailyAvg * daysInMonth, nextMonth: Math.round(curCA * 1.1), dailyAvg },
        unpaid: unpaid.map(b => ({
            id: b.id, name: b.client_name, car: b.cars?.name ?? '?',
            amount: Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)),
            phone: b.client_phone ?? undefined,
        })),
        vehicles,
        bookingCount: cur.length,
    };
}
//# sourceMappingURL=phase5-finance.js.map