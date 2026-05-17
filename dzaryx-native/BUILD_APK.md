# Build APK — Dzaryx Android

## Étape 1 — Login Expo (une seule fois)

Dans le terminal Claude Code, tape :
```
! eas login
```
Ou génère un token sur expo.dev → Account Settings → Access Tokens, puis :
```
! set EXPO_TOKEN=ton_token_ici
```

## Étape 2 — Build APK

```
! cd dzaryx-native && eas build --platform android --profile preview --non-interactive
```

Le build prend ~10-15 minutes sur les serveurs Expo.
Tu recevras un lien de téléchargement (.apk) à la fin.

## Info build

- EAS Project ID: 3536fdc5-6088-4fd4-9a4f-d443f0a52a1e
- Owner: fikdzaryx
- Package: com.dzaryx.app
- Version: 1.1.0 (versionCode 2)
- Profil: preview → buildType APK (installable directement)

## Installer sur OnePlus 5T

1. Télécharge le fichier .apk depuis le lien EAS
2. Sur le téléphone : Paramètres → Sécurité → Sources inconnues → Activer
3. Ouvre le .apk → Installer
4. Lance Dzaryx → Premier lancement : choisir Kouider ou Houari

## Variables d'environnement embarquées (.env)

```
EXPO_PUBLIC_BACKEND_URL=https://ibrahim-backend-production.up.railway.app
EXPO_PUBLIC_MOBILE_TOKEN=f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2
EXPO_PUBLIC_MOBILE_TOKEN_HOUARI=99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2
```
