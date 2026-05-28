# Dzaryx Native — Guide complet de build et publication

## ── DEMAIN : TODO LISTE (dans l'ordre) ────────────────────────────────────────

### 1. PICOVOICE — Wake word "Dzaryx" (~10 min)
1. Créer compte sur https://picovoice.ai (gratuit)
2. Console → AccessKey → copier la clé
3. Dans `dzaryx-native/lib/useWakeWord.ts` ligne 8 :
   ```
   REPLACE_WITH_YOUR_PICOVOICE_ACCESS_KEY  →  ta_clé_ici
   ```
4. Console → Wake Word → New Model → taper "Dzaryx" → Train
5. Télécharger : `Dzaryx_en_android_v3_0_0.ppn` et `Dzaryx_en_ios_v3_0_0.ppn`
6. Placer les 2 fichiers dans `dzaryx-native/assets/`
7. Dans `dzaryx-native/lib/useWakeWord.ts` ligne 20 :
   ```
   const USE_CUSTOM = false;  →  const USE_CUSTOM = true;
   ```

### 2. TWILIO — WhatsApp IA (~15 min)
1. Créer compte sur https://twilio.com
2. Activer WhatsApp Sandbox (ou WhatsApp Business API)
3. Railway → Variables → ajouter :
   ```
   TWILIO_ACCOUNT_SID = ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN  = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_WHATSAPP_FROM = whatsapp:+14155238886
   ```
4. Twilio Console → Messaging → WhatsApp → Sandbox Settings → Webhook :
   - URL : https://ibrahim-backend-production.up.railway.app/api/whatsapp/webhook
   - Method : HTTP POST

### 3. GOOGLE PLAY — Publication Android (~30 min)
1. Créer compte Google Play Developer : https://play.google.com/console ($25 une fois)
2. Créer nouvelle app → Package : `com.dzaryx.app`
3. Console API → Service Account → créer clé JSON → télécharger
4. Renommer le fichier en `google-play-service-account.json`
5. Placer dans `dzaryx-native/`
6. Dans Google Play Console → donner permission "Release Manager" au service account

### 4. APP STORE — iOS (optionnel, $99/an)
1. Créer compte Apple Developer : https://developer.apple.com
2. App Store Connect → Créer nouvelle app → Bundle ID : `com.dzaryx.app`
3. Dans `eas.json` remplir :
   ```
   appleId    : ton_apple_id@email.com
   ascAppId   : ID numérique de l'app (App Store Connect)
   appleTeamId: ton Team ID (10 caractères)
   ```

---

## ── COMMANDES (après avoir rempli tout ci-dessus) ─────────────────────────────

### Login EAS (une seule fois)
```bash
! cd dzaryx-native && eas login
```

### Build APK Android (test — install direct)
```bash
! cd dzaryx-native && npm install && eas build --platform android --profile preview --non-interactive
```

### Build AAB Android (Play Store)
```bash
! cd dzaryx-native && eas build --platform android --profile production --non-interactive
```

### Soumettre Play Store (après build production)
```bash
! cd dzaryx-native && eas submit --platform android --profile production --latest
```

### Build iOS (App Store — Mac obligatoire ou EAS cloud)
```bash
! cd dzaryx-native && eas build --platform ios --profile production --non-interactive
```

### Soumettre App Store
```bash
! cd dzaryx-native && eas submit --platform ios --profile production --latest
```

---

## ── CONFIG ACTUELLE ───────────────────────────────────────────────────────────

| Paramètre | Valeur |
|---|---|
| EAS Project ID | ca9eb26d-6235-4d3c-8720-1371ccf12a65 |
| Owner Expo | fikkouider |
| Package Android | com.dzaryx.app |
| Bundle iOS | com.dzaryx.app |
| Version | 1.3.0 (versionCode 16) |
| Backend | https://ibrahim-backend-production.up.railway.app |
| Token Kouider | f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2 |
| Token Houari | 99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2 |

---

## ── FONCTIONNALITÉS NATIVES ACTIVES ──────────────────────────────────────────

| Feature | Status |
|---|---|
| WebView PWA | ✅ |
| Biométrie (Face ID / empreinte) | ✅ |
| Push notifications FCM (Android) | ✅ |
| Notification permanente "Dzaryx actif" | ✅ |
| Offline cache flotte | ✅ |
| App shortcuts (long-press icône) | ✅ |
| Deep link dzaryx://voice | ✅ |
| Wake word Porcupine | ⏳ AccessKey requis |
| Alarme Android native | ✅ |
| Relock biométrie après 5 min background | ✅ |

---

## ── INSTALLER SUR ANDROID DIRECTEMENT (sans Play Store) ──────────────────────

1. Télécharge le `.apk` depuis le lien EAS (profil `preview`)
2. Sur le téléphone : Paramètres → Sécurité → Sources inconnues → Activer
3. Ouvre le `.apk` → Installer → Lancer Dzaryx
