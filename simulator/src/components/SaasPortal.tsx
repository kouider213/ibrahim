import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

type Mode = 'landing' | 'signup' | 'login' | 'onboarding' | 'chat';
type Tab  = 'chat' | 'actions' | 'agenda' | 'data' | 'revenue' | 'clients' | 'account';

interface OrgSession {
  token:         string;
  ai_name:       string;
  business_name: string;
  sector:        string;
  org_id:        string;
}

const SECTORS = [
  { key: 'car_rental',   label: 'Location voitures',  icon: '🚗' },
  { key: 'restaurant',   label: 'Restaurant',          icon: '🍽️' },
  { key: 'beauty',       label: 'Salon beauté',        icon: '💇' },
  { key: 'lawyer',       label: 'Avocat / Notaire',    icon: '⚖️' },
  { key: 'doctor',       label: 'Médecin / Clinique',  icon: '🏥' },
  { key: 'real_estate',  label: 'Immobilier',          icon: '🏠' },
  { key: 'hotel',        label: 'Hôtel / Riad',        icon: '🏨' },
  { key: 'retail',       label: 'Commerce',            icon: '🛍️' },
  { key: 'auto_school',  label: 'Auto-école',          icon: '🚦' },
  { key: 'construction', label: 'BTP / Construction',  icon: '🏗️' },
  { key: 'ecommerce',    label: 'E-commerce',          icon: '📦' },
  { key: 'custom',       label: 'Autre',               icon: '⚡' },
];

const SECTOR_FEATURES: Record<string, { icon: string; text: string }[]> = {
  restaurant: [
    { icon: '📋', text: 'Gérer vos réservations et tables en temps réel' },
    { icon: '📊', text: 'Analyser vos ventes, plats populaires et chiffre d\'affaires' },
    { icon: '📱', text: 'Générer des posts Instagram et réponses clients automatiquement' },
    { icon: '🌍', text: 'Communiquer avec vos clients en français, arabe, anglais, espagnol' },
    { icon: '🍽️', text: 'Proposer des menus du jour, suggestions et idées créatives' },
  ],
  car_rental: [
    { icon: '🚗', text: 'Gérer les réservations et votre parc véhicules' },
    { icon: '💰', text: 'Calculer revenus, profits et statistiques par voiture' },
    { icon: '📅', text: 'Suivre disponibilités et planifier les locations' },
    { icon: '📱', text: 'Envoyer confirmations et rappels clients automatiquement' },
    { icon: '📊', text: 'Analyser votre activité semaine par semaine' },
  ],
  hotel: [
    { icon: '🏨', text: 'Gérer les chambres, check-in et check-out' },
    { icon: '📊', text: 'Suivre le taux d\'occupation et les revenus' },
    { icon: '⭐', text: 'Rédiger des réponses aux avis clients automatiquement' },
    { icon: '🌍', text: 'Accueillir vos clients dans leur langue' },
    { icon: '📋', text: 'Gérer les réservations et demandes spéciales' },
  ],
  lawyer: [
    { icon: '⚖️', text: 'Rédiger des courriers, actes et notes juridiques' },
    { icon: '📋', text: 'Gérer votre agenda et rendez-vous clients' },
    { icon: '📄', text: 'Résumer et analyser des documents juridiques' },
    { icon: '🌍', text: 'Communiquer avec vos clients en plusieurs langues' },
    { icon: '🔍', text: 'Rechercher des précédents et informations légales' },
  ],
  doctor: [
    { icon: '📅', text: 'Gérer les rendez-vous et consultations' },
    { icon: '📄', text: 'Rédiger comptes-rendus et ordonnances types' },
    { icon: '📱', text: 'Envoyer des rappels de rendez-vous aux patients' },
    { icon: '🌍', text: 'Communiquer avec les patients en plusieurs langues' },
    { icon: '📊', text: 'Suivre statistiques de consultations' },
  ],
  real_estate: [
    { icon: '🏠', text: 'Gérer votre portefeuille de biens immobiliers' },
    { icon: '📋', text: 'Rédiger des annonces et fiches descriptives' },
    { icon: '📅', text: 'Organiser les visites et rendez-vous clients' },
    { icon: '💰', text: 'Calculer rentabilité, prix au m² et estimations' },
    { icon: '📱', text: 'Envoyer des propositions personnalisées aux clients' },
  ],
  retail: [
    { icon: '🛍️', text: 'Gérer votre catalogue et stock produits' },
    { icon: '📊', text: 'Analyser les ventes et produits populaires' },
    { icon: '📱', text: 'Créer des offres promotionnelles et posts réseaux sociaux' },
    { icon: '🌍', text: 'Communiquer avec vos clients en plusieurs langues' },
    { icon: '💰', text: 'Suivre revenus et marges par produit' },
  ],
  beauty: [
    { icon: '💇', text: 'Gérer les rendez-vous clients et le planning de l\'équipe' },
    { icon: '📊', text: 'Suivre les services, produits vendus et chiffre d\'affaires' },
    { icon: '📱', text: 'Envoyer des rappels de rendez-vous automatiquement' },
    { icon: '⭐', text: 'Gérer les avis clients et fidélisation' },
    { icon: '💰', text: 'Analyser les revenus par coiffeur et par service' },
  ],
  auto_school: [
    { icon: '🚦', text: 'Gérer les élèves, leçons et plannings moniteurs' },
    { icon: '📋', text: 'Suivre la progression de chaque élève' },
    { icon: '📅', text: 'Planifier et confirmer les examens code et conduite' },
    { icon: '💰', text: 'Gérer les paiements, acomptes et relances' },
    { icon: '📱', text: 'Envoyer des rappels de cours automatiquement' },
  ],
  construction: [
    { icon: '🏗️', text: 'Gérer les chantiers, équipes et planning travaux' },
    { icon: '📦', text: 'Suivre les matériaux, stocks et fournisseurs' },
    { icon: '💰', text: 'Calculer devis, factures et marges par chantier' },
    { icon: '📋', text: 'Rédiger bons de commande, rapports de chantier' },
    { icon: '⚠️', text: 'Alertes délais, retards et dépassements de budget' },
  ],
  ecommerce: [
    { icon: '📦', text: 'Gérer le catalogue, stocks et commandes' },
    { icon: '🚚', text: 'Suivre les livraisons et statuts commandes' },
    { icon: '💰', text: 'Analyser revenus, marges et produits best-sellers' },
    { icon: '📱', text: 'Rédiger fiches produits et posts réseaux sociaux' },
    { icon: '⭐', text: 'Gérer les avis, retours et SAV clients' },
  ],
  custom: [
    { icon: '🤖', text: 'Un assistant IA adapté à votre activité' },
    { icon: '🌍', text: 'Communiquer en français, arabe, anglais, espagnol' },
    { icon: '📊', text: 'Analyser vos données et activité business' },
    { icon: '📋', text: 'Rédiger emails, courriers et documents' },
    { icon: '⚡', text: 'Automatiser les tâches répétitives' },
  ],
};

const QUICK_ACTIONS: Record<string, { icon: string; label: string; prompt: string }[]> = {
  restaurant: [
    { icon: '📋', label: 'Réservations du jour',  prompt: 'Montre-moi les réservations d\'aujourd\'hui' },
    { icon: '➕', label: 'Créer une réservation', prompt: 'Je veux créer une nouvelle réservation pour ce soir' },
    { icon: '💰', label: 'Ventes ce mois',        prompt: 'Quel est notre chiffre d\'affaires ce mois-ci ?' },
    { icon: '📱', label: 'Post Instagram',         prompt: 'Rédige un post Instagram attrayant pour le restaurant aujourd\'hui' },
    { icon: '🍽️', label: 'Idée menu du jour',    prompt: 'Propose-moi un menu du jour original et équilibré' },
    { icon: '⭐', label: 'Répondre à un avis',    prompt: 'Aide-moi à répondre professionnellement à un avis client Google' },
  ],
  car_rental: [
    { icon: '🚗', label: 'Voitures disponibles',  prompt: 'Quelles voitures sont disponibles ce week-end ?' },
    { icon: '➕', label: 'Créer une location',     prompt: 'Je veux créer une nouvelle réservation pour un client' },
    { icon: '💰', label: 'CA cette semaine',       prompt: 'Quel est le chiffre d\'affaires de cette semaine ?' },
    { icon: '📱', label: 'Message confirmation',   prompt: 'Rédige un message WhatsApp de confirmation de location pour un client' },
    { icon: '📊', label: 'Stats du mois',          prompt: 'Donne-moi un résumé des performances du mois en cours' },
    { icon: '🔧', label: 'Maintenance',            prompt: 'Aide-moi à planifier la maintenance de mon parc véhicules' },
  ],
  hotel: [
    { icon: '🏨', label: 'Check-ins du jour',      prompt: 'Liste les check-ins et check-outs d\'aujourd\'hui' },
    { icon: '➕', label: 'Créer une réservation',  prompt: 'Je veux créer une réservation chambre pour un client' },
    { icon: '📊', label: 'Taux d\'occupation',     prompt: 'Quel est notre taux d\'occupation ce mois ?' },
    { icon: '⭐', label: 'Répondre à un avis',     prompt: 'Aide-moi à répondre à un avis client sur Booking.com' },
    { icon: '📱', label: 'Email de bienvenue',     prompt: 'Rédige un email de bienvenue pour un nouveau client' },
    { icon: '💰', label: 'Revenus ce mois',        prompt: 'Quel sont les revenus de l\'hôtel ce mois-ci ?' },
  ],
  lawyer: [
    { icon: '📄', label: 'Rédiger un courrier',    prompt: 'Aide-moi à rédiger un courrier professionnel pour un client' },
    { icon: '📋', label: 'Mes RDV du jour',        prompt: 'Quels sont mes rendez-vous clients aujourd\'hui ?' },
    { icon: '🔍', label: 'Analyser un document',   prompt: 'Je vais te partager un document, analyse-le et résume les points clés' },
    { icon: '⚖️', label: 'Note juridique',         prompt: 'Aide-moi à rédiger une note de synthèse juridique' },
    { icon: '📱', label: 'Répondre à un client',   prompt: 'Aide-moi à rédiger une réponse claire et professionnelle à un client' },
    { icon: '📊', label: 'Résumé d\'activité',     prompt: 'Donne-moi un résumé de l\'activité du cabinet ce mois' },
  ],
  doctor: [
    { icon: '📅', label: 'Consultations du jour',  prompt: 'Liste les consultations prévues aujourd\'hui' },
    { icon: '📄', label: 'Compte-rendu',           prompt: 'Aide-moi à rédiger un compte-rendu de consultation' },
    { icon: '📱', label: 'Rappel RDV patient',     prompt: 'Rédige un SMS de rappel de rendez-vous pour un patient' },
    { icon: '💊', label: 'Ordonnance type',        prompt: 'Aide-moi à rédiger une ordonnance type pour un traitement courant' },
    { icon: '📊', label: 'Stats consultations',    prompt: 'Combien de consultations avons-nous eu ce mois ?' },
    { icon: '⭐', label: 'Répondre à un patient',  prompt: 'Aide-moi à répondre de manière bienveillante à un patient' },
  ],
  real_estate: [
    { icon: '🏠', label: 'Créer une annonce',      prompt: 'Aide-moi à rédiger une annonce immobilière attrayante' },
    { icon: '📅', label: 'Visites du jour',        prompt: 'Quelles visites sont prévues aujourd\'hui ?' },
    { icon: '💰', label: 'Estimation prix',        prompt: 'Aide-moi à estimer le prix d\'un bien immobilier' },
    { icon: '📱', label: 'Contacter un acheteur',  prompt: 'Rédige un message personnalisé pour un acheteur potentiel' },
    { icon: '📊', label: 'Portfolio biens',        prompt: 'Donne-moi un résumé de mon portefeuille de biens' },
    { icon: '⭐', label: 'Réponse avis',           prompt: 'Aide-moi à répondre à un avis client sur mon agence' },
  ],
  retail: [
    { icon: '📊', label: 'Ventes du jour',         prompt: 'Quelles sont les ventes d\'aujourd\'hui ?' },
    { icon: '🏷️', label: 'Créer une promo',       prompt: 'Aide-moi à créer une offre promotionnelle attractive' },
    { icon: '📱', label: 'Post réseaux sociaux',   prompt: 'Rédige un post pour nos réseaux sociaux pour promouvoir nos produits' },
    { icon: '📋', label: 'Gestion stock',          prompt: 'Aide-moi à gérer mon inventaire et identifier les produits à réapprovisionner' },
    { icon: '💰', label: 'CA ce mois',             prompt: 'Quel est notre chiffre d\'affaires ce mois-ci ?' },
    { icon: '⭐', label: 'Fidélisation client',    prompt: 'Propose-moi une stratégie pour fidéliser mes clients' },
  ],
  beauty: [
    { icon: '📅', label: 'RDV du jour',            prompt: 'Liste les rendez-vous d\'aujourd\'hui avec les clients et services prévus' },
    { icon: '➕', label: 'Nouveau RDV',             prompt: 'Je veux créer un nouveau rendez-vous client' },
    { icon: '💰', label: 'CA ce mois',             prompt: 'Quel est le chiffre d\'affaires du salon ce mois-ci ?' },
    { icon: '📱', label: 'Rappel client',           prompt: 'Rédige un message de rappel de rendez-vous pour un client' },
    { icon: '⭐', label: 'Fidélisation',            prompt: 'Propose-moi une offre de fidélisation pour mes clients réguliers' },
    { icon: '📊', label: 'Top services',            prompt: 'Quels sont les services les plus demandés ce mois ?' },
  ],
  auto_school: [
    { icon: '📅', label: 'Leçons du jour',          prompt: 'Quelles leçons de conduite sont prévues aujourd\'hui ?' },
    { icon: '➕', label: 'Nouvel élève',             prompt: 'Je veux créer un dossier pour un nouvel élève' },
    { icon: '📊', label: 'Progression élèves',      prompt: 'Donne-moi un état de la progression de mes élèves en cours' },
    { icon: '📋', label: 'Examen à venir',          prompt: 'Quels élèves passent l\'examen ce mois-ci ?' },
    { icon: '💰', label: 'Paiements en attente',    prompt: 'Y a-t-il des paiements ou acomptes en attente ?' },
    { icon: '📱', label: 'Rappel leçon',            prompt: 'Rédige un SMS de rappel pour la leçon de conduite de demain' },
  ],
  construction: [
    { icon: '🏗️', label: 'Chantiers en cours',      prompt: 'Donne-moi l\'état actuel de tous les chantiers en cours' },
    { icon: '➕', label: 'Nouveau devis',            prompt: 'Aide-moi à rédiger un devis pour un nouveau chantier' },
    { icon: '📦', label: 'Commande matériaux',      prompt: 'Je dois commander des matériaux — aide-moi à rédiger le bon de commande' },
    { icon: '💰', label: 'Facture chantier',        prompt: 'Aide-moi à rédiger une facture pour un chantier terminé' },
    { icon: '⚠️', label: 'Retards & alertes',      prompt: 'Y a-t-il des chantiers en retard ou des alertes à surveiller ?' },
    { icon: '📊', label: 'Bilan mensuel',            prompt: 'Fais-moi un bilan de l\'activité BTP ce mois-ci' },
  ],
  ecommerce: [
    { icon: '📦', label: 'Commandes du jour',       prompt: 'Quelles commandes ont été passées aujourd\'hui ?' },
    { icon: '🚚', label: 'Livraisons en cours',     prompt: 'Quel est l\'état des livraisons en cours ?' },
    { icon: '💰', label: 'CA ce mois',              prompt: 'Quel est le chiffre d\'affaires e-commerce ce mois-ci ?' },
    { icon: '📱', label: 'Fiche produit',           prompt: 'Rédige une fiche produit attractive pour un nouvel article' },
    { icon: '⭐', label: 'Réponse avis',            prompt: 'Aide-moi à répondre à un avis client en ligne' },
    { icon: '🏷️', label: 'Créer une promo',        prompt: 'Aide-moi à créer une offre promotionnelle pour booster les ventes' },
  ],
  custom: [
    { icon: '📋', label: 'Résumé du jour',         prompt: 'Fais-moi un résumé de l\'activité du jour' },
    { icon: '📄', label: 'Rédiger un document',    prompt: 'Aide-moi à rédiger un document professionnel' },
    { icon: '📱', label: 'Message client',         prompt: 'Aide-moi à rédiger un message professionnel pour un client' },
    { icon: '📊', label: 'Analyser des données',   prompt: 'Aide-moi à analyser des données de mon business' },
    { icon: '💡', label: 'Idée créative',          prompt: 'Donne-moi des idées créatives pour développer mon business' },
    { icon: '⭐', label: 'Améliorer mon service',  prompt: 'Comment puis-je améliorer la qualité de mon service ?' },
  ],
};

function getSectorActions(sector: string) {
  return QUICK_ACTIONS[sector] ?? QUICK_ACTIONS['custom'];
}

function getSectorFeatures(sector: string) {
  return SECTOR_FEATURES[sector] ?? SECTOR_FEATURES['custom'];
}

function getSectorLabel(sector: string) {
  return SECTORS.find(s => s.key === sector)?.label ?? 'Votre secteur';
}

function getSectorIcon(sector: string) {
  return SECTORS.find(s => s.key === sector)?.icon ?? '⚡';
}

function onboardingKey(orgId: string) { return `saas_onboarded_${orgId}`; }

// ── Storage helpers ───────────────────────────────────────────────
function saveSession(s: OrgSession) { localStorage.setItem('saas_session', JSON.stringify(s)); }
function loadSession(): OrgSession | null {
  try { const r = localStorage.getItem('saas_session'); return r ? JSON.parse(r) as OrgSession : null; }
  catch { return null; }
}
function clearSession() { localStorage.removeItem('saas_session'); }

function getSessionId(orgId: string) {
  const k = `saas_sid_${orgId}`;
  let s = localStorage.getItem(k);
  if (!s) { s = `saas_${orgId.slice(0, 8)}_${Date.now()}`; localStorage.setItem(k, s); }
  return s;
}

// ═════════════════════════════════════════════════════════════════
// Main portal
// ═════════════════════════════════════════════════════════════════
export default function SaasPortal() {
  const existing = loadSession();
  const initialMode: Mode = (() => {
    if (!existing) return 'landing';
    if (!localStorage.getItem(onboardingKey(existing.org_id))) return 'onboarding';
    return 'chat';
  })();
  const [mode, setMode]       = useState<Mode>(initialMode);
  const [session, setSession] = useState<OrgSession | null>(existing);

  const handleAuth = (s: OrgSession) => {
    saveSession(s);
    setSession(s);
    const onboarded = localStorage.getItem(onboardingKey(s.org_id));
    setMode(onboarded ? 'chat' : 'onboarding');
  };
  const handleLogout = () => { clearSession(); setSession(null); setMode('landing'); };
  const handleOnboardingDone = () => {
    if (session) localStorage.setItem(onboardingKey(session.org_id), '1');
    setMode('chat');
  };

  if (mode === 'landing')    return <Landing onSignup={() => setMode('signup')} onLogin={() => setMode('login')} />;
  if (mode === 'signup')     return <SignupForm onAuth={handleAuth} onBack={() => setMode('landing')} />;
  if (mode === 'login')      return <LoginForm  onAuth={handleAuth} onBack={() => setMode('landing')} />;
  if (mode === 'onboarding' && session) return <OnboardingScreen session={session} onDone={handleOnboardingDone} />;
  if (mode === 'chat'        && session) return <SaasChat session={session} onLogout={handleLogout} />;
  return null;
}

// ── Landing ───────────────────────────────────────────────────────
function Landing({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.landingContent}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🤖</div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 900, color: '#00d4ff', letterSpacing: '0.3em' }}>
            DZARYX
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6, letterSpacing: '0.08em' }}>
            Assistant IA pour votre business
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
          {[
            { icon: '🌍', text: 'Parle votre langue — français, anglais, arabe, espagnol' },
            { icon: '🎯', text: 'Adapté à votre secteur — restaurant, avocat, médecin...' },
            { icon: '⚡', text: 'Actions rapides — réservations, stats, posts réseaux sociaux' },
            { icon: '🚀', text: 'Prêt en 2 minutes — inscription rapide et gratuite' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 12 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onSignup} style={S.btnPrimary}>Commencer gratuitement</button>
          <button onClick={onLogin}  style={S.btnSecondary}>J'ai déjà un compte</button>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding ────────────────────────────────────────────────────
function OnboardingScreen({ session, onDone }: { session: OrgSession; onDone: () => void }) {
  const features = getSectorFeatures(session.sector);
  const sectorLabel = getSectorLabel(session.sector);
  const sectorIcon  = getSectorIcon(session.sector);
  const aiName = session.ai_name ?? 'Dzaryx';

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column' }}>
      <div style={S.safeTop} />

      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid rgba(0,212,255,0.07)',
        textAlign: 'center', flexShrink: 0,
      }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
        <div style={{ fontFamily: 'Orbitron', fontSize: 16, fontWeight: 900, color: '#00d4ff', letterSpacing: '0.2em' }}>
          {aiName.toUpperCase()} EST PRÊT !
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          {session.business_name}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* Sector chip */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 18px', borderRadius: 20,
            background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
          }}>
            <span style={{ fontSize: 18 }}>{sectorIcon}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: '#00d4ff', letterSpacing: '0.08em' }}>
              {sectorLabel}
            </span>
          </div>
        </div>

        {/* What Dzaryx can do */}
        <div style={S.sectionLabel}>Ce que {aiName} peut faire pour vous</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {features.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)',
              borderRadius: 12,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* How to use */}
        <div style={S.sectionLabel}>Comment utiliser {aiName}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {[
            { step: '1', title: 'Onglet Chat', desc: 'Posez n\'importe quelle question ou donnez une instruction à votre assistant' },
            { step: '2', title: 'Onglet Actions', desc: 'Choisissez une action rapide adaptée à votre activité — un seul tap pour démarrer' },
            { step: '3', title: 'Onglet Compte', desc: 'Consultez vos statistiques d\'utilisation et les informations de votre abonnement' },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00d4ff',
              }}>
                {step}
              </div>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>{title}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.45 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pro tip */}
        <div style={{
          padding: '14px', borderRadius: 12, marginBottom: 28,
          background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
        }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, color: 'rgba(124,58,237,0.8)', letterSpacing: '0.1em', marginBottom: 6 }}>
            💡 CONSEIL PRO
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            Plus vous donnez de détails à {aiName}, plus ses réponses seront précises et utiles pour votre business.
          </div>
        </div>

        <button onClick={onDone} style={S.btnPrimary}>
          Commencer avec {aiName} →
        </button>
      </div>
    </div>
  );
}

// ── Signup ────────────────────────────────────────────────────────
function SignupForm({ onAuth, onBack }: { onAuth: (s: OrgSession) => void; onBack: () => void }) {
  const [step, setStep]             = useState<'sector' | 'info'>('sector');
  const [sector, setSector]         = useState('');
  const [businessName, setBusiness] = useState('');
  const [city, setCity]             = useState('');
  const [country, setCountry]       = useState('Algeria');
  const [language, setLanguage]     = useState('fr');
  const [aiName, setAiName]         = useState('Dzaryx');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const submit = async () => {
    if (!businessName || !email || !password || !sector) { setError('Tous les champs sont requis'); return; }
    if (password.length < 8) { setError('Mot de passe minimum 8 caractères'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, business_name: businessName, city, country, sector, language, ai_name: aiName }),
      });
      const data = await r.json() as any;
      if (!r.ok) { setError(data.error ?? 'Erreur inscription'); return; }
      onAuth({ token: data.token, ai_name: data.ai_name ?? aiName, business_name: data.business_name, sector: data.sector ?? sector, org_id: data.org_id });
    } catch { setError('Erreur réseau — réessayez'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <button onClick={onBack} style={S.backBtn}>← Retour</button>
        <div style={S.formTitle}>Créer votre Dzaryx</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Progress */}
      <div style={{ padding: '8px 20px', display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#00d4ff' }} />
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: step === 'info' ? '#00d4ff' : 'rgba(255,255,255,0.1)' }} />
      </div>

      <div style={S.formScroll}>
        {step === 'sector' ? (
          <>
            <div style={S.sectionLabel}>Votre secteur d'activité</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {SECTORS.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSector(s.key)}
                  style={{
                    padding: '14px 10px', borderRadius: 12, border: `1.5px solid ${sector === s.key ? '#00d4ff' : 'rgba(255,255,255,0.08)'}`,
                    background: sector === s.key ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{s.icon}</span>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, color: sector === s.key ? '#00d4ff' : 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.2 }}>{s.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => sector && setStep('info')} disabled={!sector} style={!sector ? S.btnDisabled : S.btnPrimary}>
              Continuer →
            </button>
          </>
        ) : (
          <>
            <div style={S.sectionLabel}>Informations de votre business</div>
            {[
              { label: 'Nom du business', value: businessName, set: setBusiness, placeholder: 'Ex: La Fourchette, Cabinet Benali' },
              { label: 'Ville', value: city, set: setCity, placeholder: 'Ex: Alger, Oran, Paris' },
              { label: 'Pays', value: country, set: setCountry, placeholder: 'Ex: Algeria, France' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={S.inputLabel}>{f.label}</div>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={S.input} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Nom de votre assistant IA</div>
              <input value={aiName} onChange={e => setAiName(e.target.value)} placeholder="Dzaryx, Sofia, Max..." style={S.input} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Langue principale</div>
              <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...S.input, WebkitAppearance: 'none' }}>
                <option value="fr">Français</option>
                <option value="ar">Arabe (Darija)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

            <div style={S.divider} />
            <div style={S.sectionLabel}>Votre compte</div>

            {[
              { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'vous@example.com' },
              { label: 'Mot de passe (min. 8 caractères)', value: password, set: setPassword, type: 'password', placeholder: '••••••••' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={S.inputLabel}>{f.label}</div>
                <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type} placeholder={f.placeholder} style={S.input} />
              </div>
            ))}

            {error && <div style={S.errorText}>{error}</div>}

            <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
              {loading ? 'Création en cours…' : `Créer mon ${aiName}`}
            </button>
            <button onClick={() => setStep('sector')} style={{ ...S.btnSecondary, marginTop: 8 }}>← Changer de secteur</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────
function LoginForm({ onAuth, onBack }: { onAuth: (s: OrgSession) => void; onBack: () => void }) {
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (!email || !password) { setError('Email et mot de passe requis'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json() as any;
      if (!r.ok) { setError(data.error ?? 'Identifiants incorrects'); return; }
      onAuth({ token: data.token, ai_name: data.ai_name ?? 'Dzaryx', business_name: data.business_name, sector: data.sector ?? '', org_id: data.org_id });
    } catch { setError('Erreur réseau — réessayez'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <button onClick={onBack} style={S.backBtn}>← Retour</button>
        <div style={S.formTitle}>Connexion</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={S.formScroll}>
        <div style={{ marginBottom: 14 }}>
          <div style={S.inputLabel}>Email</div>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="vous@example.com" style={S.input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={S.inputLabel}>Mot de passe</div>
          <input value={password} onChange={e => setPass(e.target.value)} type="password" placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && submit()} style={S.input} />
        </div>
        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}

// ── SaaS Chat ─────────────────────────────────────────────────────
interface ChatMessage { role: 'user' | 'ai'; text: string; ts: number; }

function SaasChat({ session, onLogout }: { session: OrgSession; onLogout: () => void }) {
  const [tab, setTab]           = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [wsOk, setWsOk]         = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getSessionId(session.org_id);
  const aiName    = session.ai_name ?? 'Dzaryx';

  useEffect(() => {
    const sock = io(BACKEND, {
      auth: { token: session.token },
      query: { sessionId },
      transports: ['websocket', 'polling'],
    });
    sock.on('connect',    () => setWsOk(true));
    sock.on('disconnect', () => setWsOk(false));
    sock.on('Dzaryx:text_chunk',    (chunk: string) => setStreaming(prev => prev + chunk));
    sock.on('Dzaryx:text_complete', (text: string)  => { setStreaming(''); setThinking(false); setMessages(prev => [...prev, { role: 'ai', text, ts: Date.now() }]); });
    sock.on('Dzaryx:status', ({ status }: { status: string }) => { if (status === 'thinking') setThinking(true); if (status === 'idle') setThinking(false); });
    socketRef.current = sock;
    return () => { sock.disconnect(); };
  }, [session.token, sessionId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streaming]);

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || thinking) return;
    setInput('');
    setTab('chat');
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
    setThinking(true);
    setStreaming('');
    try {
      await fetch(`${BACKEND}/api/saas/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ message: text, sessionId, textOnly: true }),
      });
    } catch {
      setThinking(false);
      setMessages(prev => [...prev, { role: 'ai', text: 'Erreur de connexion. Réessayez.', ts: Date.now() }]);
    }
  };

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={S.safeTop} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', height: 44,
          background: 'rgba(2,5,14,0.97)', borderBottom: '1px solid rgba(0,212,255,0.08)',
        }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.2em' }}>{aiName.toUpperCase()}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{session.business_name}</div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20,
            background: wsOk ? 'rgba(0,212,255,0.06)' : 'rgba(255,51,102,0.06)',
            border: `1px solid ${wsOk ? 'rgba(0,212,255,0.18)' : 'rgba(255,51,102,0.2)'}`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: wsOk ? '#00d4ff' : '#ff3366' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 10, color: wsOk ? 'rgba(0,212,255,0.85)' : '#ff3366' }}>
              {wsOk ? 'EN LIGNE' : 'HORS LIGNE'}
            </span>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter', fontSize: 16, color: 'rgba(255,255,255,0.3)', padding: '4px 8px' }}>
            ⏻
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat'    && <ChatTab messages={messages} streaming={streaming} thinking={thinking} input={input} setInput={setInput} onSend={() => send()} aiName={aiName} bottomRef={bottomRef} />}
        {tab === 'actions' && <ActionsTab sector={session.sector} aiName={aiName} onAction={send} />}
        {tab === 'agenda'  && <AgendaTab session={session} />}
        {tab === 'data'    && <DataTab session={session} />}
        {tab === 'revenue' && <RevenueTab session={session} />}
        {tab === 'clients' && <ClientsTab session={session} />}
        {tab === 'account' && <AccountTab session={session} onLogout={onLogout} />}
      </div>

      {/* Bottom nav — scrollable */}
      <div style={{
        flexShrink: 0, display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
        background: 'rgba(2,5,14,0.98)', borderTop: '1px solid rgba(0,212,255,0.07)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {([
          { id: 'chat',    icon: '💬', label: 'Chat' },
          { id: 'actions', icon: '⚡', label: 'Actions' },
          { id: 'agenda',  icon: '📅', label: 'Agenda' },
          { id: 'data',    icon: getSectorTabIcon(session.sector), label: getSectorTabLabel(session.sector) },
          { id: 'revenue', icon: '💰', label: 'Revenus' },
          { id: 'clients', icon: '👥', label: 'Clients' },
          { id: 'account', icon: '👤', label: 'Compte' },
        ] as { id: Tab; icon: string; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              minWidth: 58, flex: '0 0 auto', height: 56,
              background: 'none', border: 'none', cursor: 'pointer',
              borderTop: `2px solid ${tab === t.id ? '#00d4ff' : 'transparent'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}
          >
            <span style={{ fontSize: 18, filter: tab === t.id ? 'drop-shadow(0 0 6px rgba(0,212,255,0.7))' : 'none' }}>{t.icon}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#00d4ff' : 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Chat tab ──────────────────────────────────────────────────────
function ChatTab({ messages, streaming, thinking, input, setInput, onSend, aiName, bottomRef }: {
  messages: ChatMessage[]; streaming: string; thinking: boolean;
  input: string; setInput: (v: string) => void; onSend: () => void;
  aiName: string; bottomRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !thinking && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
            <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>
              Bonjour ! Je suis {aiName}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              Posez-moi n'importe quelle question<br />ou utilisez les <strong style={{ color: 'rgba(0,212,255,0.5)' }}>Actions rapides ⚡</strong>
            </div>
          </div>
        )}
        {messages.map(m => (
          <div key={m.ts} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px',
              borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.role === 'user' ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.06)',
              border: m.role === 'user' ? '1px solid rgba(0,212,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {(thinking || streaming) && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
              {streaming || <span style={{ color: 'rgba(0,212,255,0.5)' }}>···</span>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ flexShrink: 0, padding: '12px 16px', background: 'rgba(2,5,14,0.97)', borderTop: '1px solid rgba(0,212,255,0.08)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={`Message à ${aiName}…`}
            rows={1}
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '10px 14px', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', resize: 'none', outline: 'none', maxHeight: 120, overflowY: 'auto' }}
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || thinking}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: !input.trim() || thinking ? 'default' : 'pointer', background: !input.trim() || thinking ? 'rgba(0,212,255,0.1)' : '#00d4ff', color: !input.trim() || thinking ? 'rgba(0,212,255,0.3)' : '#000', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}

// ── Actions tab ───────────────────────────────────────────────────
function ActionsTab({ sector, aiName, onAction }: { sector: string; aiName: string; onAction: (prompt: string) => void }) {
  const actions = getSectorActions(sector);
  const sectorLabel = getSectorLabel(sector);
  const sectorIcon  = getSectorIcon(sector);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{sectorIcon}</span>
        <div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, color: 'rgba(0,212,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Actions rapides</div>
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{sectorLabel} · tap pour envoyer à {aiName}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => onAction(a.prompt)}
            style={{
              padding: '16px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
              background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              transition: 'background 0.15s ease',
            }}
          >
            <span style={{ fontSize: 26 }}>{a.icon}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.7)', lineHeight: 1.3 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* Universal briefing button */}
      <div style={{ marginTop: 16 }}>
        <div style={S.sectionLabel}>Briefing proactif</div>
        <button
          onClick={() => onAction(`Donne-moi un briefing complet de mon activité aujourd'hui : résume mes réservations, les clients attendus, l'état de mon inventaire, les points importants à ne pas oublier, et si possible une recommandation pour optimiser ma journée.`)}
          style={{
            width: '100%', padding: '14px 12px', borderRadius: 14, cursor: 'pointer',
            background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <span style={{ fontSize: 24 }}>📊</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: 'rgba(124,58,237,0.9)' }}>Briefing du jour</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Résumé complet de votre activité par {aiName}</div>
          </div>
        </button>
      </div>

      <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, textAlign: 'center' }}>
          Tap → {aiName} démarre automatiquement avec vos données réelles
        </div>
      </div>
    </div>
  );
}

// ── Account tab ───────────────────────────────────────────────────
interface Integrations { whatsapp_number?: string; google_calendar_url?: string; business_hours_open?: string; business_hours_close?: string; }
interface BusinessProfile { owner_name?: string; address?: string; website?: string; description?: string; }
interface OrgConfig { ai_name: string; business_name: string; sector: string; language: string; city: string; country: string; plan: string; messages_used: number; messages_limit: number; integrations?: Integrations; business_profile?: BusinessProfile; }

function AccountTab({ session, onLogout }: { session: OrgSession; onLogout: () => void }) {
  const [config, setConfig]       = useState<OrgConfig | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [checkingOut, setChkOut]  = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  // Integration fields
  const [waNumber, setWaNumber]     = useState('');
  const [gcalUrl, setGcalUrl]       = useState('');
  const [hoursOpen, setHoursOpen]   = useState('08:00');
  const [hoursClose, setHoursClose] = useState('20:00');
  // Profile fields
  const [ownerName, setOwnerName]   = useState('');
  const [address, setAddress]       = useState('');
  const [description, setDesc]      = useState('');

  useEffect(() => {
    fetch(`${BACKEND}/api/saas/config`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(r => r.json())
      .then(d => {
        const cfg = d as OrgConfig;
        setConfig(cfg);
        const i = cfg.integrations ?? {};
        const p = cfg.business_profile ?? {};
        setWaNumber(i.whatsapp_number ?? '');
        setGcalUrl(i.google_calendar_url ?? '');
        setHoursOpen(i.business_hours_open ?? '08:00');
        setHoursClose(i.business_hours_close ?? '20:00');
        setOwnerName(p.owner_name ?? '');
        setAddress(p.address ?? '');
        setDesc(p.description ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session.token]);

  const startCheckout = async (plan: string) => {
    setChkOut(true);
    try {
      const r = await fetch(`${BACKEND}/api/saas/billing/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json() as { checkout_url?: string; error?: string };
      if (d.checkout_url) window.open(d.checkout_url, '_blank');
      else alert(d.error ?? 'Erreur paiement');
    } catch { alert('Erreur réseau'); }
    setChkOut(false);
    setShowPlans(false);
  };

  const saveIntegrations = async () => {
    setSaving(true);
    try {
      await fetch(`${BACKEND}/api/saas/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrations: { whatsapp_number: waNumber, google_calendar_url: gcalUrl, business_hours_open: hoursOpen, business_hours_close: hoursClose },
          business_profile: { owner_name: ownerName, address, description },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const used   = config?.messages_used  ?? 0;
  const limit  = config?.messages_limit ?? 100;
  const pct    = Math.min(100, Math.round((used / limit) * 100));
  const planName = config?.plan === 'pro' ? 'Pro' : config?.plan === 'enterprise' ? 'Enterprise' : 'Gratuit';

  const LANG_LABELS: Record<string, string> = { fr: 'Français', ar: 'Arabe (Darija)', en: 'English', es: 'Español' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
      ) : (
        <>
          {/* Business card */}
          <div style={{ padding: '16px', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 28 }}>{getSectorIcon(config?.sector ?? session.sector)}</div>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{config?.business_name ?? session.business_name}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(0,212,255,0.6)', marginTop: 2 }}>{getSectorLabel(config?.sector ?? session.sector)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {[
                { label: 'Assistant', value: config?.ai_name ?? session.ai_name },
                { label: 'Langue', value: LANG_LABELS[config?.language ?? 'fr'] ?? config?.language },
                config?.city ? { label: 'Ville', value: config.city } : null,
                config?.country ? { label: 'Pays', value: config.country } : null,
              ].filter(Boolean).map((item: any) => (
                <div key={item.label} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{item.label}: </span>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Usage */}
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Messages utilisés</div>
              <div style={{
                padding: '3px 10px', borderRadius: 10,
                background: planName === 'Gratuit' ? 'rgba(255,149,0,0.1)' : 'rgba(0,212,255,0.1)',
                border: `1px solid ${planName === 'Gratuit' ? 'rgba(255,149,0,0.3)' : 'rgba(0,212,255,0.25)'}`,
              }}>
                <span style={{ fontFamily: 'Orbitron', fontSize: 9, fontWeight: 700, color: planName === 'Gratuit' ? '#ff9500' : '#00d4ff', letterSpacing: '0.1em' }}>
                  {planName.toUpperCase()}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 700, color: '#fff' }}>{used}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', alignSelf: 'flex-end', paddingBottom: 2 }}>/ {limit} messages</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct > 80 ? '#ff9500' : '#00d4ff', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
              {limit - used} messages restants ce mois
            </div>
          </div>

          {/* Plan upgrade / billing */}
          {planName === 'Gratuit' && !showPlans && (
            <button
              onClick={() => setShowPlans(true)}
              style={{ width: '100%', padding: '14px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 14, marginBottom: 16, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(124,58,237,0.95)', marginBottom: 4 }}>✨ Passer à Pro</div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                Messages illimités · notifications · stats avancées · support prioritaire
              </div>
            </button>
          )}
          {planName !== 'Gratuit' && (
            <div style={{ padding: '14px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 14, marginBottom: 16 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: '#00d4ff', marginBottom: 4 }}>
                {planName === 'Enterprise' ? '👑' : '✨'} Plan {planName} actif
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                {config?.messages_used ?? 0} / {config?.messages_limit ?? 0} messages utilisés ce mois
              </div>
            </div>
          )}
          {showPlans && (
            <div style={{ marginBottom: 16 }}>
              {[
                { key: 'pro', label: 'Pro', price: '2 900 DA/mois', color: 'rgba(124,58,237,0.9)', bg: 'rgba(124,58,237,0.07)', border: 'rgba(124,58,237,0.25)', features: ['2 000 messages/mois', 'Briefing quotidien', 'Items illimités', 'Stats avancées', 'Notifications push', 'Support prioritaire'] },
                { key: 'enterprise', label: 'Enterprise', price: '9 900 DA/mois', color: '#00d4ff', bg: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.2)', features: ['Messages illimités', 'Tout le plan Pro', 'SLA 99.9%', 'Onboarding dédié', 'API webhooks', 'Marque blanche'] },
              ].map(p => (
                <div key={p.key} style={{ padding: '14px', background: p.bg, border: `1px solid ${p.border}`, borderRadius: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: p.color }}>{p.label}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 11, color: p.color, fontWeight: 600 }}>{p.price}</div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    {p.features.map(f => <div key={f} style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>• {f}</div>)}
                  </div>
                  <button
                    onClick={() => void startCheckout(p.key)}
                    disabled={checkingOut}
                    style={{ width: '100%', padding: '10px', background: p.bg, border: `1px solid ${p.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: p.color }}
                  >
                    {checkingOut ? 'Redirection…' : `Choisir ${p.label} →`}
                  </button>
                </div>
              ))}
              <button onClick={() => setShowPlans(false)} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                Annuler
              </button>
            </div>
          )}

          {/* Business profile */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 10 }}>Profil business</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Votre nom / gérant', value: ownerName, set: setOwnerName, placeholder: 'Ex: Mohamed Benali' },
                { label: 'Adresse', value: address, set: setAddress, placeholder: 'Ex: 12 rue des Pins, Oran' },
                { label: 'Description du business', value: description, set: setDesc, placeholder: 'Ce que fait votre business…' },
              ].map(f => (
                <div key={f.label}>
                  <div style={S.inputLabel}>{f.label}</div>
                  <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={S.input} />
                </div>
              ))}
            </div>
          </div>

          {/* Integrations */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 10 }}>Connexions & intégrations</div>

            {/* WhatsApp */}
            <div style={{ padding: '14px', background: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(37,211,102,0.9)' }}>WhatsApp Business</div>
                {waNumber && <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(37,211,102,0.15)', borderRadius: 6, color: 'rgba(37,211,102,0.8)', fontFamily: 'Inter', fontWeight: 700 }}>CONNECTÉ</span>}
              </div>
              <input value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="+213 6xx xxx xxx" style={{ ...S.input, marginBottom: 0 }} />
              {!waNumber && <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>Entrez votre numéro WhatsApp Business — votre Dzaryx pourra l'utiliser comme référence</div>}
            </div>

            {/* Google Calendar */}
            <div style={{ padding: '14px', background: 'rgba(66,133,244,0.05)', border: '1px solid rgba(66,133,244,0.15)', borderRadius: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(66,133,244,0.9)' }}>Google Agenda</div>
                {gcalUrl && <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(66,133,244,0.15)', borderRadius: 6, color: 'rgba(66,133,244,0.8)', fontFamily: 'Inter', fontWeight: 700 }}>LIÉ</span>}
              </div>
              <input value={gcalUrl} onChange={e => setGcalUrl(e.target.value)} placeholder="URL Google Agenda (partage public)" style={{ ...S.input, marginBottom: 0 }} />
              {!gcalUrl && <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>Google Agenda → Paramètres → Partager → copiez le lien</div>}
            </div>

            {/* Business hours */}
            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>🕐</span>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Horaires d'ouverture</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={S.inputLabel}>Ouverture</div>
                  <input type="time" value={hoursOpen} onChange={e => setHoursOpen(e.target.value)} style={{ ...S.input, colorScheme: 'dark' }} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: 14 }}>→</div>
                <div style={{ flex: 1 }}>
                  <div style={S.inputLabel}>Fermeture</div>
                  <input type="time" value={hoursClose} onChange={e => setHoursClose(e.target.value)} style={{ ...S.input, colorScheme: 'dark' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={saveIntegrations} disabled={saving} style={{ ...S.btnPrimary, marginBottom: 16, background: saved ? 'rgba(0,230,118,0.15)' : undefined, borderColor: saved ? 'rgba(0,230,118,0.4)' : undefined, color: saved ? '#00e676' : undefined }}>
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré !' : 'Enregistrer les paramètres'}
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)',
              fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: '#ff3366',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span>⏻</span> Se déconnecter
          </button>
        </>
      )}
    </div>
  );
}

// ── Agenda tab ────────────────────────────────────────────────────
function AgendaTab({ session }: { session: OrgSession }) {
  const cfg = getSectorTabCfg(session.sector);
  const [bookings, setBookings] = useState<SaasBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const headers = { Authorization: `Bearer ${session.token}` };

  useEffect(() => {
    fetch(`${BACKEND}/api/saas/data/bookings?order=asc&limit=100`, { headers })
      .then(r => r.json()).then(d => setBookings(d as SaasBooking[])).catch(() => {})
      .finally(() => setLoading(false));
  }, [session.token]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const weekStr = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const groups: { label: string; color: string; items: SaasBooking[] }[] = [
    { label: "Aujourd'hui",  color: '#00d4ff', items: bookings.filter(b => b.start_date.slice(0, 10) === todayStr && b.status !== 'cancelled') },
    { label: 'Demain',       color: '#00e676', items: bookings.filter(b => b.start_date.slice(0, 10) === tomorrowStr && b.status !== 'cancelled') },
    { label: 'Cette semaine',color: '#ff9500', items: bookings.filter(b => b.start_date.slice(0, 10) > tomorrowStr && b.start_date.slice(0, 10) <= weekStr && b.status !== 'cancelled') },
    { label: 'Plus tard',    color: 'rgba(255,255,255,0.3)', items: bookings.filter(b => b.start_date.slice(0, 10) > weekStr && b.status !== 'cancelled') },
    { label: 'Passé',        color: 'rgba(255,255,255,0.2)', items: bookings.filter(b => b.start_date < now.toISOString() && b.status !== 'cancelled').reverse() },
  ];

  const STATUS_COLOR: Record<string, string> = { confirmed: '#00d4ff', pending: '#ff9500', completed: '#00e676', cancelled: '#ff3366' };
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
      ) : bookings.filter(b => b.status !== 'cancelled').length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Aucune {cfg.bookingLabel.toLowerCase()} planifiée</div>
        </div>
      ) : (
        groups.filter(g => g.items.length > 0).map(g => (
          <div key={g.label} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, color: g.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {g.label} · {g.items.length}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map(b => (
                <div key={b.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATUS_COLOR[b.status] ?? '#888'}20`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>{b.customer_name}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      {fmtDate(b.start_date)} · {fmtTime(b.start_date)}
                      {b.item_name && ` · ${b.item_name}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {b.amount ? <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00e676' }}>{b.amount.toLocaleString('fr-FR')}</div> : null}
                    <div style={{ fontFamily: 'Inter', fontSize: 9, color: STATUS_COLOR[b.status] ?? '#888', marginTop: 2 }}>{b.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Revenue tab ───────────────────────────────────────────────────
interface RevDay   { date: string; revenue: number; count: number; }
interface RevItem  { name: string; revenue: number; count: number; }
interface RevData  { days: RevDay[]; top_items: RevItem[]; currency: string; }

function RevenueTab({ session }: { session: OrgSession }) {
  const [stats, setStats]   = useState<SaasStats | null>(null);
  const [rev, setRev]       = useState<RevData | null>(null);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${session.token}` };

  useEffect(() => {
    Promise.all([
      fetch(`${BACKEND}/api/saas/data/stats`,   { headers }).then(r => r.json()),
      fetch(`${BACKEND}/api/saas/data/revenue`, { headers }).then(r => r.json()),
    ]).then(([s, r]) => { setStats(s as SaasStats); setRev(r as RevData); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [session.token]);

  const currency = rev?.currency ?? 'DZD';
  const fmt = (n: number) => n.toLocaleString('fr-FR');

  const maxRev = Math.max(...(rev?.days ?? []).map(d => d.revenue), 1);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            {[
              { label: "Revenus aujourd'hui", value: fmt(stats?.today_revenue ?? 0), sub: currency, color: '#00d4ff' },
              { label: 'Revenus ce mois',     value: fmt(stats?.month_revenue ?? 0), sub: currency, color: '#00e676' },
              { label: 'Réservations/mois',   value: String(stats?.month_bookings ?? 0), sub: 'confirmées', color: '#ff9500' },
              { label: 'Total historique',    value: String(stats?.total_items ?? 0),    sub: 'articles',     color: 'rgba(255,255,255,0.5)' },
            ].map(k => (
              <div key={k.label} style={{ padding: '14px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${k.color}20`, borderRadius: 14 }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.sub}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Bar chart last 14 days */}
          {rev && rev.days.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={S.sectionLabel}>30 derniers jours</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, padding: '0 4px' }}>
                {rev.days.slice(-14).map(d => (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: '100%', background: d.revenue > 0 ? '#00d4ff' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', height: `${Math.max(4, (d.revenue / maxRev) * 52)}px`, transition: 'height 0.3s ease' }} />
                    <div style={{ fontFamily: 'Inter', fontSize: 7, color: 'rgba(255,255,255,0.2)', transform: 'rotate(-45deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>
                      {new Date(d.date).getDate()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top items */}
          {rev && rev.top_items.length > 0 && (
            <div>
              <div style={S.sectionLabel}>Top par revenu</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rev.top_items.map((item, i) => {
                  const pct = Math.round((item.revenue / (rev.top_items[0]?.revenue ?? 1)) * 100);
                  return (
                    <div key={item.name} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: 'rgba(0,212,255,0.4)', width: 14 }}>#{i + 1}</div>
                          <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{item.name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00e676' }}>{fmt(item.revenue)}</div>
                          <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{item.count} rés.</div>
                        </div>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#00d4ff', borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(!rev || rev.days.length === 0) && (
            <div style={{ textAlign: 'center', paddingTop: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>💰</div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Aucune donnée financière encore</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Clients tab ───────────────────────────────────────────────────
interface ClientSummary { name: string; phone?: string; bookings: number; spent: number; currency: string; lastDate: string; }

function ClientsTab({ session }: { session: OrgSession }) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${session.token}` };

  useEffect(() => {
    fetch(`${BACKEND}/api/saas/data/bookings?limit=500`, { headers })
      .then(r => r.json())
      .then((bookings: SaasBooking[]) => {
        const map = new Map<string, ClientSummary>();
        for (const b of bookings) {
          const key = b.customer_name.toLowerCase().trim();
          const existing = map.get(key);
          if (existing) {
            existing.bookings++;
            existing.spent += b.amount ?? 0;
            if (b.start_date > existing.lastDate) existing.lastDate = b.start_date;
          } else {
            map.set(key, { name: b.customer_name, phone: b.customer_phone, bookings: 1, spent: b.amount ?? 0, currency: b.currency ?? 'DZD', lastDate: b.start_date });
          }
        }
        setClients([...map.values()].sort((a, b) => b.spent - a.spent));
      }).catch(() => {}).finally(() => setLoading(false));
  }, [session.token]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Aucun client encore</div>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
            {clients.length} client{clients.length > 1 ? 's' : ''} · triés par dépense
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clients.map((c, i) => (
              <div key={c.name} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: i < 3 ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${i < 3 ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700,
                    color: i < 3 ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                  }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>{c.name}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                      {c.phone ?? ''}{c.phone ? ' · ' : ''}{c.bookings} rés. · dernier {fmtDate(c.lastDate)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {c.spent > 0 && (
                    <div style={{ fontFamily: 'Orbitron', fontSize: 12, color: '#00e676' }}>
                      {c.spent.toLocaleString('fr-FR')}
                    </div>
                  )}
                  {c.spent > 0 && <div style={{ fontFamily: 'Inter', fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>{c.currency}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sector data tab config ────────────────────────────────────────
const SECTOR_TAB_CFG: Record<string, { icon: string; label: string; itemType: string; itemLabel: string; bookingLabel: string; dateLabel: string }> = {
  car_rental:  { icon: '🚗', label: 'Parc',         itemType: 'car',      itemLabel: 'Véhicule',    bookingLabel: 'Location',      dateLabel: 'Début' },
  restaurant:  { icon: '🍽️', label: 'Resas',        itemType: 'table',    itemLabel: 'Table',       bookingLabel: 'Réservation',   dateLabel: 'Date' },
  hotel:       { icon: '🏨', label: 'Chambres',      itemType: 'room',     itemLabel: 'Chambre',     bookingLabel: 'Réservation',   dateLabel: 'Arrivée' },
  doctor:      { icon: '📅', label: 'Agenda',        itemType: 'service',  itemLabel: 'Service',     bookingLabel: 'Consultation',  dateLabel: 'Date RDV' },
  lawyer:      { icon: '⚖️', label: 'Dossiers',      itemType: 'service',  itemLabel: 'Service',     bookingLabel: 'Rendez-vous',   dateLabel: 'Date RDV' },
  real_estate: { icon: '🏠', label: 'Biens',         itemType: 'property', itemLabel: 'Bien',        bookingLabel: 'Visite',        dateLabel: 'Date visite' },
  retail:       { icon: '🛍️', label: 'Stock',         itemType: 'product',  itemLabel: 'Produit',     bookingLabel: 'Commande',      dateLabel: 'Date' },
  beauty:       { icon: '💇', label: 'Planning',      itemType: 'service',  itemLabel: 'Service',     bookingLabel: 'Rendez-vous',   dateLabel: 'Date RDV' },
  auto_school:  { icon: '🚦', label: 'Élèves',        itemType: 'student',  itemLabel: 'Élève',       bookingLabel: 'Leçon',         dateLabel: 'Date leçon' },
  construction: { icon: '🏗️', label: 'Chantiers',     itemType: 'project',  itemLabel: 'Chantier',    bookingLabel: 'Intervention',  dateLabel: 'Date début' },
  ecommerce:    { icon: '📦', label: 'Commandes',      itemType: 'product',  itemLabel: 'Produit',     bookingLabel: 'Commande',      dateLabel: 'Date' },
  custom:       { icon: '📋', label: 'Données',        itemType: 'item',     itemLabel: 'Article',     bookingLabel: 'Réservation',   dateLabel: 'Date' },
};
function getSectorTabIcon(sector: string)  { return SECTOR_TAB_CFG[sector]?.icon  ?? '📋'; }
function getSectorTabLabel(sector: string) { return SECTOR_TAB_CFG[sector]?.label ?? 'Données'; }
function getSectorTabCfg(sector: string)   { return SECTOR_TAB_CFG[sector] ?? SECTOR_TAB_CFG['custom']!; }

// ── Booking / Item interfaces ─────────────────────────────────────
interface SaasBooking {
  id: string; customer_name: string; customer_phone?: string;
  item_name?: string; start_date: string; end_date?: string;
  status: string; amount?: number; currency?: string; guests?: number; notes?: string;
}
interface SaasItem {
  id: string; name: string; type?: string; status: string;
  price_per_day?: number; price_per_unit?: number; currency?: string; capacity?: number;
}
interface SaasStats {
  today_bookings: number; today_revenue: number;
  month_bookings: number; month_revenue: number;
  total_items: number; available_items: number;
}

// ── Data tab ──────────────────────────────────────────────────────
type DataSubTab = 'bookings' | 'items';

function DataTab({ session }: { session: OrgSession }) {
  const cfg = getSectorTabCfg(session.sector);
  const [subTab, setSubTab]       = useState<DataSubTab>('bookings');
  const [bookings, setBookings]   = useState<SaasBooking[]>([]);
  const [items, setItems]         = useState<SaasItem[]>([]);
  const [stats, setStats]         = useState<SaasStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [showBookForm, setShowBookForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);

  const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    try {
      const [bRes, iRes, sRes] = await Promise.all([
        fetch(`${BACKEND}/api/saas/data/bookings`, { headers }),
        fetch(`${BACKEND}/api/saas/data/items`,    { headers }),
        fetch(`${BACKEND}/api/saas/data/stats`,    { headers }),
      ]);
      if (bRes.ok) setBookings(await bRes.json() as SaasBooking[]);
      if (iRes.ok) setItems(await iRes.json() as SaasItem[]);
      if (sRes.ok) setStats(await sRes.json() as SaasStats);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void load(); }, [session.token]);

  const deleteBooking = async (id: string) => {
    await fetch(`${BACKEND}/api/saas/data/bookings/${id}`, { method: 'DELETE', headers });
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const updateBookingStatus = async (id: string, status: string) => {
    const r = await fetch(`${BACKEND}/api/saas/data/bookings/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const updated = await r.json() as SaasBooking;
      setBookings(prev => prev.map(b => b.id === id ? updated : b));
    }
  };

  const deleteItem = async (id: string) => {
    await fetch(`${BACKEND}/api/saas/data/items/${id}`, { method: 'DELETE', headers });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItemStatus = async (id: string, status: string) => {
    const r = await fetch(`${BACKEND}/api/saas/data/items/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const updated = await r.json() as SaasItem;
      setItems(prev => prev.map(i => i.id === id ? updated : i));
    }
  };

  const STATUS_COLOR: Record<string, string> = {
    confirmed: '#00d4ff', pending: '#ff9500', cancelled: '#ff3366',
    completed: '#00e676', available: '#00e676', unavailable: '#ff3366', maintenance: '#ff9500',
  };
  const STATUS_LABEL: Record<string, string> = {
    confirmed: 'Confirmé', pending: 'En attente', cancelled: 'Annulé',
    completed: 'Terminé', available: 'Disponible', unavailable: 'Indisponible', maintenance: 'Maintenance',
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtAmt  = (a?: number, c?: string) => a ? `${a.toLocaleString('fr-FR')} ${c ?? 'DZD'}` : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Stats bar */}
      {stats && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 0, borderBottom: '1px solid rgba(0,212,255,0.07)', background: 'rgba(0,0,0,0.3)' }}>
          {[
            { label: "Aujourd'hui", value: String(stats.today_bookings), sub: cfg.bookingLabel + 's' },
            { label: 'Ce mois', value: String(stats.month_bookings), sub: cfg.bookingLabel + 's' },
            { label: 'Inventaire', value: `${stats.available_items}/${stats.total_items}`, sub: 'disponibles' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(0,212,255,0.07)' : 'none' }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 16, fontWeight: 700, color: '#00d4ff' }}>{s.value}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid rgba(0,212,255,0.07)' }}>
        {([
          { id: 'bookings' as DataSubTab, label: cfg.bookingLabel + 's', count: bookings.length },
          { id: 'items'    as DataSubTab, label: cfg.itemLabel + 's',    count: items.length },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              flex: 1, height: 36, background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${subTab === t.id ? '#00d4ff' : 'transparent'}`,
              fontFamily: 'Inter', fontSize: 11, fontWeight: subTab === t.id ? 700 : 400,
              color: subTab === t.id ? '#00d4ff' : 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: subTab === t.id ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.07)', color: subTab === t.id ? '#00d4ff' : 'rgba(255,255,255,0.3)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
        ) : subTab === 'bookings' ? (
          <div style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{bookings.length} {cfg.bookingLabel.toLowerCase()}{bookings.length > 1 ? 's' : ''}</div>
              <button onClick={() => setShowBookForm(true)} style={{ padding: '6px 14px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 20, fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#00d4ff', cursor: 'pointer' }}>
                + Nouveau
              </button>
            </div>

            {bookings.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Aucune {cfg.bookingLabel.toLowerCase()} pour l'instant</div>
                <button onClick={() => setShowBookForm(true)} style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 12, fontFamily: 'Inter', fontSize: 12, color: '#00d4ff', cursor: 'pointer' }}>
                  Créer la première
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bookings.map(b => (
                  <div key={b.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{b.customer_name}</div>
                        {b.item_name && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(0,212,255,0.6)', marginTop: 2 }}>{b.item_name}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'Inter', padding: '3px 8px', borderRadius: 8, background: `${STATUS_COLOR[b.status] ?? '#888'}18`, color: STATUS_COLOR[b.status] ?? '#888', border: `1px solid ${STATUS_COLOR[b.status] ?? '#888'}30` }}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                      <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>📅 {fmtDate(b.start_date)}</span>
                      {b.customer_phone && <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>📞 {b.customer_phone}</span>}
                      {b.amount && <span style={{ fontFamily: 'Inter', fontSize: 11, color: '#00e676' }}>💰 {fmtAmt(b.amount, b.currency)}</span>}
                    </div>
                    {/* Status actions */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' as const }}>
                      {b.status !== 'completed'  && <button onClick={() => updateBookingStatus(b.id, 'completed')}  style={S.microBtn('#00e676')}>✓ Terminé</button>}
                      {b.status !== 'cancelled'  && <button onClick={() => updateBookingStatus(b.id, 'cancelled')}  style={S.microBtn('#ff3366')}>✕ Annuler</button>}
                      {b.status !== 'confirmed'  && b.status !== 'completed' && <button onClick={() => updateBookingStatus(b.id, 'confirmed')} style={S.microBtn('#00d4ff')}>✓ Confirmer</button>}
                      <button onClick={() => deleteBooking(b.id)} style={S.microBtn('rgba(255,255,255,0.2)')}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Items sub-tab */
          <div style={{ padding: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{items.length} {cfg.itemLabel.toLowerCase()}{items.length > 1 ? 's' : ''}</div>
              <button onClick={() => setShowItemForm(true)} style={{ padding: '6px 14px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 20, fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#00d4ff', cursor: 'pointer' }}>
                + Ajouter
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{cfg.icon}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>Aucun {cfg.itemLabel.toLowerCase()} ajouté</div>
                <button onClick={() => setShowItemForm(true)} style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 12, fontFamily: 'Inter', fontSize: 12, color: '#00d4ff', cursor: 'pointer' }}>
                  Ajouter le premier
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {items.map(item => (
                  <div key={item.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${STATUS_COLOR[item.status] ?? '#888'}20`, borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', flex: 1, marginRight: 6, wordBreak: 'break-word' as const }}>{item.name}</div>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: STATUS_COLOR[item.status] ?? '#888', marginTop: 3 }} />
                    </div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: STATUS_COLOR[item.status] ?? '#888', marginBottom: 4 }}>{STATUS_LABEL[item.status] ?? item.status}</div>
                    {item.price_per_day && <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(0,212,255,0.6)' }}>{item.price_per_day.toLocaleString('fr-FR')} {item.currency ?? 'DZD'}/j</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      {item.status !== 'available'   && <button onClick={() => updateItemStatus(item.id, 'available')}   style={S.microBtn('#00e676')}>Dispo</button>}
                      {item.status !== 'unavailable' && <button onClick={() => updateItemStatus(item.id, 'unavailable')} style={S.microBtn('#ff3366')}>Indispo</button>}
                      <button onClick={() => deleteItem(item.id)} style={S.microBtn('rgba(255,255,255,0.2)')}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Booking Modal */}
      {showBookForm && (
        <BookingFormModal
          session={session} cfg={cfg}
          items={items}
          onClose={() => setShowBookForm(false)}
          onCreated={(b) => { setBookings(prev => [b, ...prev]); setShowBookForm(false); }}
        />
      )}

      {/* Add Item Modal */}
      {showItemForm && (
        <ItemFormModal
          session={session} cfg={cfg}
          onClose={() => setShowItemForm(false)}
          onCreated={(i) => { setItems(prev => [...prev, i]); setShowItemForm(false); }}
        />
      )}
    </div>
  );
}

// ── Booking form modal ────────────────────────────────────────────
function BookingFormModal({ session, cfg, items, onClose, onCreated }: {
  session: OrgSession;
  cfg: ReturnType<typeof getSectorTabCfg>;
  items: SaasItem[];
  onClose: () => void;
  onCreated: (b: SaasBooking) => void;
}) {
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [itemName, setItemNm] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd]     = useState('');
  const [amount, setAmount]   = useState('');
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (!name || !startDate) { setError('Nom et date sont requis'); return; }
    setLoading(true); setError('');
    try {
      const body: Record<string, string | number> = { customer_name: name, start_date: new Date(startDate).toISOString() };
      if (phone)    body['customer_phone'] = phone;
      if (itemName) body['item_name'] = itemName;
      if (endDate)  body['end_date'] = new Date(endDate).toISOString();
      if (amount)   body['amount'] = parseFloat(amount);
      if (notes)    body['notes'] = notes;

      const r = await fetch(`${BACKEND}/api/saas/data/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json() as SaasBooking | { error: string };
      if (!r.ok) { setError((data as { error: string }).error ?? 'Erreur'); return; }
      onCreated(data as SaasBooking);
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ background: 'radial-gradient(ellipse at 50% 100%, #060f22 0%, #020810 100%)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '24px 24px 0 0', padding: '20px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.15em' }}>
            NOUVELLE {cfg.bookingLabel.toUpperCase()}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>✕</button>
        </div>

        {[
          { label: `Nom du client *`, value: name, set: setName, placeholder: 'Prénom Nom' },
          { label: 'Téléphone', value: phone, set: setPhone, placeholder: '+213 6xx xxx xxx' },
          { label: cfg.itemLabel + (items.length > 0 ? ' (sélectionner ou saisir)' : ''), value: itemName, set: setItemNm, placeholder: `Ex: ${cfg.itemType === 'car' ? 'Toyota Corolla' : cfg.itemType === 'room' ? 'Chambre 12' : cfg.itemType === 'table' ? 'Table 5' : 'Service'}` },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 12 }}>
            <div style={S.inputLabel}>{f.label}</div>
            {f.label.includes('sélectionner') && items.length > 0 ? (
              <select value={f.value} onChange={e => f.set(e.target.value)} style={{ ...S.input, WebkitAppearance: 'none' }}>
                <option value="">— Saisir manuellement —</option>
                {items.filter(i => i.status === 'available').map(i => (
                  <option key={i.id} value={i.name}>{i.name}</option>
                ))}
              </select>
            ) : (
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={S.input} />
            )}
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={S.inputLabel}>{cfg.dateLabel} *</div>
            <input type="datetime-local" value={startDate} onChange={e => setStart(e.target.value)} style={{ ...S.input, colorScheme: 'dark' }} />
          </div>
          <div>
            <div style={S.inputLabel}>Fin</div>
            <input type="datetime-local" value={endDate} onChange={e => setEnd(e.target.value)} style={{ ...S.input, colorScheme: 'dark' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={S.inputLabel}>Montant (DZD)</div>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={S.input} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={S.inputLabel}>Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Informations supplémentaires…" rows={2} style={{ ...S.input, resize: 'none', maxHeight: 80 }} />
        </div>

        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Création…' : `Créer la ${cfg.bookingLabel.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

// ── Item form modal ───────────────────────────────────────────────
const SECTOR_ITEM_EXTRA: Record<string, { label: string; key: string; placeholder: string; type?: string }[]> = {
  car_rental: [
    { label: 'Immatriculation', key: 'plate',   placeholder: '123-TUN-16' },
    { label: 'Couleur',         key: 'color',   placeholder: 'Blanc, Noir…' },
    { label: 'Année',           key: 'year',    placeholder: '2022', type: 'number' },
    { label: 'Kilométrage',     key: 'mileage', placeholder: '45000', type: 'number' },
  ],
  restaurant: [
    { label: 'Catégorie',   key: 'category',    placeholder: 'Entrée / Plat / Dessert / Boisson' },
    { label: 'Description', key: 'description', placeholder: 'Description du plat…' },
    { label: 'Localisation',key: 'location',    placeholder: 'Intérieur / Terrasse / Salon VIP' },
  ],
  hotel: [
    { label: 'Étage',       key: 'floor',    placeholder: '1, 2, 3…', type: 'number' },
    { label: 'Type de lit', key: 'bed_type', placeholder: 'Simple / Double / Twin / King' },
    { label: 'Vue',         key: 'view',     placeholder: 'Mer / Jardin / Ville' },
    { label: 'N° chambre',  key: 'room_number', placeholder: '101, 204…' },
  ],
  doctor: [
    { label: 'Durée (min)', key: 'duration',     placeholder: '30', type: 'number' },
    { label: 'Type',        key: 'service_type', placeholder: 'Consultation / Spécialiste / Urgence' },
  ],
  lawyer: [
    { label: 'Domaine',   key: 'domain',       placeholder: 'Pénal / Civil / Commercial / Immobilier' },
    { label: 'Durée (h)', key: 'duration',     placeholder: '1', type: 'number' },
  ],
  real_estate: [
    { label: 'Surface (m²)', key: 'surface',   placeholder: '85', type: 'number' },
    { label: 'Type',         key: 'prop_type', placeholder: 'Appartement / Villa / Bureau / Local' },
    { label: 'Quartier',     key: 'district',  placeholder: 'Hay Badr, Centre-ville…' },
    { label: 'Étage',        key: 'floor',     placeholder: '2', type: 'number' },
  ],
  retail: [
    { label: 'Référence',  key: 'ref',          placeholder: 'SKU-001' },
    { label: 'Catégorie',  key: 'category',     placeholder: 'Vêtements / Chaussures / Accessoires' },
    { label: 'Stock',      key: 'stock',        placeholder: '50', type: 'number' },
  ],
};

function ItemFormModal({ session, cfg, onClose, onCreated }: {
  session: OrgSession;
  cfg: ReturnType<typeof getSectorTabCfg>;
  onClose: () => void;
  onCreated: (i: SaasItem) => void;
}) {
  const [name, setName]       = useState('');
  const [price, setPrice]     = useState('');
  const [capacity, setCap]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [metaFields, setMeta] = useState<Record<string, string>>({});

  const extraFields = SECTOR_ITEM_EXTRA[session.sector] ?? [];

  const submit = async () => {
    if (!name) { setError('Nom requis'); return; }
    setLoading(true); setError('');
    try {
      const body: Record<string, unknown> = { name, type: cfg.itemType };
      if (price)    body['price_per_day'] = parseFloat(price);
      if (capacity) body['capacity'] = parseInt(capacity, 10);
      if (Object.keys(metaFields).length > 0) body['metadata'] = metaFields;

      const r = await fetch(`${BACKEND}/api/saas/data/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json() as SaasItem | { error: string };
      if (!r.ok) { setError((data as { error: string }).error ?? 'Erreur'); return; }
      onCreated(data as SaasItem);
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  };

  const itemExamples: Record<string, string> = {
    car: 'Toyota Corolla, Renault Symbol…', room: 'Chambre 101, Suite Deluxe…',
    table: 'Table 1, Terrasse 3…', service: 'Consultation 30min…',
    property: '3 pièces Oran, Villa Bir El Djir…', product: 'T-shirt M, Chaussures 42…',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ background: 'radial-gradient(ellipse at 50% 100%, #060f22 0%, #020810 100%)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '24px 24px 0 0', padding: '20px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.15em' }}>
            AJOUTER {cfg.itemLabel.toUpperCase()}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={S.inputLabel}>Nom *</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={itemExamples[cfg.itemType] ?? 'Nom'} style={S.input} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={S.inputLabel}>Prix / jour (DZD)</div>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" style={S.input} />
          </div>
          <div>
            <div style={S.inputLabel}>{cfg.itemType === 'car' ? 'Passagers' : cfg.itemType === 'table' ? 'Couverts' : cfg.itemType === 'room' ? 'Personnes' : 'Capacité'}</div>
            <input type="number" value={capacity} onChange={e => setCap(e.target.value)} placeholder="1" style={S.input} />
          </div>
        </div>

        {/* Sector-specific extra fields */}
        {extraFields.length > 0 && (
          <>
            <div style={{ ...S.sectionLabel, marginBottom: 10 }}>Détails {cfg.itemLabel.toLowerCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {extraFields.map(f => (
                <div key={f.key}>
                  <div style={S.inputLabel}>{f.label}</div>
                  <input
                    type={f.type ?? 'text'}
                    value={metaFields[f.key] ?? ''}
                    onChange={e => setMeta(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={S.input}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={submit} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Ajout…' : `Ajouter ${cfg.itemLabel.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  page: {
    width: '100%', height: '100%',
    background: 'radial-gradient(ellipse at 50% 20%, #040d1e 0%, #020810 50%, #000 100%)',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  safeTop: { height: 'env(safe-area-inset-top, 0px)' } as React.CSSProperties,
  landingContent: { padding: '32px 24px', maxWidth: 480, margin: '0 auto' } as React.CSSProperties,
  formHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid rgba(0,212,255,0.07)',
  } as React.CSSProperties,
  formTitle: {
    fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700,
    color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em',
  } as React.CSSProperties,
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'Inter', fontSize: 13, color: 'rgba(0,212,255,0.7)',
    padding: '4px 0', width: 60,
  } as React.CSSProperties,
  formScroll: { padding: '20px 20px', overflowY: 'auto' as const, maxWidth: 480, margin: '0 auto' } as React.CSSProperties,
  sectionLabel: {
    fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
    color: 'rgba(0,212,255,0.5)', letterSpacing: '0.12em',
    textTransform: 'uppercase' as const, marginBottom: 12,
  },
  inputLabel: {
    fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
    color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em',
    marginBottom: 6, textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%', boxSizing: 'border-box' as const,
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '12px 14px',
    fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', outline: 'none',
  } as React.CSSProperties,
  btnPrimary: {
    width: '100%', padding: '15px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,180,220,0.15) 100%)',
    border: '1.5px solid rgba(0,212,255,0.45)', borderRadius: 14,
    fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00d4ff',
    cursor: 'pointer', letterSpacing: '0.15em', boxShadow: '0 0 20px rgba(0,212,255,0.15)',
  } as React.CSSProperties,
  btnSecondary: {
    width: '100%', padding: '14px',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
    fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDisabled: {
    width: '100%', padding: '15px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
    fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.2)', cursor: 'default',
  } as React.CSSProperties,
  errorText: { fontFamily: 'Inter', fontSize: 12, color: '#ff3366', textAlign: 'center' as const, marginBottom: 12 },
  divider: { height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' },
  microBtn: (color: string): React.CSSProperties => ({
    padding: '3px 8px', borderRadius: 6, border: `1px solid ${color}44`,
    background: `${color}10`, color, fontFamily: 'Inter', fontSize: 9, fontWeight: 600,
    cursor: 'pointer', letterSpacing: '0.04em',
  }),
};
