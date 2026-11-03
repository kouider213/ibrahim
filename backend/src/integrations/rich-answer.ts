// 💬 RÉPONSES « COMME CHATGPT » (Kouider 03/11, capture ChatGPT « rendre les veines du bras plus visibles ») :
// pour une question de conseil / « comment faire », Dzaryx doit répondre en profondeur, PERSONNALISÉ avec ses vraies
// données (poids, objectif de sèche, séances… de FORME) et illustré (photos d'exercices de la bibliothèque FORME,
// domaine public). Avant : bonne réponse générale, mais rien sur LUI, aucune image, et des « ### » bruts dans Telegram.

const HOWTO = /comment (?:faire|avoir|rendre|gagner|perdre|prendre|devenir|am[ée]liorer|augmenter|r[ée]duire|muscler|travailler|progresser|bien|on fait|je fais|je peux)|tu me conseill|des conseils|conseille[- ]moi|quels? (?:exercices?|aliments?|conseils?)|qu.est[- ]ce qu.il faut|c.est quoi le mieux|explique[- ]moi|pourquoi (?:je|mes|mon|ma)|astuces?|m[ée]thode pour|programme pour|plan pour/i;
// Demandes de travail (FIK, outils) : réponse courte et action, pas un cours
const WORK = /r[ée]serv|client|factur|devis|voiture|clio|location|mail|whatsapp|agenda|rendez|rdv|appel|message|envoi|envoy|houari|site|prospect|paiement|caution|contrat|dzaryx|appli|widget/i;
const BODY = /veine|vascular|muscl|bras|biceps|triceps|avant[- ]bras|pecs?\b|pectora|[ée]paules?|dos\b|abdos?|ventre|jambes?|cuisses?|fessiers?|mollets?|s[èe]che|gras|graisse|maigrir|perdre du poids|prise de masse|abdominaux|force|endurance|cardio|courir|course|sport|salle|entra[iî]n|r[ée]cup[ée]r|sommeil|dormir|prot[ée]ine|calorie|physique|corps|posture|souplesse/i;

// Exercices classiques choisis à la main (free-exercise-db) par zone citée — les « premiers de la liste » donnaient
// « Flexion des doigts » ou « Développé JM ».
const ZONES: Array<[RegExp, string[]]> = [
  [/veine|vascular|avant[- ]bras/i, ['Hammer_Curls', 'Palms-Up_Barbell_Wrist_Curl_Over_A_Bench', 'Farmers_Walk']],
  [/biceps|\bbras\b/i, ['Dumbbell_Bicep_Curl', 'Hammer_Curls', 'Triceps_Pushdown']],
  [/triceps/i, ['Triceps_Pushdown']],
  [/pecs?\b|pectora|torse/i, ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Pushups']],
  [/[ée]paules?/i, ['Dumbbell_Shoulder_Press', 'Side_Lateral_Raise']],
  [/\bdos\b|trap[èe]ze|tractions?/i, ['Wide-Grip_Lat_Pulldown', 'Seated_Cable_Rows', 'Pullups']],
  [/abdos?|ventre|abdominaux|tablette/i, ['Plank', 'Hanging_Leg_Raise', 'Crunches']],
  [/jambes?|cuisses?|quadri|squat/i, ['Barbell_Squat', 'Leg_Press', 'Romanian_Deadlift']],
  [/fessiers?/i, ['Barbell_Hip_Thrust', 'Dumbbell_Lunges']],
  [/mollets?/i, ['Standing_Calf_Raises']],
];

/** Photos d'exercices (3 max) pour les zones citées dans la question. */
async function exerciseImages(q: string): Promise<Array<{ fr: string; url: string }>> {
  const ids = [...new Set(ZONES.filter(([re]) => re.test(q)).flatMap(([, l]) => l))];
  if (!ids.length) return [];
  const lib = await import('./exercise-lib.js').then(m => m.exerciseLibrary()).catch(() => []);
  return ids.map(id => lib.find(e => e.id === id)).filter(e => e?.img[0]).slice(0, 3).map(e => ({ fr: e!.fr, url: e!.img[1] ?? e!.img[0]! }));
}

/** Consigne ajoutée au contexte du cerveau (canal texte uniquement), '' si ce n'est pas une question de conseil. */
export async function richAnswerHint(userMessage: string): Promise<string> {
  const q = userMessage.replace(/^\s*\[[\s\S]*?\]\s*/, '').trim();
  if (q.length < 12 || q.length > 400 || !HOWTO.test(q) || WORK.test(q)) return '';
  const body = BODY.test(q);
  const [physique, imgs] = body
    ? await Promise.all([
      import('./forme-cut.js').then(m => m.formeSnapshot()).catch(() => ''),
      exerciseImages(q).catch(() => []),
    ])
    : ['', []];
  return [
    `RÉPONSE COMPLÈTE « COMME CHATGPT » (Kouider pose une question de conseil : il veut une vraie réponse d'expert, pas 3 lignes) :`,
    `• Commence par 1-2 phrases qui résument l'idée clé (le mot technique en italique si utile, ex. *vascularité*).`,
    body ? `• PUIS une phrase sur SON cas avec SES vrais chiffres ci-dessous (poids actuel, objectif, semaine de sèche, séances) : « Avec ton objectif de passer de X kg à … voici ce que je te conseille. » N'invente aucun chiffre absent.` : `• Relie la réponse à SA situation (FIK, Oran, sa famille, ses objectifs) quand c'est pertinent, sans inventer.`,
    `• Ensuite des sections numérotées avec un titre en gras (**1. Titre**), chacune avec 2-4 puces « • » concrètes et chiffrées (séries, reps, durées, quantités).`,
    `• Finis par **Ton plan** : 3-4 actions précises pour cette semaine, adaptées à lui.`,
    `• Format Telegram : **gras** et puces « • » seulement — PAS de titres « ### », PAS de lignes « --- », PAS de tableaux.`,
    body ? `• Santé : conseils sûrs et sourcés (pas de produits dopants, diurétiques ou déshydratation pour « faire ressortir les veines »).` : '',
    physique ? `\n${physique}` : '',
    imgs.length ? `\nPHOTOS D'EXERCICES DISPONIBLES (bibliothèque FORME) : mets-les dans la section exercices, telles quelles, chacune sur sa propre ligne (Telegram les envoie en photo) :\n${imgs.map(i => `![${i.fr}](${i.url})`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}
