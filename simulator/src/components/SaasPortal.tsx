import { useState, useEffect, useRef } from 'react';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

type Mode = 'landing' | 'signup' | 'login' | 'onboarding' | 'chat' | 'forgot' | 'reset';
type Tab  = 'chat' | 'actions' | 'agenda' | 'data' | 'revenue' | 'clients' | 'account' | 'admin';

interface OrgSession {
  token:         string;
  ai_name:       string;
  business_name: string;
  sector:        string;
  org_id:        string;
  email?:        string;
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
    { icon: '📋', text: 'Réservations du jour par service (midi/soir) — tables, couverts, statut en temps réel' },
    { icon: '🍽️', text: 'Menu du jour généré par l\'IA selon vos spéciaux et la saison' },
    { icon: '📸', text: 'Posts Instagram et légendes créatives générés automatiquement' },
    { icon: '⭐', text: 'Réponses professionnelles aux avis Google et TripAdvisor' },
    { icon: '💰', text: 'CA par service, plats best-sellers, analyse des ventes hebdomadaires' },
  ],
  car_rental: [
    { icon: '🚗', text: 'Gérer les réservations et votre parc véhicules' },
    { icon: '💰', text: 'Calculer revenus, profits et statistiques par voiture' },
    { icon: '📅', text: 'Suivre disponibilités et planifier les locations' },
    { icon: '📱', text: 'Envoyer confirmations et rappels clients automatiquement' },
    { icon: '📊', text: 'Analyser votre activité semaine par semaine' },
  ],
  hotel: [
    { icon: '🏨', text: 'Check-ins et check-outs du jour — chambres prêtes, arrivées à venir' },
    { icon: '📊', text: 'Taux d\'occupation en temps réel et RevPAR (revenu par chambre)' },
    { icon: '✉️', text: 'Emails de bienvenue personnalisés et réponses Booking.com/TripAdvisor' },
    { icon: '🔔', text: 'Gestion des demandes spéciales clients (early check-in, allergies, préférences)' },
    { icon: '💰', text: 'Optimisation tarifaire selon le taux d\'occupation et la saison' },
  ],
  lawyer: [
    { icon: '⚖️', text: 'Rédaction de courriers, mises en demeure, actes et notes juridiques' },
    { icon: '🗓️', text: 'Agenda des audiences, délais de procédure et échéances critiques' },
    { icon: '📄', text: 'Résumé et analyse de documents juridiques complexes' },
    { icon: '💼', text: 'Suivi des dossiers clients, facturation et honoraires par affaire' },
    { icon: '⚡', text: 'Alertes automatiques sur les délais urgents — zéro oubli' },
  ],
  doctor: [
    { icon: '📅', text: 'Planning des consultations du jour — patients, horaires, motifs' },
    { icon: '📄', text: 'Templates de comptes-rendus et ordonnances types à personnaliser' },
    { icon: '📱', text: 'Rappels de rendez-vous automatiques envoyés aux patients' },
    { icon: '📊', text: 'Statistiques d\'activité — nb consultations, motifs fréquents, tendances' },
    { icon: '🔒', text: 'Données patients traitées avec discrétion absolue' },
  ],
  real_estate: [
    { icon: '🏠', text: 'Portefeuille complet — biens disponibles, en visite, sous compromis, vendus' },
    { icon: '✍️', text: 'Annonces immobilières percutantes rédigées par l\'IA en 30 secondes' },
    { icon: '📅', text: 'Planning des visites optimisé — aucun rendez-vous manqué' },
    { icon: '💰', text: 'Estimation prix au m², rentabilité locative, analyse marché local' },
    { icon: '📱', text: 'Suivi prospects et messages de relance personnalisés automatiques' },
  ],
  retail: [
    { icon: '🛍️', text: 'Stock en temps réel — alertes automatiques produits en rupture' },
    { icon: '💰', text: 'Ventes du jour, marges par produit, best-sellers du mois' },
    { icon: '🎯', text: 'Promotions et offres flash créées en 1 tap — prêtes à publier' },
    { icon: '📸', text: 'Posts Instagram/Facebook/TikTok générés avec hashtags locaux' },
    { icon: '⭐', text: 'Programme fidélité et relances clients personnalisées automatiques' },
  ],
  beauty: [
    { icon: '💇', text: 'Planning par coiffeur/technicien — qui fait quoi, créneaux libres en temps réel' },
    { icon: '📱', text: 'Rappels de RDV automatiques (message WhatsApp prêt à envoyer)' },
    { icon: '💰', text: 'CA par coiffeur, par service, par semaine — qui performe le mieux' },
    { icon: '📸', text: 'Légendes Instagram avant/après avec hashtags beauté et locaux' },
    { icon: '🎁', text: 'Campagnes fidélité — offre retour 6 semaines, cadeau anniversaire client' },
  ],
  auto_school: [
    { icon: '🚦', text: 'Planning leçons du jour — élève, moniteur, véhicule (manuelle/auto)' },
    { icon: '📈', text: 'Progression de chaque élève — heures faites, restantes, points à améliorer' },
    { icon: '🎯', text: 'Élèves prêts pour l\'examen — identification automatique selon la progression' },
    { icon: '💰', text: 'Suivi paiements — acomptes reçus, soldes dus, relances automatiques' },
    { icon: '📱', text: 'Rappels de leçon automatiques — plus d\'absences de dernière minute' },
  ],
  construction: [
    { icon: '🏗️', text: 'État en temps réel de tous vos chantiers — avancement, délais, équipes' },
    { icon: '📋', text: 'Devis professionnels détaillés générés par l\'IA (main-d\'œuvre + matériaux + marge)' },
    { icon: '🧾', text: 'Factures de situation et bons de commande matériaux en quelques secondes' },
    { icon: '⚠️', text: 'Alertes retards, dépassements de budget et commandes urgentes' },
    { icon: '💰', text: 'Rentabilité par chantier — coûts réels vs budget prévu' },
  ],
  ecommerce: [
    { icon: '📦', text: 'Commandes du jour — nouvelles, en préparation, expédiées, livrées, retours' },
    { icon: '🚚', text: 'Suivi livraisons en temps réel — statuts et alertes retards transporteur' },
    { icon: '✍️', text: 'Fiches produits optimisées SEO générées par l\'IA en 30 secondes' },
    { icon: '⭐', text: 'Réponses aux avis clients — positifs et négatifs — professionnelles et rapides' },
    { icon: '💰', text: 'CA, marges, best-sellers, stock bas — tableau de bord complet' },
  ],
  custom: [
    { icon: '🤖', text: 'Assistant IA 100% adapté à votre activité et votre vocabulaire métier' },
    { icon: '🌍', text: 'Répond en français, arabe (darija), anglais, espagnol' },
    { icon: '📊', text: 'Analyse vos données et génère des rapports d\'activité personnalisés' },
    { icon: '📋', text: 'Rédige emails, courriers, posts réseaux sociaux et documents' },
    { icon: '⚡', text: 'Automatise les tâches répétitives et vous libère du temps' },
  ],
};

const SECTOR_KNOWLEDGE_FIELDS: Record<string, { key: string; label: string; placeholder: string; textarea?: boolean }[]> = {
  restaurant: [
    { key: 'menu',          label: 'Menu / Carte',              placeholder: 'Entrées, plats, desserts, prix…', textarea: true },
    { key: 'chef',          label: 'Chef / Cuisine',            placeholder: 'Ex: Chef Ahmed, cuisine méditerranéenne' },
    { key: 'capacity',      label: 'Capacité (couverts)',       placeholder: 'Ex: 60 couverts, 2 salles' },
    { key: 'specialties',   label: 'Spécialités maison',        placeholder: 'Ex: Tajine, couscous royal, pastilla…' },
    { key: 'staff',         label: 'Équipe',                    placeholder: 'Ex: 3 serveurs, 2 cuisiniers…' },
    { key: 'services',      label: 'Services proposés',         placeholder: 'Ex: midi 12h-15h, soir 19h-23h, terrasse' },
  ],
  hotel: [
    { key: 'total_rooms',   label: 'Chambres / Types',          placeholder: 'Ex: 24 ch: 10 standard, 8 sup., 4 suites' },
    { key: 'amenities',     label: 'Équipements / Services',    placeholder: 'Ex: piscine, spa, wifi, parking, resto…' },
    { key: 'checkin_time',  label: 'Check-in / Check-out',      placeholder: 'Ex: Check-in 14h, check-out 12h' },
    { key: 'star_rating',   label: 'Classement',                placeholder: 'Ex: 4 étoiles, Riad 5* Tripadvisor' },
    { key: 'staff',         label: 'Équipe clé',                placeholder: 'Ex: Directeur: M. Benali, réception 24/7' },
    { key: 'specialties',   label: 'Atouts / Points forts',     placeholder: 'Ex: vue mer, proche aéroport, salle conf.' },
  ],
  lawyer: [
    { key: 'domains',       label: 'Domaines juridiques',       placeholder: 'Ex: droit commercial, immobilier, pénal…' },
    { key: 'staff',         label: 'Équipe / Associés',         placeholder: 'Ex: Maître Benali + 2 collaborateurs' },
    { key: 'languages',     label: 'Langues de travail',        placeholder: 'Ex: français, arabe, anglais' },
    { key: 'fees',          label: 'Honoraires / Tarifs',       placeholder: 'Ex: consultation 3 000 DA, forfaits…' },
    { key: 'specialties',   label: 'Spécialisations',           placeholder: 'Ex: divorce, licenciement, recouvrement' },
  ],
  doctor: [
    { key: 'specialties',   label: 'Spécialité(s)',             placeholder: 'Ex: médecine générale, cardiologie…' },
    { key: 'staff',         label: 'Équipe médicale',           placeholder: 'Ex: Dr. Bensalem + 1 infirmière' },
    { key: 'equipment',     label: 'Équipements / Actes',       placeholder: 'Ex: écho, ECG, spirométrie, chirurgical' },
    { key: 'fees',          label: 'Tarifs consultation',       placeholder: 'Ex: consultation 1 500 DA' },
    { key: 'services',      label: 'Services spécifiques',      placeholder: 'Ex: urgences, vaccins, certificats médicaux' },
  ],
  beauty: [
    { key: 'staff',         label: 'Équipe / Coiffeurs',        placeholder: 'Ex: Karima (coloriste), Sofia (esthét.)' },
    { key: 'menu',          label: 'Tarifs & Services',         placeholder: 'Ex: coupe femme 800 DA, couleur 2500 DA…', textarea: true },
    { key: 'brands_used',   label: 'Marques utilisées',         placeholder: 'Ex: L\'Oréal, Wella, OPI, Kérastase…' },
    { key: 'specialties',   label: 'Spécialités',               placeholder: 'Ex: balayage, kératine, extensions, nail art' },
  ],
  auto_school: [
    { key: 'staff',         label: 'Moniteurs / Formateurs',    placeholder: 'Ex: M. Hadj (15 ans exp.), Mme Amira…' },
    { key: 'vehicles',      label: 'Véhicules',                 placeholder: 'Ex: 3 Clio manuelle, 2 Yaris automatique' },
    { key: 'menu',          label: 'Forfaits / Tarifs',         placeholder: 'Ex: Code 5 000 DA, Permis B 35 000 DA…', textarea: true },
    { key: 'license_types', label: 'Permis proposés',           placeholder: 'Ex: Permis B, A (moto), C (poids lourd)' },
    { key: 'specialties',   label: 'Points forts',              placeholder: 'Ex: taux réussite 85%, conduite accompagnée' },
  ],
  construction: [
    { key: 'specialties',   label: 'Travaux / Spécialités',     placeholder: 'Ex: gros œuvre, carrelage, plomberie…' },
    { key: 'coverage_areas',label: 'Zones d\'intervention',     placeholder: 'Ex: Oran, Tlemcen, Sidi Bel Abbès' },
    { key: 'staff',         label: 'Équipe / Ouvriers',         placeholder: 'Ex: 12 ouvriers qualifiés, 3 chefs chantier' },
    { key: 'certifications',label: 'Agréments / Certifs',       placeholder: 'Ex: agrément bâtiment, qualibat, ISO' },
    { key: 'fees',          label: 'Tarifs / Taux horaires',    placeholder: 'Ex: main d\'œuvre 800 DA/h, devis gratuit' },
  ],
  ecommerce: [
    { key: 'product_categories', label: 'Catégories produits',  placeholder: 'Ex: vêtements, électronique, cosmétiques…' },
    { key: 'specialties',   label: 'Produits phares',           placeholder: 'Ex: robes kabyles, parfums orientaux…' },
    { key: 'delivery_zones',label: 'Zones livraison',           placeholder: 'Ex: toute Algérie, 48h Oran, domicile' },
    { key: 'return_policy', label: 'Politique retour',          placeholder: 'Ex: retour 7 jours, échange gratuit' },
    { key: 'brands_used',   label: 'Marques vendues',           placeholder: 'Ex: Nike, Zara, Samsung, marques locales' },
  ],
  retail: [
    { key: 'product_categories', label: 'Rayons / Catégories', placeholder: 'Ex: alimentation, hygiène, textile…' },
    { key: 'brands_sold',   label: 'Marques principales',       placeholder: 'Ex: Hamoud, Ifri, Soummam, Samsung…' },
    { key: 'specialties',   label: 'Produits phares',           placeholder: 'Ex: épicerie fine, produits bio, import' },
    { key: 'staff',         label: 'Équipe',                    placeholder: 'Ex: 4 vendeurs, 1 caissière, 1 magasinier' },
    { key: 'loyalty_program', label: 'Programme fidélité',      placeholder: 'Ex: carte fidélité, -10% après 10 achats' },
  ],
  real_estate: [
    { key: 'coverage_areas',label: 'Zones d\'activité',         placeholder: 'Ex: Oran centre, Bir El Djir, Es Sénia…' },
    { key: 'property_types',label: 'Types de biens',            placeholder: 'Ex: appartements, villas, locaux, terrains' },
    { key: 'staff',         label: 'Agents / Équipe',           placeholder: 'Ex: M. Benahmed (senior), 2 agents juniors' },
    { key: 'commission',    label: 'Commission / Frais',        placeholder: 'Ex: 2.5% vente, 1 mois loyer à la location' },
    { key: 'specialties',   label: 'Spécialités',               placeholder: 'Ex: neuf promoteur, prestige, investissement' },
  ],
  car_rental: [
    { key: 'fleet_details', label: 'Détails du parc',           placeholder: 'Ex: 5 berlines, 3 SUV, 2 utilitaires…' },
    { key: 'delivery_zones',label: 'Livraison véhicules',       placeholder: 'Ex: aéroport, gare, hôtels Oran +200 DA/km' },
    { key: 'specialties',   label: 'Services / Avantages',      placeholder: 'Ex: assurance incluse, sans caution, GPS offert' },
    { key: 'fees',          label: 'Conditions / Dépôt',        placeholder: 'Ex: caution 10 000 DA, permis +2 ans, 25 ans min.' },
  ],
  custom: [
    { key: 'description_full', label: 'Description complète',   placeholder: 'Décrivez votre activité en détail…', textarea: true },
    { key: 'staff',         label: 'Équipe',                    placeholder: 'Ex: 5 personnes dont 2 experts…' },
    { key: 'menu',          label: 'Services / Offres',         placeholder: 'Ex: prestation A 5 000 DA, prestation B…', textarea: true },
    { key: 'specialties',   label: 'Points forts / Valeurs',    placeholder: 'Ex: 10 ans d\'expérience, certifié…' },
  ],
};

const QUICK_ACTIONS: Record<string, { icon: string; label: string; prompt: string }[]> = {
  restaurant: [
    { icon: '📋', label: 'Réservations du jour',   prompt: 'Montre-moi toutes les réservations d\'aujourd\'hui avec les tables, le nombre de couverts et les horaires, service midi et service soir séparément' },
    { icon: '🍽️', label: 'Menu du jour',           prompt: 'Propose-moi un menu du jour complet et original (entrée, plat, dessert) avec des arguments de vente pour Instagram' },
    { icon: '💰', label: 'CA du service',           prompt: 'Quel est le chiffre d\'affaires d\'aujourd\'hui et des 7 derniers jours ? Quels sont nos plats/tables qui rapportent le plus ?' },
    { icon: '📸', label: 'Post Instagram',          prompt: 'Rédige un post Instagram percutant pour aujourd\'hui avec une belle accroche, description du spécial du jour et 10 hashtags locaux et culinaires pertinents' },
    { icon: '⭐', label: 'Répondre à un avis',      prompt: 'Aide-moi à rédiger une réponse professionnelle et chaleureuse à un avis client Google — propose 3 versions selon si l\'avis est positif, neutre ou négatif' },
    { icon: '🪑', label: 'Tables disponibles',      prompt: 'Quelles tables sont disponibles ce soir ? Y a-t-il des créneaux libres pour des réservations de dernière minute ?' },
  ],
  car_rental: [
    { icon: '🚗', label: 'Voitures disponibles',   prompt: 'Quelles voitures sont disponibles maintenant et ce week-end ?' },
    { icon: '➕', label: 'Créer une location',      prompt: 'Je veux créer une nouvelle réservation pour un client' },
    { icon: '💰', label: 'CA cette semaine',        prompt: 'Quel est le chiffre d\'affaires de cette semaine ?' },
    { icon: '📱', label: 'Message confirmation',    prompt: 'Rédige un message WhatsApp de confirmation de location pour un client' },
    { icon: '📊', label: 'Stats du mois',           prompt: 'Donne-moi un résumé des performances du mois en cours' },
    { icon: '🔧', label: 'Maintenance',             prompt: 'Aide-moi à planifier la maintenance de mon parc véhicules' },
  ],
  hotel: [
    { icon: '🏨', label: 'Arrivées & départs',      prompt: 'Liste tous les check-ins et check-outs d\'aujourd\'hui avec les noms des clients, numéros de chambre et horaires prévus — priorise ce qui est urgent' },
    { icon: '📊', label: 'Chambres & occupation',   prompt: 'Combien de chambres sont libres ce soir et cette semaine ? Quel est notre taux d\'occupation et RevPAR ce mois ?' },
    { icon: '✉️', label: 'Email bienvenue',         prompt: 'Rédige un email de bienvenue élégant et personnalisé pour un client qui arrive aujourd\'hui — chaleureux, professionnel, multilingue si besoin' },
    { icon: '⭐', label: 'Répondre Booking.com',    prompt: 'Aide-moi à rédiger une réponse parfaite à un avis sur Booking.com ou TripAdvisor — propose une version pour avis 5★ et une pour avis négatif' },
    { icon: '💰', label: 'Revenus & performance',   prompt: 'Quel est le revenu de cet hôtel ce mois-ci ? Quelles chambres rapportent le plus ? Quel taux d\'occupation avons-nous ?' },
    { icon: '🔔', label: 'Demande spéciale client', prompt: 'Un client a une demande spéciale (lit bébé, early check-in, allergie, vue mer) — aide-moi à organiser et confirmer cette demande' },
  ],
  lawyer: [
    { icon: '⚖️', label: 'Mes urgences du jour',    prompt: 'Quels sont mes rendez-vous d\'aujourd\'hui ? Y a-t-il des audiences, des délais de procédure ou des échéances juridiques urgentes à ne pas rater cette semaine ?' },
    { icon: '📄', label: 'Mise en demeure',          prompt: 'Rédige une lettre de mise en demeure professionnelle et formelle — demande-moi les informations nécessaires (destinataire, objet, faits, demande)' },
    { icon: '📋', label: 'Note de synthèse',         prompt: 'Aide-moi à rédiger une note de synthèse juridique sur un dossier — structure en faits, problème juridique, analyse, conclusion' },
    { icon: '🔍', label: 'Analyser un document',     prompt: 'Je vais te décrire un document juridique — analyse-le, résume les points clés, identifie les risques et les clauses importantes' },
    { icon: '💼', label: 'Honoraires & facturation', prompt: 'Aide-moi à rédiger une note d\'honoraires professionnelle pour un client — demande-moi les informations nécessaires' },
    { icon: '📅', label: 'Agenda de la semaine',     prompt: 'Donne-moi un résumé de l\'agenda de la semaine avec les priorités et les délais critiques à respecter' },
  ],
  doctor: [
    { icon: '📅', label: 'Patients du jour',         prompt: 'Liste toutes les consultations prévues aujourd\'hui avec les horaires et motifs — organise par priorité et identifie les patients urgents' },
    { icon: '📄', label: 'Rapport de consultation',  prompt: 'Aide-moi à rédiger un compte-rendu de consultation médical structuré — motif, anamnèse, examen, conclusion, suivi — je vais te donner les détails' },
    { icon: '📱', label: 'Rappel patient SMS',        prompt: 'Rédige un SMS de rappel de rendez-vous pour un patient pour demain — courtois, clair, avec l\'horaire et l\'adresse du cabinet' },
    { icon: '💊', label: 'Ordonnance type',           prompt: 'Génère un template d\'ordonnance type à compléter pour un traitement courant — rappelle que c\'est un modèle à valider par le médecin' },
    { icon: '📊', label: 'Stats du mois',             prompt: 'Combien de consultations avons-nous effectuées ce mois ? Quels sont les motifs de consultation les plus fréquents ? Bilan d\'activité complet' },
    { icon: '✉️', label: 'Répondre à un patient',    prompt: 'Aide-moi à répondre de manière bienveillante, claire et professionnelle à la question ou demande d\'un patient — je vais te donner le contexte' },
  ],
  real_estate: [
    { icon: '📅', label: 'Visites du jour',           prompt: 'Quelles visites de biens sont prévues aujourd\'hui ? Donne-moi les détails (client, bien, heure, localisation) et les biens les plus susceptibles d\'intéresser' },
    { icon: '✍️', label: 'Rédiger une annonce',       prompt: 'Rédige une annonce immobilière percutante pour un bien — demande-moi la surface, le quartier, le type, le prix et les atouts clés' },
    { icon: '🏠', label: 'Biens disponibles',          prompt: 'Quels biens sont actuellement disponibles dans mon portefeuille ? Résume les caractéristiques clés et les prix de chacun' },
    { icon: '💰', label: 'Estimation & rentabilité',   prompt: 'Aide-moi à estimer le prix d\'un bien au m² et à calculer sa rentabilité locative brute et nette selon le quartier et le type de bien' },
    { icon: '📱', label: 'Message prospect',           prompt: 'Rédige un message de relance commercial personnalisé pour un acheteur potentiel — chaleureux, professionnel, avec une proposition de bien adapté à son budget' },
    { icon: '📊', label: 'Bilan des ventes',           prompt: 'Quel est le bilan des transactions ce mois ? Biens vendus, visites effectuées, leads en cours, revenus de commission générés' },
  ],
  retail: [
    { icon: '📊', label: 'Ventes & stock du jour',    prompt: 'Quelles sont les ventes d\'aujourd\'hui ? Quels produits se vendent bien ? Y a-t-il des alertes de stock bas à traiter maintenant ?' },
    { icon: '🏷️', label: 'Créer une promotion',       prompt: 'Crée une offre promotionnelle attractive pour booster les ventes — propose 3 idées de promos différentes avec % de remise, durée et produits ciblés' },
    { icon: '📸', label: 'Post réseaux sociaux',       prompt: 'Rédige 3 versions de posts pour Instagram/Facebook/TikTok pour promouvoir mes produits aujourd\'hui — accroche, description, hashtags locaux et tendance' },
    { icon: '💰', label: 'CA & marges du mois',        prompt: 'Quel est le chiffre d\'affaires ce mois-ci ? Quels sont les produits les plus rentables et ceux qui ne tournent pas ?' },
    { icon: '📦', label: 'Inventaire & réassort',      prompt: 'Quels produits sont en stock bas ou en rupture ? Aide-moi à prioriser les réassorts et rédige une liste de commande fournisseur' },
    { icon: '⭐', label: 'Fidéliser mes clients',       prompt: 'Propose-moi une stratégie de fidélisation complète pour ma boutique — programme points, offres anniversaire, relances clients inactifs' },
  ],
  beauty: [
    { icon: '💇', label: 'Planning du jour',           prompt: 'Montre-moi le planning complet d\'aujourd\'hui par coiffeur/technicien — clients, services, horaires et créneaux libres pour de nouveaux RDV' },
    { icon: '➕', label: 'Nouveau rendez-vous',        prompt: 'Je veux créer un nouveau rendez-vous client — demande-moi le nom du client, le service souhaité, le coiffeur préféré et le créneau' },
    { icon: '📱', label: 'Rappel clients demain',       prompt: 'Rédige des messages de rappel de rendez-vous pour les clients de demain — format WhatsApp prêt à copier-coller, chaleureux et professionnel' },
    { icon: '💰', label: 'CA par coiffeur',            prompt: 'Quel est le chiffre d\'affaires de ce mois par coiffeur et par service ? Qui performe le mieux et quels services sont les plus demandés ?' },
    { icon: '📸', label: 'Post Instagram',             prompt: 'Rédige une légende Instagram percutante pour une photo avant/après — tendance, inspirante, avec hashtags beauté et locaux pertinents' },
    { icon: '🎁', label: 'Offre fidélité',             prompt: 'Crée une campagne de fidélisation pour mes clients réguliers — offre retour 6 semaines, cadeau anniversaire, programme points — prête à envoyer' },
  ],
  auto_school: [
    { icon: '🚦', label: 'Leçons du jour',             prompt: 'Liste toutes les leçons de conduite d\'aujourd\'hui — élève, moniteur, véhicule (manuelle/automatique), heure — avec les créneaux libres pour de nouvelles leçons' },
    { icon: '📈', label: 'Progression d\'un élève',    prompt: 'Je veux voir la progression détaillée d\'un élève — heures effectuées, heures restantes, points forts, difficultés, est-il prêt pour l\'examen ?' },
    { icon: '🎯', label: 'Prêts pour l\'examen',       prompt: 'Quels élèves sont prêts à passer l\'examen de conduite ce mois-ci selon leur progression et heures effectuées ? Classe-les par niveau de préparation' },
    { icon: '💰', label: 'Paiements en retard',        prompt: 'Y a-t-il des élèves avec des paiements ou acomptes en retard ? Liste-les avec les montants dus et aide-moi à rédiger un message de relance poli' },
    { icon: '📱', label: 'Rappel leçon demain',        prompt: 'Rédige un SMS de rappel pour les élèves qui ont une leçon de conduite demain — format court, clair, avec l\'heure et le lieu de rendez-vous' },
    { icon: '📅', label: 'Planning moniteurs',         prompt: 'Donne-moi le planning complet des moniteurs pour cette semaine — qui est disponible, quels véhicules sont libres, comment optimiser les créneaux' },
  ],
  construction: [
    { icon: '🏗️', label: 'État des chantiers',         prompt: 'Donne-moi l\'état en temps réel de tous mes chantiers actifs — avancement %, équipes assignées, délai prévu vs réel, alertes retards ou dépassements' },
    { icon: '📋', label: 'Rédiger un devis',            prompt: 'Aide-moi à rédiger un devis professionnel détaillé pour un nouveau chantier — demande-moi le type de travaux, la surface, les matériaux et ma marge cible' },
    { icon: '🧾', label: 'Créer une facture',           prompt: 'Rédige une facture de situation d\'avancement ou de solde pour un chantier terminé — structure professionnelle avec lignes détaillées main-d\'œuvre + matériaux + TVA' },
    { icon: '📦', label: 'Commande matériaux',          prompt: 'Je dois commander des matériaux pour un chantier — aide-moi à rédiger un bon de commande avec désignations, quantités, références et fournisseur' },
    { icon: '⚠️', label: 'Alertes & retards',          prompt: 'Y a-t-il des chantiers en retard sur le planning ou en dépassement de budget ? Analyse la situation et propose des mesures correctives' },
    { icon: '📊', label: 'Rentabilité par chantier',   prompt: 'Analyse la rentabilité de chaque chantier — coûts réels vs budget prévu, marge réalisée, et donne-moi un bilan financier mensuel de l\'entreprise' },
  ],
  ecommerce: [
    { icon: '📦', label: 'Commandes à traiter',        prompt: 'Quelles commandes sont en attente de traitement aujourd\'hui ? Liste-les avec les produits, quantités et adresses de livraison — priorise les urgentes' },
    { icon: '🚚', label: 'Livraisons en cours',        prompt: 'Quel est le statut de toutes les livraisons en cours ? Y a-t-il des retards ou des litiges transporteur à gérer maintenant ?' },
    { icon: '⚠️', label: 'Alertes stock bas',          prompt: 'Quels produits sont en stock bas ou en rupture imminente ? Aide-moi à prioriser les réassorts et rédige une liste de commande fournisseur urgente' },
    { icon: '✍️', label: 'Fiche produit SEO',          prompt: 'Rédige une fiche produit optimisée SEO pour un article — accroche percutante, bénéfices clients, caractéristiques techniques, appel à l\'action — je te donne les détails' },
    { icon: '⭐', label: 'Répondre à un avis',         prompt: 'Aide-moi à répondre à un avis client — propose une réponse chaleureuse pour un avis positif et une réponse solution-oriented pour un avis négatif' },
    { icon: '🎯', label: 'Créer une promo flash',      prompt: 'Crée une offre promotionnelle flash pour booster les ventes immédiatement — code promo, % remise, durée limitée, produits ciblés et message marketing' },
  ],
  custom: [
    { icon: '📋', label: 'Bilan du jour',              prompt: 'Fais-moi un bilan complet de l\'activité d\'aujourd\'hui — réservations, revenus, clients, points importants à ne pas oublier' },
    { icon: '📄', label: 'Rédiger un document',        prompt: 'Aide-moi à rédiger un document professionnel — email, courrier, rapport, offre commerciale — je te donne le contexte' },
    { icon: '📱', label: 'Message client',             prompt: 'Aide-moi à rédiger un message professionnel et efficace pour un client — je te donne la situation et le ton souhaité' },
    { icon: '💡', label: 'Idée business',              prompt: 'Donne-moi 5 idées concrètes et actionnables pour développer mon activité et augmenter mon chiffre d\'affaires ce mois-ci' },
    { icon: '📊', label: 'Analyser mes données',       prompt: 'Analyse mes données business et donne-moi les insights les plus importants — tendances, opportunités, alertes' },
    { icon: '⭐', label: 'Améliorer mon service',       prompt: 'Comment puis-je améliorer la qualité de mon service et la satisfaction client ? Donne-moi 5 actions concrètes à appliquer cette semaine' },
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
export default function SaasPortal({ onBack }: { onBack?: () => void }) {
  const resetToken = new URLSearchParams(window.location.search).get('reset');
  const existing   = loadSession();
  const initialMode: Mode = (() => {
    if (resetToken) return 'reset';
    if (!existing) return 'landing';
    if (existing.sector === 'god_mode') return 'chat'; // admin: skip onboarding
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
  const handleUpdateSession = (s: OrgSession) => { saveSession(s); setSession(s); };

  if (mode === 'landing')    return <Landing onSignup={() => setMode('signup')} onLogin={() => setMode('login')} onBack={onBack} />;
  if (mode === 'signup')     return <SignupForm onAuth={handleAuth} onBack={() => setMode('landing')} />;
  if (mode === 'login')      return <LoginForm  onAuth={handleAuth} onBack={() => setMode('landing')} onForgot={() => setMode('forgot')} />;
  if (mode === 'forgot')     return <ForgotPasswordScreen onBack={() => setMode('login')} />;
  if (mode === 'reset')      return <ResetPasswordScreen token={resetToken ?? ''} onDone={() => setMode('login')} />;
  if (mode === 'onboarding' && session) return <OnboardingScreen session={session} onDone={handleOnboardingDone} />;
  if (mode === 'chat'        && session) {
    if (session.sector === 'god_mode') return <GodModePortal session={session} onLogout={handleLogout} />;
    return <SaasChat session={session} onLogout={handleLogout} onUpdateSession={handleUpdateSession} onBack={onBack} />;
  }
  return null;
}

// ── Landing ───────────────────────────────────────────────────────
function Landing({ onSignup, onLogin, onBack }: { onSignup: () => void; onLogin: () => void; onBack?: () => void }) {
  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      {onBack && (
        <button onClick={onBack} style={{
          position: 'absolute', top: 16, left: 16, zIndex: 10,
          background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
          borderRadius: 20, padding: '6px 14px',
          fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(0,212,255,0.8)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>← Dzaryx</button>
      )}
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
  const [step, setStep]             = useState<'sector' | 'info' | 'done'>('sector');
  const [sector, setSector]         = useState('');
  const [businessName, setBusiness] = useState('');
  const [city, setCity]             = useState('');
  const [country, setCountry]       = useState('Algeria');
  const [language, setLanguage]     = useState('fr');
  const [aiName, setAiName]         = useState('Dzaryx');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [password2, setPassword2]   = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showPwd2, setShowPwd2]     = useState(false);
  const [terms, setTerms]           = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [registeredEmail, setRegEmail] = useState('');

  // Email validation
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwdMatch   = password === password2 && password2.length > 0;
  const pwdStrong  = password.length >= 8;

  const submit = async () => {
    if (!businessName || !email || !password || !sector) { setError('Tous les champs sont requis'); return; }
    if (!emailValid) { setError('Adresse email invalide'); return; }
    if (!pwdStrong) { setError('Mot de passe minimum 8 caractères'); return; }
    if (!pwdMatch) { setError('Les mots de passe ne correspondent pas'); return; }
    if (!terms) { setError('Vous devez accepter les conditions d\'utilisation'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, business_name: businessName, city, country, sector, language, ai_name: aiName }),
      });
      const data = await r.json() as Record<string, unknown>;
      if (!r.ok) { setError((data['error'] as string) ?? 'Erreur inscription'); return; }
      setRegEmail(email);
      setStep('done');
      // Auto-login after 3s
      setTimeout(() => {
        onAuth({ token: data['token'] as string, email, ai_name: (data['ai_name'] as string) ?? aiName, business_name: data['business_name'] as string, sector: (data['sector'] as string) ?? sector, org_id: data['org_id'] as string });
      }, 3000);
    } catch { setError('Erreur réseau — réessayez'); }
    finally { setLoading(false); }
  };

  if (step === 'done') {
    return (
      <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', gap: 20 }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 900, color: '#00d4ff', textAlign: 'center', letterSpacing: '0.15em' }}>
          COMPTE CRÉÉ !
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6 }}>
          Un email de confirmation a été envoyé à<br />
          <span style={{ color: '#00d4ff', fontWeight: 600 }}>{registeredEmail}</span>
        </div>
        <div style={{ padding: '16px', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 14, width: '100%' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            📧 Vérifiez votre boîte mail (spam inclus)<br />
            📱 Téléchargez l'app Dzaryx depuis le lien dans l'email<br />
            🤖 Votre assistant <strong style={{ color: '#00d4ff' }}>{aiName}</strong> est prêt à vous aider
          </div>
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          Connexion automatique dans quelques secondes…
        </div>
      </div>
    );
  }

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
              { label: 'Nom du business *', value: businessName, set: setBusiness, placeholder: 'Ex: La Fourchette, Cabinet Benali' },
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

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Adresse email *</div>
              <div style={{ position: 'relative' }}>
                <input
                  value={email} onChange={e => setEmail(e.target.value)}
                  type="email" placeholder="vous@example.com"
                  style={{ ...S.input, paddingRight: 36, borderColor: email && !emailValid ? 'rgba(255,51,102,0.4)' : undefined }}
                />
                {email && (
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>
                    {emailValid ? '✅' : '❌'}
                  </span>
                )}
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Mot de passe * (min. 8 caractères)</div>
              <div style={{ position: 'relative' }}>
                <input
                  value={password} onChange={e => setPassword(e.target.value)}
                  type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  style={{ ...S.input, paddingRight: 48, borderColor: password && !pwdStrong ? 'rgba(255,51,102,0.4)' : undefined }}
                />
                <button
                  onClick={() => setShowPwd(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0 }}
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
              {password && !pwdStrong && (
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: '#ff3366', marginTop: 4 }}>Minimum 8 caractères</div>
              )}
            </div>

            {/* Confirm password */}
            <div style={{ marginBottom: 14 }}>
              <div style={S.inputLabel}>Confirmer le mot de passe *</div>
              <div style={{ position: 'relative' }}>
                <input
                  value={password2} onChange={e => setPassword2(e.target.value)}
                  type={showPwd2 ? 'text' : 'password'} placeholder="••••••••"
                  style={{ ...S.input, paddingRight: 48, borderColor: password2 && !pwdMatch ? 'rgba(255,51,102,0.4)' : password2 && pwdMatch ? 'rgba(0,230,118,0.4)' : undefined }}
                />
                <button
                  onClick={() => setShowPwd2(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0 }}
                >
                  {showPwd2 ? '🙈' : '👁️'}
                </button>
              </div>
              {password2 && (
                <div style={{ fontFamily: 'Inter', fontSize: 10, marginTop: 4, color: pwdMatch ? '#00e676' : '#ff3366' }}>
                  {pwdMatch ? '✓ Mots de passe identiques' : '✗ Mots de passe différents'}
                </div>
              )}
            </div>

            {/* Terms */}
            <div
              onClick={() => setTerms(t => !t)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${terms ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, marginBottom: 16, cursor: 'pointer' }}
            >
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${terms ? '#00d4ff' : 'rgba(255,255,255,0.2)'}`, background: terms ? 'rgba(0,212,255,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {terms && <span style={{ color: '#00d4ff', fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                J'accepte les <span style={{ color: '#00d4ff' }}>conditions d'utilisation</span> et la <span style={{ color: '#00d4ff' }}>politique de confidentialité</span> de Dzaryx. Je confirme que les informations fournies sont exactes.
              </div>
            </div>

            {error && <div style={S.errorText}>{error}</div>}

            <button onClick={() => void submit()} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
              {loading ? 'Création en cours…' : `Créer mon ${aiName} →`}
            </button>
            <button onClick={() => setStep('sector')} style={{ ...S.btnSecondary, marginTop: 8 }}>← Changer de secteur</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────
function LoginForm({ onAuth, onBack, onForgot }: { onAuth: (s: OrgSession) => void; onBack: () => void; onForgot: () => void }) {
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [showPwd, setShowPwd] = useState(false);

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
      onAuth({ token: data.token, email, ai_name: data.ai_name ?? 'Dzaryx', business_name: data.business_name, sector: data.sector ?? '', org_id: data.org_id });
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
          <div style={{ position: 'relative' }}>
            <input value={password} onChange={e => setPass(e.target.value)}
              type={showPwd ? 'text' : 'password'} placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && void submit()}
              style={{ ...S.input, paddingRight: 48 }} />
            <button onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>
              {showPwd ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={() => void submit()} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
        <button onClick={onForgot} style={{ ...S.btnSecondary, marginTop: 10 }}>
          Mot de passe oublié ?
        </button>
      </div>
    </div>
  );
}

// ── SaaS Chat ─────────────────────────────────────────────────────
interface ChatMessage { role: 'user' | 'ai'; text: string; ts: number; }

function SaasChat({ session, onLogout, onUpdateSession, onBack }: { session: OrgSession; onLogout: () => void; onUpdateSession: (s: OrgSession) => void; onBack?: () => void }) {
  const [tab, setTab]           = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getSessionId(session.org_id);
  const aiName    = session.ai_name ?? 'Dzaryx';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || thinking) return;
    setInput('');
    setTab('chat');
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
    setThinking(true);
    try {
      const chatEndpoint = session.sector === 'god_mode'
        ? `${BACKEND}/api/saas/admin/chat`
        : `${BACKEND}/api/saas/chat`;
      const res = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ message: text, sessionId, textOnly: true }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setThinking(false);
      if (data.text) {
        setMessages(prev => [...prev, { role: 'ai', text: data.text!, ts: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: data.error ?? 'Erreur. Réessayez.', ts: Date.now() }]);
      }
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
            background: 'rgba(0,212,255,0.06)',
            border: '1px solid rgba(0,212,255,0.18)',
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4ff' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(0,212,255,0.85)' }}>EN LIGNE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onBack && (
              <button onClick={onBack} style={{
                background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 16, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: 'rgba(0,212,255,0.7)',
              }}>← Dzaryx</button>
            )}
            <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter', fontSize: 16, color: 'rgba(255,255,255,0.3)', padding: '4px 8px' }}>
              ⏻
            </button>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat'    && <ChatTab messages={messages} thinking={thinking} input={input} setInput={setInput} onSend={() => send()} aiName={aiName} bottomRef={bottomRef} />}
        {tab === 'actions' && <ActionsTab sector={session.sector} aiName={aiName} onAction={send} />}
        {tab === 'agenda'  && <AgendaTab session={session} />}
        {tab === 'data'    && <DataTab session={session} />}
        {tab === 'revenue' && <RevenueTab session={session} />}
        {tab === 'clients' && <ClientsTab session={session} />}
        {tab === 'account' && <AccountTab session={session} onLogout={onLogout} onUpdateSession={onUpdateSession} />}
        {tab === 'admin'   && <AdminTab session={session} />}
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
          ...(session.email === 'kouiderpablo@gmail.com' ? [{ id: 'admin' as Tab, icon: '👑', label: 'Admin' }] : []),
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
function ChatTab({ messages, thinking, input, setInput, onSend, aiName, bottomRef }: {
  messages: ChatMessage[]; thinking: boolean;
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
        {thinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
              <span style={{ color: 'rgba(0,212,255,0.5)' }}>···</span>
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
interface Integrations { whatsapp_number?: string; google_calendar_url?: string; business_hours_open?: string; business_hours_close?: string; instagram?: string; tiktok?: string; facebook?: string; website?: string; }
interface BusinessProfile { owner_name?: string; address?: string; website?: string; description?: string; [key: string]: string | undefined; }
interface OrgConfig { ai_name: string; business_name: string; sector: string; language: string; city: string; country: string; plan: string; messages_used: number; messages_limit: number; integrations?: Integrations; business_profile?: BusinessProfile; }

function AccountTab({ session, onLogout, onUpdateSession }: { session: OrgSession; onLogout: () => void; onUpdateSession: (s: OrgSession) => void }) {
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

  // Social media
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok]       = useState('');
  const [facebook, setFacebook]   = useState('');
  const [website, setWebsite]     = useState('');
  // Sector knowledge
  const [knowledge, setKnowledge] = useState<Record<string, string>>({});

  // Security states
  const [secAction, setSecAction] = useState<null | 'email' | 'password'>(null);
  const [secStep,   setSecStep]   = useState<'form' | 'verify'>('form');
  const [newVal,    setNewVal]    = useState('');
  const [secCode,   setSecCode]   = useState('');
  const [secLoading,setSecLoad]   = useState(false);
  const [secErr,    setSecErr]    = useState('');
  const [secOk,     setSecOk]     = useState('');
  // Delete states
  const [delStep,   setDelStep]   = useState<'idle' | 'code'>('idle');
  const [delCode,   setDelCode]   = useState('');
  const [delLoading,setDelLoad]   = useState(false);
  const [delErr,    setDelErr]    = useState('');

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
        setInstagram(i.instagram ?? '');
        setTiktok(i.tiktok ?? '');
        setFacebook(i.facebook ?? '');
        setWebsite(i.website ?? '');
        const fields = SECTOR_KNOWLEDGE_FIELDS[cfg.sector] ?? SECTOR_KNOWLEDGE_FIELDS['custom']!;
        const k: Record<string, string> = {};
        fields.forEach(f => { k[f.key] = (p as Record<string, string | undefined>)[f.key] ?? ''; });
        setKnowledge(k);
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
          integrations: { whatsapp_number: waNumber, google_calendar_url: gcalUrl, business_hours_open: hoursOpen, business_hours_close: hoursClose, instagram, tiktok, facebook, website },
          business_profile: { owner_name: ownerName, address, description, ...knowledge },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const requestChange = async (type: 'email' | 'password') => {
    setSecLoad(true); setSecErr('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/account/request-change`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value: newVal }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setSecErr(d.error ?? 'Erreur'); return; }
      setSecStep('verify');
    } catch { setSecErr('Erreur réseau'); }
    finally { setSecLoad(false); }
  };

  const confirmChange = async (type: 'email' | 'password') => {
    setSecLoad(true); setSecErr('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/account/confirm-change`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, code: secCode }),
      });
      const d = await r.json() as { ok?: boolean; error?: string; new_token?: string };
      if (!r.ok) { setSecErr(d.error ?? 'Code incorrect'); return; }
      setSecOk(type === 'email' ? '✅ Email modifié avec succès !' : '✅ Mot de passe modifié avec succès !');
      if (type === 'email' && d.new_token) onUpdateSession({ ...session, token: d.new_token, email: newVal });
      setSecAction(null); setSecStep('form'); setNewVal(''); setSecCode('');
      setTimeout(() => setSecOk(''), 4000);
    } catch { setSecErr('Erreur réseau'); }
    finally { setSecLoad(false); }
  };

  const requestDelete = async () => {
    setDelLoad(true); setDelErr('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/account/request-delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setDelErr(d.error ?? 'Erreur'); return; }
      setDelStep('code');
    } catch { setDelErr('Erreur réseau'); }
    finally { setDelLoad(false); }
  };

  const confirmDelete = async () => {
    setDelLoad(true); setDelErr('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: delCode }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setDelErr(d.error ?? 'Code incorrect'); return; }
      onLogout();
    } catch { setDelErr('Erreur réseau'); }
    finally { setDelLoad(false); }
  };

  const doCancelPlan = async () => {
    try {
      await fetch(`${BACKEND}/api/saas/account/cancel-plan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      setConfig(prev => prev ? { ...prev, plan: 'starter', messages_limit: 200 } : prev);
    } catch {}
  };

  const used   = config?.messages_used  ?? 0;
  const limit  = config?.messages_limit ?? 100;
  const pct    = Math.min(100, Math.round((used / limit) * 100));
  const planName = config?.plan === 'pro' ? 'Pro' : config?.plan === 'enterprise' ? 'Enterprise' : config?.plan === 'ultimate' ? 'Ultimate' : 'Gratuit';

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
            <div style={{ padding: '14px', background: planName === 'Ultimate' ? 'rgba(255,215,0,0.05)' : 'rgba(0,212,255,0.06)', border: `1px solid ${planName === 'Ultimate' ? 'rgba(255,215,0,0.25)' : 'rgba(0,212,255,0.2)'}`, borderRadius: 14, marginBottom: 16 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: planName === 'Ultimate' ? '#ffd700' : '#00d4ff', marginBottom: 4 }}>
                {planName === 'Enterprise' ? '👑' : planName === 'Ultimate' ? '🏠' : '✨'} Plan {planName} actif
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
                { key: 'ultimate', label: '🏠 Ultimate IoT', price: '19 900 DA/mois', color: '#ffd700', bg: 'rgba(255,215,0,0.04)', border: 'rgba(255,215,0,0.2)', features: ['Tout Enterprise inclus', 'Maison connectée (Zigbee)', 'Voiture connectée (OBD-II)', 'Contrôle domotique vocal', 'Dashboard IoT temps réel', 'Matériel inclus à l\'install'] },
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

          {/* Sector knowledge base */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 4 }}>🧠 Profil business complet</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
              Ces infos sont injectées dans chaque conversation — Dzaryx connaît votre business par cœur
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(SECTOR_KNOWLEDGE_FIELDS[config?.sector ?? session.sector] ?? SECTOR_KNOWLEDGE_FIELDS['custom']!).map(f => (
                <div key={f.key}>
                  <div style={S.inputLabel}>{f.label}</div>
                  {f.textarea ? (
                    <textarea
                      value={knowledge[f.key] ?? ''}
                      onChange={e => setKnowledge(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={3}
                      style={{ ...S.input, resize: 'vertical' as const, height: 'auto', minHeight: 64 }}
                    />
                  ) : (
                    <input
                      value={knowledge[f.key] ?? ''}
                      onChange={e => setKnowledge(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={S.input}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Social media */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 4 }}>📱 Réseaux sociaux</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
              Dzaryx génère des posts et rédige du contenu adapté à chaque réseau
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Instagram', value: instagram, set: setInstagram, placeholder: '@votre_compte', color: '#e1306c' },
                { label: 'TikTok',    value: tiktok,    set: setTiktok,    placeholder: '@votre_tiktok',  color: '#69c9d0' },
                { label: 'Facebook',  value: facebook,  set: setFacebook,  placeholder: 'URL page Facebook', color: '#1877f2' },
                { label: 'Site web',  value: website,   set: setWebsite,   placeholder: 'https://votre-site.com', color: '#00d4ff' },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ ...S.inputLabel, color: f.color }}>{f.label}</div>
                  <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ ...S.input, borderColor: f.value ? f.color + '50' : undefined }} />
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

          {/* Security */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.sectionLabel, marginBottom: 12 }}>🔐 Sécurité du compte</div>
            {secOk && (
              <div style={{ padding: '10px 14px', background: 'rgba(0,230,118,0.07)', border: '1px solid rgba(0,230,118,0.2)', borderRadius: 10, marginBottom: 10, fontFamily: 'Inter', fontSize: 12, color: '#00e676' }}>
                {secOk}
              </div>
            )}
            {!secAction && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => { setSecAction('email'); setSecStep('form'); setNewVal(''); setSecCode(''); setSecErr(''); }}
                  style={{ padding: '12px 14px', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter', fontSize: 12, color: 'rgba(0,212,255,0.85)' }}
                >
                  📧 Changer d'adresse email
                </button>
                <button
                  onClick={() => { setSecAction('password'); setSecStep('form'); setNewVal(''); setSecCode(''); setSecErr(''); }}
                  style={{ padding: '12px 14px', background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter', fontSize: 12, color: 'rgba(0,212,255,0.85)' }}
                >
                  🔑 Changer de mot de passe
                </button>
              </div>
            )}
            {secAction && secStep === 'form' && (
              <div style={{ padding: '14px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 14 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: '#00d4ff', marginBottom: 10 }}>
                  {secAction === 'email' ? '📧 Nouveau email' : '🔑 Nouveau mot de passe'}
                </div>
                <input
                  value={newVal} onChange={e => setNewVal(e.target.value)}
                  type={secAction === 'email' ? 'email' : 'password'}
                  placeholder={secAction === 'email' ? 'nouveau@email.com' : 'Min. 8 caractères'}
                  style={{ ...S.input, marginBottom: 10 }}
                />
                {secErr && <div style={S.errorText}>{secErr}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSecAction(null); setSecErr(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Annuler</button>
                  <button onClick={() => void requestChange(secAction)} disabled={secLoading || !newVal} style={{ flex: 2, padding: '10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 10, cursor: secLoading || !newVal ? 'default' : 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>
                    {secLoading ? 'Envoi…' : 'Envoyer le code →'}
                  </button>
                </div>
              </div>
            )}
            {secAction && secStep === 'verify' && (
              <div style={{ padding: '14px', background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 14 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: '#00d4ff', marginBottom: 6 }}>✉️ Code envoyé sur votre email actuel</div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Valable 15 minutes.</div>
                <input
                  value={secCode} onChange={e => setSecCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" maxLength={6}
                  style={{ ...S.input, fontFamily: 'Orbitron', fontSize: 24, letterSpacing: '0.5em', textAlign: 'center', marginBottom: 10 }}
                />
                {secErr && <div style={S.errorText}>{secErr}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setSecStep('form'); setSecCode(''); setSecErr(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>← Retour</button>
                  <button onClick={() => void confirmChange(secAction)} disabled={secLoading || secCode.length !== 6} style={{ flex: 2, padding: '10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 10, cursor: secLoading || secCode.length !== 6 ? 'default' : 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>
                    {secLoading ? 'Vérification…' : 'Confirmer la modification'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cancel plan */}
          {config?.plan && config.plan !== 'starter' && (
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => { if (window.confirm('Annuler l\'abonnement et retourner au plan Gratuit ?')) void doCancelPlan(); }}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,149,0,0.05)', border: '1px solid rgba(255,149,0,0.2)', borderRadius: 12, cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,149,0,0.8)' }}
              >
                ⚠️ Annuler l'abonnement → retour plan Gratuit
              </button>
            </div>
          )}

          {/* Delete account */}
          <div style={{ marginBottom: 16, padding: '14px', background: 'rgba(255,51,102,0.04)', border: '1px solid rgba(255,51,102,0.12)', borderRadius: 14 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, color: 'rgba(255,51,102,0.7)', marginBottom: 8 }}>⚠️ Zone dangereuse</div>
            {delStep === 'idle' ? (
              <>
                {delErr && <div style={S.errorText}>{delErr}</div>}
                <button onClick={() => void requestDelete()} disabled={delLoading} style={{ width: '100%', padding: '10px', background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: '#ff3366' }}>
                  {delLoading ? 'Envoi…' : '🗑 Supprimer mon compte définitivement'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                  Code de confirmation envoyé par email. Valable 15 min.
                </div>
                <input
                  value={delCode} onChange={e => setDelCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" maxLength={6}
                  style={{ ...S.input, fontFamily: 'Orbitron', fontSize: 24, letterSpacing: '0.5em', textAlign: 'center', marginBottom: 8 }}
                />
                {delErr && <div style={S.errorText}>{delErr}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setDelStep('idle'); setDelCode(''); setDelErr(''); }} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Annuler</button>
                  <button onClick={() => void confirmDelete()} disabled={delLoading || delCode.length !== 6} style={{ flex: 2, padding: '10px', background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.25)', borderRadius: 10, cursor: delLoading || delCode.length !== 6 ? 'default' : 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#ff3366' }}>
                    {delLoading ? 'Suppression…' : '⚠️ Confirmer la suppression'}
                  </button>
                </div>
              </>
            )}
          </div>

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
          <div style={S.inputLabel}>Montant</div>
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
  beauty: [
    { label: 'Durée (min)',  key: 'duration',   placeholder: '30', type: 'number' },
    { label: 'Catégorie',   key: 'category',   placeholder: 'Coiffure / Soin / Maquillage / Onglerie' },
    { label: 'Coiffeur',    key: 'technician', placeholder: 'Sofia, Rania…' },
  ],
  auto_school: [
    { label: 'Marque',         key: 'brand',        placeholder: 'Renault, Peugeot, Dacia…' },
    { label: 'Immatriculation',key: 'plate',         placeholder: '16-12345-16' },
    { label: 'Type de boîte',  key: 'gearbox',       placeholder: 'Manuelle / Automatique' },
    { label: 'Type de permis', key: 'license_type',  placeholder: 'B / A / C / EC' },
  ],
  construction: [
    { label: 'Localisation',   key: 'location',     placeholder: 'Oran, Bir El Djir…' },
    { label: 'Budget prévu',   key: 'budget',       placeholder: '500000', type: 'number' },
    { label: 'Type de travaux',key: 'work_type',    placeholder: 'Gros œuvre / Finition / Électricité / Plomberie' },
    { label: 'Surface (m²)',   key: 'surface',      placeholder: '120', type: 'number' },
  ],
  ecommerce: [
    { label: 'Référence/SKU',  key: 'ref',          placeholder: 'SKU-001' },
    { label: 'Catégorie',      key: 'category',     placeholder: 'Électronique / Mode / Beauté / Maison' },
    { label: 'Stock',          key: 'stock',        placeholder: '100', type: 'number' },
    { label: 'Fournisseur',    key: 'supplier',     placeholder: 'Nom du fournisseur' },
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
            <div style={S.inputLabel}>Prix / jour</div>
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

// ── Forgot password ───────────────────────────────────────────────
function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (!email) { setError('Email requis'); return; }
    setLoading(true); setError('');
    try {
      await fetch(`${BACKEND}/api/saas/account/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <button onClick={onBack} style={S.backBtn}>← Retour</button>
        <div style={S.formTitle}>Mot de passe oublié</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={S.formScroll}>
        {done ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 12 }}>Email envoyé !</div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              Si cet email existe, un lien de réinitialisation a été envoyé.<br />Vérifiez votre boîte mail (spam inclus).
            </div>
            <button onClick={onBack} style={{ ...S.btnPrimary, marginTop: 24 }}>← Retour connexion</button>
          </div>
        ) : (
          <>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.6 }}>
              Entrez votre adresse email. Si un compte existe, vous recevrez un lien de réinitialisation valable 1 heure.
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={S.inputLabel}>Adresse email</div>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="vous@example.com"
                onKeyDown={e => e.key === 'Enter' && void submit()} style={S.input} />
            </div>
            {error && <div style={S.errorText}>{error}</div>}
            <button onClick={() => void submit()} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
              {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Reset password ────────────────────────────────────────────────
function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [password2, setPass2]   = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    if (!password || password.length < 8) { setError('Minimum 8 caractères'); return; }
    if (password !== password2) { setError('Mots de passe différents'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/account/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) { setError(d.error ?? 'Lien invalide ou expiré'); return; }
      setDone(true);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => onDone(), 3000);
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  };

  if (done) {
    return (
      <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', gap: 16 }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontFamily: 'Orbitron', fontSize: 16, fontWeight: 900, color: '#00d4ff', textAlign: 'center', letterSpacing: '0.15em' }}>MOT DE PASSE RÉINITIALISÉ</div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          Connexion automatique dans quelques secondes…
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.safeTop} />
      <div style={S.formHeader}>
        <div style={{ width: 60 }} />
        <div style={S.formTitle}>Nouveau mot de passe</div>
        <div style={{ width: 60 }} />
      </div>
      <div style={S.formScroll}>
        <div style={{ marginBottom: 16 }}>
          <div style={S.inputLabel}>Nouveau mot de passe (min. 8 caractères)</div>
          <div style={{ position: 'relative' }}>
            <input value={password} onChange={e => setPassword(e.target.value)} type={showPwd ? 'text' : 'password'} placeholder="••••••••" style={{ ...S.input, paddingRight: 48 }} />
            <button onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0 }}>
              {showPwd ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={S.inputLabel}>Confirmer le mot de passe</div>
          <input value={password2} onChange={e => setPass2(e.target.value)} type="password" placeholder="••••••••"
            style={{ ...S.input, borderColor: password2 && password !== password2 ? 'rgba(255,51,102,0.4)' : undefined }} />
          {password2 && password !== password2 && (
            <div style={{ fontFamily: 'Inter', fontSize: 10, color: '#ff3366', marginTop: 4 }}>Mots de passe différents</div>
          )}
        </div>
        {error && <div style={S.errorText}>{error}</div>}
        <button onClick={() => void submit()} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
          {loading ? 'Réinitialisation…' : 'Réinitialiser mon mot de passe'}
        </button>
      </div>
    </div>
  );
}

// ── GOD MODE Portal ───────────────────────────────────────────────
type GodTab = 'chat' | 'voice' | 'stats' | 'clients' | 'actions';

function GodModePortal({ session, onLogout }: { session: OrgSession; onLogout: () => void }) {
  const [tab, setTab]           = useState<GodTab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [thinking, setThinking] = useState(false);
  const [orgs, setOrgs]         = useState<AdminOrg[]>([]);
  const [stats, setStats]       = useState<AdminStats | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [actionMsg, setActionMsg]     = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getSessionId(session.org_id + '_god');
  const headers   = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const PLAN_COLORS: Record<string, string> = { starter: '#ff9500', pro: 'rgba(124,58,237,0.9)', enterprise: '#00d4ff', ultimate: '#ffd700' };
  const GOD_TABS: { id: GodTab; icon: string; label: string }[] = [
    { id: 'chat',    icon: '💬', label: 'Chat CEO' },
    { id: 'voice',   icon: '🎙️', label: 'Vocal' },
    { id: 'stats',   icon: '📊', label: 'Stats' },
    { id: 'clients', icon: '👥', label: 'Clients' },
    { id: 'actions', icon: '⚡', label: 'Actions' },
  ];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, thinking]);

  useEffect(() => {
    if (tab === 'stats' || tab === 'clients') void loadData();
  }, [tab]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [sRes, oRes] = await Promise.all([
        fetch(`${BACKEND}/api/saas/admin/stats`, { headers }),
        fetch(`${BACKEND}/api/saas/admin/orgs`,  { headers }),
      ]);
      if (sRes.ok) setStats(await sRes.json() as AdminStats);
      if (oRes.ok) setOrgs(await oRes.json() as AdminOrg[]);
    } catch {}
    setLoadingData(false);
  };

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || thinking) return;
    setInput('');
    setTab('chat');
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
    setThinking(true);
    try {
      const res = await fetch(`${BACKEND}/api/saas/admin/chat`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json() as { text?: string; error?: string };
      setThinking(false);
      setMessages(prev => [...prev, { role: 'ai', text: data.text ?? data.error ?? 'Erreur. Réessayez.', ts: Date.now() }]);
    } catch {
      setThinking(false);
      setMessages(prev => [...prev, { role: 'ai', text: 'Erreur de connexion.', ts: Date.now() }]);
    }
  };

  const adminAct = async (method: string, path: string, body?: object) => {
    setActionMsg('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/admin${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json() as { message?: string; error?: string };
      setActionMsg(d.message ?? d.error ?? '');
      void loadData();
    } catch { setActionMsg('Erreur réseau'); }
  };

  const G = {
    gold: '#ffd700', goldFaint: 'rgba(255,215,0,0.15)', goldBorder: 'rgba(255,215,0,0.2)',
    bg: 'rgba(0,0,0,0.97)', bgCard: 'rgba(255,255,255,0.03)',
  };

  return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse at 50% 15%, #120820 0%, #050210 55%, #000 100%)' }}>
      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={S.safeTop} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 50, background: G.bg, borderBottom: `1px solid ${G.goldBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>👑</span>
            <div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700, color: G.gold, letterSpacing: '0.2em' }}>DZARYX CEO</div>
              <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,215,0,0.4)', marginTop: 1 }}>GOD MODE · Kouider</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,215,0,0.06)', border: `1px solid ${G.goldBorder}` }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: G.gold, boxShadow: `0 0 6px ${G.gold}` }} />
            <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,215,0,0.85)' }}>LIVE</span>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(255,215,0,0.35)', padding: '4px 8px' }}>⏻</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ─ CHAT ─ */}
        {tab === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 && !thinking && (
                <div style={{ textAlign: 'center', paddingTop: 32 }}>
                  <div style={{ fontSize: 52, marginBottom: 10 }}>👑</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: G.gold, letterSpacing: '0.15em', marginBottom: 6 }}>DZARYX CEO</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: 24 }}>Je connais chaque client, chaque euro, chaque décision.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300, margin: '0 auto' }}>
                    {['Quel est mon MRR ce mois ?', 'Qui sont mes nouveaux clients ?', 'Analyse ma croissance', 'Conseil stratégique du jour'].map(q => (
                      <button key={q} onClick={() => void send(q)} style={{ padding: '10px 14px', background: 'rgba(255,215,0,0.05)', border: `1px solid ${G.goldBorder}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,215,0,0.65)', textAlign: 'left' as const }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.ts} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? G.goldFaint : G.bgCard, border: `1px solid ${m.role === 'user' ? G.goldBorder : 'rgba(255,255,255,0.08)'}`, fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {thinking && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: G.bgCard, border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'Inter', fontSize: 14, color: G.gold }}>···</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={{ flexShrink: 0, padding: '12px 16px', background: G.bg, borderTop: `1px solid ${G.goldBorder}30` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Message à Dzaryx CEO…" rows={1} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,215,0,0.12)`, borderRadius: 14, padding: '10px 14px', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.88)', resize: 'none', outline: 'none', maxHeight: 120, overflowY: 'auto' }} />
                <button onClick={() => void send()} disabled={!input.trim() || thinking} style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: !input.trim() || thinking ? 'default' : 'pointer', background: !input.trim() || thinking ? 'rgba(255,215,0,0.08)' : G.gold, color: !input.trim() || thinking ? 'rgba(255,215,0,0.3)' : '#000', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>↑</button>
              </div>
            </div>
          </>
        )}

        {/* ─ VOICE ─ */}
        {tab === 'voice' && <GodVoiceTab onSend={send} thinking={thinking} />}

        {/* ─ STATS ─ */}
        {tab === 'stats' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: 'rgba(255,215,0,0.45)', letterSpacing: '0.15em', marginBottom: 16 }}>TABLEAU DE BORD — REVENUS</div>
            {loadingData ? (
              <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
            ) : stats ? (
              <>
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(255,215,0,0.09), rgba(255,180,0,0.04))', border: `1px solid ${G.goldBorder}`, borderRadius: 16, marginBottom: 16 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,215,0,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 4 }}>MRR Estimé</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 34, fontWeight: 700, color: G.gold }}>{stats.estimated_revenue_eur.toLocaleString('fr-FR')} €</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Mensuel récurrent · {stats.total_orgs} comptes total</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[
                    { label: 'Gratuit',         count: stats.free_orgs,       price: 0,                              color: '#888' },
                    { label: 'Pro · 29 €/mois', count: stats.pro_orgs,        price: 29  * stats.pro_orgs,           color: 'rgba(124,58,237,0.9)' },
                    { label: 'Ent. · 99 €/mois',count: stats.enterprise_orgs, price: 99  * stats.enterprise_orgs,    color: '#00d4ff' },
                    { label: 'Ult. · 199 €/mois',count: stats.ultimate_orgs,  price: 199 * stats.ultimate_orgs,      color: G.gold },
                  ].map(p => (
                    <div key={p.label} style={{ padding: '14px', background: G.bgCard, border: `1px solid ${p.color}20`, borderRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.label}</span>
                      </div>
                      <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 700, color: p.color }}>{p.count}</div>
                      {p.price > 0 && <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{p.price.toLocaleString('fr-FR')} € / mois</div>}
                    </div>
                  ))}
                </div>
                <div style={{ padding: '14px', background: G.bgCard, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Messages IA total</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 700, color: '#00d4ff', marginTop: 4 }}>{stats.total_messages.toLocaleString('fr-FR')}</div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter', fontSize: 12, paddingTop: 40 }}>Aucune donnée</div>
            )}
          </div>
        )}

        {/* ─ CLIENTS ─ */}
        {tab === 'clients' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: 'rgba(255,215,0,0.45)', letterSpacing: '0.15em', marginBottom: 12 }}>CLIENTS ({orgs.length})</div>
            {actionMsg && <div style={{ padding: '10px 14px', background: 'rgba(255,215,0,0.07)', border: `1px solid ${G.goldBorder}`, borderRadius: 10, marginBottom: 12, fontFamily: 'Inter', fontSize: 12, color: G.gold }}>{actionMsg}</div>}
            {loadingData ? (
              <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
            ) : orgs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontFamily: 'Inter', fontSize: 12, paddingTop: 40 }}>Aucun client pour l'instant.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orgs.map(org => (
                  <div key={org.org_id} style={{ padding: '14px', background: G.bgCard, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{org.name}</div>
                        <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{org.email}</div>
                        <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{org.ai_name} · {org.sector} · {org.city}</div>
                        <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 2 }}>
                          {org.messages_used}/{org.messages_limit} msgs · Connexion: {org.last_login_at ? new Date(org.last_login_at).toLocaleDateString('fr-FR') : 'jamais'} · Créé: {new Date(org.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <div style={{ padding: '3px 8px', borderRadius: 8, background: `${PLAN_COLORS[org.plan] ?? '#888'}18`, border: `1px solid ${PLAN_COLORS[org.plan] ?? '#888'}30`, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: PLAN_COLORS[org.plan] ?? '#888' }}>{org.plan.toUpperCase()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      {org.plan !== 'pro'        && <button onClick={() => void adminAct('PATCH', `/org/${org.org_id}/plan`, { plan: 'pro' })}        style={S.microBtn('rgba(124,58,237,0.9)')}>→ Pro</button>}
                      {org.plan !== 'enterprise' && <button onClick={() => void adminAct('PATCH', `/org/${org.org_id}/plan`, { plan: 'enterprise' })} style={S.microBtn('#00d4ff')}>→ Ent.</button>}
                      {org.plan !== 'ultimate'   && <button onClick={() => void adminAct('PATCH', `/org/${org.org_id}/plan`, { plan: 'ultimate' })}   style={S.microBtn(G.gold)}>→ Ultimate</button>}
                      {org.plan !== 'starter'    && <button onClick={() => void adminAct('PATCH', `/org/${org.org_id}/plan`, { plan: 'starter' })}    style={S.microBtn('#ff9500')}>→ Free</button>}
                      {org.messages_limit > 0
                        ? <button onClick={() => void adminAct('POST', `/org/${org.org_id}/suspend`)}   style={S.microBtn('#ff3366')}>⏸ Suspendre</button>
                        : <button onClick={() => void adminAct('POST', `/org/${org.org_id}/unsuspend`)} style={S.microBtn('#00e676')}>▶ Réactiver</button>}
                      <button onClick={() => { const msg = window.prompt(`Email rapide à ${org.name} :`); if (msg) { setTab('chat'); void send(`Rédige un email professionnel à ${org.name} (${org.email}) — sujet : ${msg}`); } }} style={S.microBtn('#00d4ff')}>✉️ Email</button>
                      <button onClick={() => { if (window.confirm(`Supprimer ${org.name} définitivement ?`)) void adminAct('DELETE', `/org/${org.org_id}`); }} style={S.microBtn('rgba(255,51,102,0.7)')}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─ ACTIONS ─ */}
        {tab === 'actions' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: 'rgba(255,215,0,0.45)', letterSpacing: '0.15em', marginBottom: 16 }}>ACTIONS RAPIDES CEO</div>
            {([
              { icon: '📊', title: 'Rapport mensuel',       desc: 'MRR + clients + croissance + recommandations',     action: 'Génère un rapport mensuel complet : MRR, nouveaux clients, churned, tendances et 3 recommandations CEO actionnables' },
              { icon: '✉️', title: 'Email aux abonnés',      desc: 'Rédige un email à envoyer à tous les clients',     action: 'Rédige un email professionnel et engageant à envoyer à tous mes abonnés Dzaryx. Parle des nouveautés et de la roadmap. Ton: direct, confiant, patron.' },
              { icon: '📱', title: 'Post réseaux sociaux',   desc: 'LinkedIn + Instagram pour Dzaryx SaaS',            action: 'Crée un post LinkedIn et Instagram percutant pour promouvoir Dzaryx — plateforme IA pour PME. Inclus hashtags pertinents.' },
              { icon: '🎯', title: 'Stratégie acquisition',  desc: 'Plan pour acquérir de nouveaux clients',           action: 'Propose une stratégie d\'acquisition clients concrète pour Dzaryx SaaS ce mois : canaux, messages clés, objectifs chiffrés.' },
              { icon: '⚡', title: 'Optimiser conversions',  desc: 'Freemium → Pro : comment améliorer',               action: 'Analyse comment améliorer le taux de conversion freemium → Pro pour Dzaryx. Propose 5 actions concrètes à appliquer cette semaine.' },
              { icon: '🌍', title: 'Plan expansion',         desc: 'Stratégie pour nouveaux marchés',                  action: 'Quel est le meilleur marché à cibler après l\'Algérie pour Dzaryx SaaS ? Analyse et plan d\'action détaillé.' },
              { icon: '💡', title: 'Idée feature produit',   desc: 'Quelle feature ajouter en priorité',               action: 'Quelle fonctionnalité dois-je ajouter en priorité à Dzaryx pour augmenter la rétention et attirer de nouveaux clients ? Justifie avec des données marché.' },
              { icon: '🔍', title: 'Analyse concurrents',    desc: 'Positionnement vs concurrents IA',                 action: 'Analyse les concurrents de Dzaryx sur le marché des assistants IA pour PME. Quel est notre avantage compétitif ? Comment se différencier ?' },
            ] as { icon: string; title: string; desc: string; action: string }[]).map(a => (
              <button key={a.title} onClick={() => { setTab('chat'); void send(a.action); }} style={{ width: '100%', textAlign: 'left' as const, padding: '14px 16px', background: G.bgCard, border: `1px solid rgba(255,215,0,0.1)`, borderRadius: 14, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{a.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>{a.title}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{a.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{ flexShrink: 0, display: 'flex', background: G.bg, borderTop: `1px solid rgba(255,215,0,0.08)`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {GOD_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, height: 60, background: 'none', border: 'none', cursor: 'pointer', borderTop: `2px solid ${tab === t.id ? G.gold : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 20, filter: tab === t.id ? `drop-shadow(0 0 6px rgba(255,215,0,0.7))` : 'none' }}>{t.icon}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? G.gold : 'rgba(255,255,255,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GodVoiceTab({ onSend, thinking }: { onSend: (msg: string) => void; thinking: boolean }) {
  const [listening, setListening]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef  = useRef<any>(null);
  const transcriptRef   = useRef('');

  const start = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Reconnaissance vocale non supportée. Utilisez Chrome ou Safari.'); return; }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
      setTranscript(t);
      transcriptRef.current = t;
    };
    rec.onend = () => {
      setListening(false);
      if (transcriptRef.current.trim()) onSend(transcriptRef.current.trim());
      transcriptRef.current = '';
    };
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
    setTranscript('');
    transcriptRef.current = '';
  };

  const stop = () => recognitionRef.current?.stop();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 24 }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: 'rgba(255,215,0,0.45)', letterSpacing: '0.2em' }}>MODE VOCAL CEO</div>
      <button onClick={listening ? stop : start} disabled={thinking} style={{ width: 100, height: 100, borderRadius: '50%', border: 'none', cursor: thinking ? 'default' : 'pointer', background: listening ? 'radial-gradient(circle, rgba(255,215,0,0.25), rgba(255,180,0,0.1))' : 'rgba(255,215,0,0.07)', outline: listening ? '2px solid rgba(255,215,0,0.4)' : '2px solid rgba(255,215,0,0.1)', boxShadow: listening ? '0 0 30px rgba(255,215,0,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, transition: 'all 0.3s ease' }}>
        🎙️
      </button>
      <div style={{ fontFamily: 'Inter', fontSize: 13, color: listening ? '#ffd700' : 'rgba(255,255,255,0.3)', textAlign: 'center' as const }}>
        {thinking ? 'Dzaryx CEO réfléchit…' : listening ? 'En écoute…' : 'Appuyez pour parler'}
      </div>
      {transcript && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 12, maxWidth: 280, fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' as const }}>
          "{transcript}"
        </div>
      )}
      <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' as const, maxWidth: 240 }}>
        Parlez en français. Votre message sera envoyé à Dzaryx CEO automatiquement.
      </div>
    </div>
  );
}

// ── Admin tab (God Mode) ──────────────────────────────────────────
interface AdminOrg {
  org_id: string; name: string; plan: string; sector: string; ai_name: string;
  city: string; email: string; messages_used: number; messages_limit: number;
  last_login_at: string | null; created_at: string;
}
interface AdminStats {
  total_orgs: number; pro_orgs: number; enterprise_orgs: number; ultimate_orgs: number; free_orgs: number;
  total_messages: number; estimated_revenue_eur: number;
}

function AdminTab({ session }: { session: OrgSession }) {
  const [orgs, setOrgs]       = useState<AdminOrg[]>([]);
  const [stats, setStats]     = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState('');
  const headers = { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, oRes] = await Promise.all([
        fetch(`${BACKEND}/api/saas/admin/stats`, { headers }),
        fetch(`${BACKEND}/api/saas/admin/orgs`,  { headers }),
      ]);
      if (sRes.ok) setStats(await sRes.json() as AdminStats);
      if (oRes.ok) setOrgs(await oRes.json() as AdminOrg[]);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const act = async (method: string, path: string, body?: object) => {
    setMsg('');
    try {
      const r = await fetch(`${BACKEND}/api/saas/admin${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json() as { message?: string; error?: string };
      setMsg(d.message ?? d.error ?? '');
      await load();
    } catch { setMsg('Erreur réseau'); }
  };

  const PLAN_COLORS: Record<string, string> = { starter: '#ff9500', pro: 'rgba(124,58,237,0.9)', enterprise: '#00d4ff', ultimate: '#ffd700' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 24 }}>👑</span>
        <div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: '#00d4ff', letterSpacing: '0.15em' }}>GOD MODE</div>
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Admin Dzaryx — Kouider</div>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 10, marginBottom: 12, fontFamily: 'Inter', fontSize: 12, color: '#00d4ff' }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 40, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Chargement…</div>
      ) : (
        <>
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Total clients', value: String(stats.total_orgs),    color: '#00d4ff' },
                { label: 'Plans Pro',     value: String(stats.pro_orgs),      color: 'rgba(124,58,237,0.9)' },
                { label: 'Enterprise',   value: String(stats.enterprise_orgs), color: '#00e676' },
                { label: 'Ultimate IoT', value: String(stats.ultimate_orgs ?? 0), color: '#ffd700' },
                { label: 'Rev. estimé',  value: `${stats.estimated_revenue_eur} €`, color: '#ff9500' },
              ].map(k => (
                <div key={k.label} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${k.color}20`, borderRadius: 12 }}>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}

          <div style={S.sectionLabel}>Clients ({orgs.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orgs.map(org => (
              <div key={org.org_id} style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{org.name}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{org.email}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{org.ai_name} · {org.sector} · {org.city}</div>
                  </div>
                  <div style={{ padding: '3px 8px', borderRadius: 8, background: `${PLAN_COLORS[org.plan] ?? '#888'}18`, border: `1px solid ${PLAN_COLORS[org.plan] ?? '#888'}30`, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: PLAN_COLORS[org.plan] ?? '#888' }}>{org.plan.toUpperCase()}</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
                  {org.messages_used}/{org.messages_limit} msgs · Connexion : {org.last_login_at ? new Date(org.last_login_at).toLocaleDateString('fr-FR') : 'jamais'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {org.plan !== 'pro'        && <button onClick={() => void act('PATCH', `/org/${org.org_id}/plan`, { plan: 'pro' })}        style={S.microBtn('rgba(124,58,237,0.9)')}>→ Pro</button>}
                  {org.plan !== 'enterprise' && <button onClick={() => void act('PATCH', `/org/${org.org_id}/plan`, { plan: 'enterprise' })} style={S.microBtn('#00d4ff')}>→ Ent.</button>}
                  {org.plan !== 'ultimate'   && <button onClick={() => void act('PATCH', `/org/${org.org_id}/plan`, { plan: 'ultimate' })}   style={S.microBtn('#ffd700')}>→ IoT</button>}
                  {org.plan !== 'starter'    && <button onClick={() => void act('PATCH', `/org/${org.org_id}/plan`, { plan: 'starter' })}    style={S.microBtn('#ff9500')}>→ Free</button>}
                  {org.messages_limit > 0
                    ? <button onClick={() => void act('POST', `/org/${org.org_id}/suspend`)}   style={S.microBtn('#ff3366')}>⏸ Suspend</button>
                    : <button onClick={() => void act('POST', `/org/${org.org_id}/unsuspend`)} style={S.microBtn('#00e676')}>▶ Réactiver</button>}
                  <button onClick={() => { if (window.confirm(`Supprimer ${org.name} définitivement ?`)) void act('DELETE', `/org/${org.org_id}`); }} style={S.microBtn('rgba(255,51,102,0.7)')}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
