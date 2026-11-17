// Définition de l'outil `iphone` SANS import (tools.ts la charge : éviter l'import circulaire via ai-util → claude-api → tools).
export type PhoneDo =
  | 'alarm' | 'timer' | 'focus' | 'silent' | 'torch' | 'wifi' | 'bluetooth' | 'cellular' | 'airplane' | 'low_power' | 'dark_mode'
  | 'volume' | 'brightness' | 'reminder' | 'note' | 'say' | 'clipboard' | 'shazam' | 'media'
  | 'call' | 'sms' | 'navigate' | 'music' | 'app' | 'open';
export const PHONE_ACTIONS: PhoneDo[] = ['alarm', 'timer', 'focus', 'silent', 'torch', 'wifi', 'bluetooth', 'cellular', 'airplane', 'low_power', 'dark_mode',
  'volume', 'brightness', 'reminder', 'note', 'say', 'clipboard', 'shazam', 'media', 'call', 'sms', 'navigate', 'music', 'app', 'open'];
// Applis ouvrables par leur lien (Raccourcis « Ouvrir les URL »)
export const PHONE_APPS: Record<string, string> = {
  waze: 'waze://', telegram: 'tg://', instagram: 'instagram://', tiktok: 'snssdk1233://', youtube: 'youtube://', spotify: 'spotify://',
  snapchat: 'snapchat://', facebook: 'fb://', gmail: 'googlegmail://', maps: 'maps://', plans: 'maps://', musique: 'music://', music: 'music://',
  photos: 'photos-redirect://', calendrier: 'calshow://', agenda: 'calshow://', notes: 'mobilenotes://', rappels: 'x-apple-reminderkit://',
  reglages: 'App-prefs:', réglages: 'App-prefs:', meteo: 'weather://', météo: 'weather://', horloge: 'clock-alarm://', appareil: 'camera://',
  chatgpt: 'chatgpt://', netflix: 'nflx://', shazam: 'shazam://', revolut: 'revolut://', wise: 'wise://',
};

export const IPHONE_TOOL = {
  name: 'iphone',
  description: 'Piloter l\'IPHONE de Kouider (comme Siri, en mieux) via son raccourci « Dzaryx Faire ». '
    + 'alarm (« réveille-moi à 5h »), timer (minuteur), focus (Ne pas déranger), silent (mode silence), torch (lampe), wifi, bluetooth, cellular (données), airplane (mode avion), '
    + 'low_power (économie d\'énergie), dark_mode (mode sombre), volume, brightness (luminosité), reminder (app Rappels), note (app Notes), say (le téléphone DIT un texte à voix haute), '
    + 'clipboard (copier un texte), shazam (reconnaître la musique), media (play/pause/next/previous), call (appeler un numéro), sms (prépare le SMS, il appuie sur Envoyer), '
    + 'navigate (Waze vers une adresse), music (chercher un titre/artiste), app (ouvrir une appli : waze, instagram, tiktok, youtube, spotify, telegram, photos, notes, réglages…), open (lien). '
    + 'Une action par appel ; plusieurs appels pour plusieurs actions. Ne dis jamais « je ne peux pas toucher à ton téléphone » : utilise cet outil. '
    + 'WhatsApp = jamais ici (outil whatsapp_web).',
  input_schema: {
    type: 'object' as const,
    properties: {
      action:  { type: 'string', enum: PHONE_ACTIONS },
      time:    { type: 'string', description: 'alarm : heure "HH:MM" (ex "05:30")' },
      label:   { type: 'string', description: 'alarm : nom de l\'alarme (ex "Salle")' },
      minutes: { type: 'number', description: 'timer : durée en minutes' },
      on:      { type: 'boolean', description: 'focus/silent/torch/wifi/bluetooth/cellular/airplane/low_power/dark_mode : true = activer, false = couper' },
      level:   { type: 'number', description: 'volume/brightness : 0 à 100' },
      text:    { type: 'string', description: 'reminder/note/say/clipboard/sms : le texte ; navigate : l\'adresse ; music : titre ou artiste ; app : nom de l\'appli' },
      when:    { type: 'string', description: 'reminder : date-heure "YYYY-MM-DD HH:MM" (optionnel)' },
      to:      { type: 'string', description: 'call/sms : numéro au format international (+33…, +213…, +32…)' },
      cmd:     { type: 'string', enum: ['play', 'pause', 'next', 'previous'], description: 'media' },
      url:     { type: 'string', description: 'open : lien tel:, sms:, facetime:, music:, https://waze.com/…, https://maps.apple.com/…' },
    },
    required: ['action'],
  },
};
