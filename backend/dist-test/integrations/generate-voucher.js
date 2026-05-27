"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReservationVoucher = generateReservationVoucher;
const pdfkit_1 = __importDefault(require("pdfkit"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const supabase_js_1 = require("./supabase.js");
const env_js_1 = require("../config/env.js");
const anthropic = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY ?? '' });
async function generateReservationVoucher(bookingId) {
    // 1. Réservation + voiture
    const { data: booking, error } = await supabase_js_1.supabase
        .from('bookings')
        .select('*, cars(name, category)')
        .eq('id', bookingId)
        .single();
    if (error || !booking)
        throw new Error(`Réservation introuvable: ${bookingId}`);
    // 2. Infos passeport/permis (OCR déjà fait)
    let passportInfo = {};
    const tryParseNotes = (notes) => {
        if (!notes)
            return {};
        try {
            const parsed = JSON.parse(String(notes));
            // Vérifier que c'est bien des données passeport (pas juste un texte JSON aléatoire)
            if (parsed['passport_number'] || parsed['license_number'] || parsed['birth_date'])
                return parsed;
        }
        catch { /* ignore */ }
        return {};
    };
    let foundDocUrl = null;
    const applyDoc = (doc) => {
        if (doc.file_url && !foundDocUrl)
            foundDocUrl = doc.file_url;
        if (Object.keys(passportInfo).length === 0)
            passportInfo = tryParseNotes(doc.notes);
    };
    // Priorité 1 : document lié directement à cette réservation
    const { data: docsByBooking } = await supabase_js_1.supabase
        .from('client_documents')
        .select('notes, type, file_url')
        .eq('booking_id', bookingId)
        .in('type', ['passport', 'license'])
        .order('created_at', { ascending: false })
        .limit(1);
    if (docsByBooking?.[0])
        applyDoc(docsByBooking[0]);
    // Priorité 2 : par téléphone client
    if (Object.keys(passportInfo).length === 0 && booking['client_phone']) {
        const { data: docsByPhone } = await supabase_js_1.supabase
            .from('client_documents')
            .select('notes, type, file_url')
            .ilike('client_phone', `%${String(booking['client_phone']).replace(/\s/g, '')}%`)
            .in('type', ['passport', 'license'])
            .order('created_at', { ascending: false })
            .limit(1);
        if (docsByPhone?.[0])
            applyDoc(docsByPhone[0]);
    }
    // Priorité 3 : par prénom
    if (Object.keys(passportInfo).length === 0) {
        const firstName = String(booking['client_name'] ?? '').split(' ')[0] ?? '';
        const { data: docsByName } = await supabase_js_1.supabase
            .from('client_documents')
            .select('notes, type, file_url')
            .ilike('client_name', `%${firstName}%`)
            .in('type', ['passport', 'license'])
            .order('created_at', { ascending: false })
            .limit(1);
        if (docsByName?.[0])
            applyDoc(docsByName[0]);
    }
    // Fallback OCR : si pas de données JSON mais on a l'URL de la photo → re-OCR à la volée
    if (Object.keys(passportInfo).length === 0 && foundDocUrl) {
        try {
            console.log('[voucher] OCR fallback on:', foundDocUrl);
            const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
            const { data: imgData } = await axios.get(foundDocUrl, {
                responseType: 'arraybuffer',
                timeout: 15_000,
                headers: { 'User-Agent': 'Dzaryx-AI/1.0' },
            });
            const buf = Buffer.from(imgData);
            const b64 = buf.toString('base64');
            console.log('[voucher] Image fetched, size:', buf.length, 'bytes — running OCR...');
            const ocrResp = await anthropic.messages.create({
                model: 'claude-sonnet-4-6',
                max_tokens: 300,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
                            { type: 'text', text: 'Extrais les infos de ce passeport. JSON UNIQUEMENT:\n{"name":"","passport_number":"","birth_date":"","expiry_date":"","nationality":""}' },
                        ],
                    }],
            });
            const raw = ocrResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
                passportInfo = JSON.parse(match[0]);
                console.log('[voucher] OCR fallback success:', JSON.stringify(passportInfo));
                // Mettre à jour les notes en DB pour éviter de re-OCR à chaque fois
                const filename = String(foundDocUrl).split('/').pop() ?? '';
                supabase_js_1.supabase
                    .from('client_documents')
                    .update({ notes: JSON.stringify(passportInfo) })
                    .ilike('file_url', `%${filename}%`)
                    .then(() => { }, () => { });
            }
        }
        catch (ocrErr) {
            console.error('[voucher] OCR fallback failed:', ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
        }
    }
    // 3. Générer PDF
    const pdfBuffer = await buildPDF(booking, passportInfo);
    // 4. Upload Supabase Storage (bucket client-documents, dossier vouchers/)
    const safeName = String(booking['client_name'] ?? 'client').replace(/[^a-zA-Z0-9]/g, '_');
    const storagePath = `vouchers/BON_${safeName}_${String(booking['start_date'] ?? '')}.pdf`;
    await supabase_js_1.supabase.storage.createBucket('client-documents', { public: true }).catch(() => { });
    await supabase_js_1.supabase.storage.from('client-documents').upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
    });
    const { data: urlData } = supabase_js_1.supabase.storage.from('client-documents').getPublicUrl(storagePath);
    return { url: urlData.publicUrl, clientName: String(booking['client_name'] ?? ''), buffer: pdfBuffer };
}
// ── Construction PDF ──────────────────────────────────────────────────────────
function buildPDF(booking, passport) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const car = booking['cars'];
        const carName = car?.['name'] ?? String(booking['car_id'] ?? '—');
        const carCat = car?.['category'] ?? '';
        const startDate = String(booking['start_date'] ?? '');
        const endDate = String(booking['end_date'] ?? '');
        const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000));
        const total = Number(booking['final_price'] ?? 0);
        const paid = Number(booking['paid_amount'] ?? 0);
        const daily = days > 0 ? Math.round(total / days) : total;
        const refNo = `BK-${new Date().getFullYear()}-${String(booking['id'] ?? '').slice(-6).toUpperCase()}`;
        const emitted = new Date().toLocaleDateString('fr-FR');
        // ── EN-TÊTE ──────────────────────────────────────────────────
        doc
            .font('Helvetica-Bold').fontSize(22).fillColor('#111111')
            .text('FIK CONCIERGERIE', { align: 'center' });
        doc
            .font('Helvetica').fontSize(10).fillColor('#888888')
            .text('AutoLux Location — Oran, Algerie', { align: 'center' });
        doc.moveDown(0.4);
        hr(doc, 2, '#111111');
        doc
            .font('Helvetica-Bold').fontSize(15).fillColor('#111111')
            .text('BON DE RESERVATION / CONTRAT DE LOCATION', { align: 'center' });
        hr(doc, 2, '#111111');
        doc.moveDown(0.4);
        doc
            .font('Helvetica').fontSize(9).fillColor('#555555')
            .text(`Reference: ${refNo}`, { continued: true })
            .text(`Emis le: ${emitted}`, { align: 'right' });
        doc.moveDown(1);
        // ── CLIENT ───────────────────────────────────────────────────
        // Nom: préférer celui du passeport OCR s'il est plus complet
        const clientName = passport['name'] || String(booking['client_name'] ?? '—');
        sectionTitle(doc, 'INFORMATIONS CLIENT');
        row(doc, 'Nom complet', clientName);
        row(doc, 'N° Passeport', passport['passport_number'] || passport['license_number'] || '—');
        row(doc, 'Date naissance', passport['birth_date'] || '—');
        row(doc, 'Nationalite', passport['nationality'] || '—');
        row(doc, 'Telephone', String(booking['client_phone'] ?? '—'));
        doc.moveDown(0.8);
        // ── VEHICULE ─────────────────────────────────────────────────
        sectionTitle(doc, 'VEHICULE & PERIODE DE LOCATION');
        row(doc, 'Vehicule', carName);
        if (carCat)
            row(doc, 'Categorie', carCat);
        row(doc, 'Debut de location', fmtDate(startDate));
        row(doc, 'Fin de location', fmtDate(endDate));
        row(doc, 'Duree', `${days} jour${days > 1 ? 's' : ''}`);
        doc.moveDown(0.8);
        // ── TARIF ────────────────────────────────────────────────────
        sectionTitle(doc, 'TARIFICATION');
        row(doc, 'Prix par jour', `${daily} EUR`);
        rowBold(doc, 'TOTAL', `${total} EUR`);
        rowBold(doc, 'Caution versee', paid > 0 ? `${paid} EUR` : 'Aucune');
        doc.moveDown(0.6);
        // Phrase explicative paiement
        const reste = total - paid;
        if (paid > 0 && reste > 0) {
            doc.font('Helvetica').fontSize(10).fillColor('#222222')
                .text(`Un montant de ${paid} EUR a ete verse a titre de caution afin de reserver le vehicule. Le reste de ${reste} EUR est a regler a la restitution des cles.`, 55, doc.y, { width: 490 });
        }
        else if (paid >= total) {
            doc.font('Helvetica').fontSize(10).fillColor('#222222')
                .text('Le montant total a ete regle integralement.', 55, doc.y, { width: 490 });
        }
        else {
            doc.font('Helvetica').fontSize(10).fillColor('#222222')
                .text(`Le montant total de ${total} EUR est a regler a la restitution des cles.`, 55, doc.y, { width: 490 });
        }
        doc.moveDown(1);
        // ── CONDITIONS ───────────────────────────────────────────────
        sectionTitle(doc, 'CONDITIONS DE LOCATION');
        doc.font('Helvetica').fontSize(9).fillColor('#444444')
            .text('1. Le vehicule doit etre restitue avec le meme niveau de carburant qu\'a la prise en charge.')
            .text('2. Le passeport du locataire est conserve par l\'agence pendant toute la duree de la location.')
            .text('3. Tout depassement de la date de retour sera facture au tarif journalier en vigueur.')
            .text("4. L'agence decline toute responsabilite en cas d'infraction commise pendant la location.")
            .text('5. En cas de panne ou accident, contacter immediatement l\'agence.');
        doc.moveDown(1.5);
        // ── PIED DE PAGE ─────────────────────────────────────────────
        doc.font('Helvetica').fontSize(7).fillColor('#cccccc')
            .text(`Fik Conciergerie — AutoLux Location Oran — Ref: ${refNo} — Document genere par Dzaryx IA`, 50, 770, {
            align: 'center', width: 495,
        });
        doc.end();
    });
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function hr(doc, weight, color) {
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(weight).strokeColor(color).stroke();
    doc.moveDown(0.3);
}
function sectionTitle(doc, title) {
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(title);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.moveDown(0.4);
}
function row(doc, label, value) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#777777').text(`${label}:`, 55, y, { width: 150 });
    doc.font('Helvetica').fontSize(10).fillColor('#222222').text(value, 210, y, { width: 335 });
}
function rowBold(doc, label, value) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${label}:`, 55, y, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(value, 210, y, { width: 335 });
}
function fmtDate(d) {
    try {
        return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    catch {
        return d;
    }
}
//# sourceMappingURL=generate-voucher.js.map