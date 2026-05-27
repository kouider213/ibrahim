"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSmartReminders = getSmartReminders;
const supabase_js_1 = require("../integrations/supabase.js");
async function getSmartReminders() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const in3days = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const in48h = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const reminders = [];
    // 1. Arrivals tomorrow
    const { data: arrivingTomorrow } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, client_phone, client_age, client_passport, start_date, end_date, final_price, paid_amount, payment_status, cars(name)')
        .in('status', ['CONFIRMED'])
        .eq('start_date', tomorrow);
    for (const b of (arrivingTomorrow ?? [])) {
        const car = b.cars?.name ?? '?';
        // Arrival reminder
        reminders.push({
            type: 'arrival_tomorrow',
            priority: 'HIGH',
            client_name: b.client_name,
            car_name: car,
            date: b.start_date,
            message: `${b.client_name} prend ${car} demain${b.client_phone ? ` — ${b.client_phone}` : ''}`,
            action: 'Préparer le véhicule et vérifier les documents',
        });
        // Vehicle prep reminder
        reminders.push({
            type: 'vehicle_prep',
            priority: 'HIGH',
            client_name: b.client_name,
            car_name: car,
            date: b.start_date,
            message: `${car} doit être prêt pour ${b.client_name} demain`,
            action: 'Laver, vérifier niveaux, plein carburant, état extérieur',
        });
        // Missing passport
        if (!b.client_passport) {
            reminders.push({
                type: 'missing_passport',
                priority: 'HIGH',
                client_name: b.client_name,
                car_name: car,
                date: b.start_date,
                message: `Passeport manquant pour ${b.client_name} (arrivée demain)`,
                action: 'Demander scan passeport avant remise des clés',
            });
        }
        // Age alert
        if (b.client_age && b.client_age < 35) {
            reminders.push({
                type: 'age_alert',
                priority: 'HIGH',
                client_name: b.client_name,
                car_name: car,
                date: b.start_date,
                message: `⚠️ ${b.client_name} a ${b.client_age} ans — politique Fik: refus <35 ans`,
                action: 'Vérifier avec Houari avant confirmation',
            });
        }
    }
    // 2. Missing deposit — booking in ≤3 days, 0€ paid
    const { data: noDeposit } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, client_phone, start_date, final_price, paid_amount, cars(name)')
        .eq('status', 'CONFIRMED')
        .eq('paid_amount', 0)
        .lte('start_date', in3days)
        .gt('start_date', today);
    for (const b of (noDeposit ?? [])) {
        const car = b.cars?.name ?? '?';
        const daysLeft = Math.ceil((new Date(b.start_date).getTime() - Date.now()) / 86_400_000);
        reminders.push({
            type: 'missing_deposit',
            priority: daysLeft <= 1 ? 'HIGH' : 'MEDIUM',
            client_name: b.client_name,
            car_name: car,
            date: b.start_date,
            message: `Acompte 0€ — ${b.client_name} arrive dans ${daysLeft}j pour ${car} (total ${b.final_price}€)`,
            action: 'Contacter le client pour acompte 30% minimum',
        });
    }
    // 3. Vehicles returning soon (next 48h)
    const { data: returningSoon } = await supabase_js_1.supabase
        .from('bookings')
        .select('id, client_name, client_phone, end_date, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE'])
        .gte('end_date', today)
        .lte('end_date', in48h);
    for (const b of (returningSoon ?? [])) {
        if (b.end_date === today)
            continue; // already handled elsewhere
        const car = b.cars?.name ?? '?';
        reminders.push({
            type: 'return_soon',
            priority: 'MEDIUM',
            client_name: b.client_name,
            car_name: car,
            date: b.end_date,
            message: `${b.client_name} rend ${car} le ${b.end_date}${b.client_phone ? ` — ${b.client_phone}` : ''}`,
            action: 'Confirmer heure de retour et état du véhicule',
        });
    }
    // Deduplicate by type + client + date
    const seen = new Set();
    return reminders.filter(r => {
        const key = `${r.type}:${r.client_name}:${r.date}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=smart-reminders.js.map