/**
 * Config plugin Dzaryx — Wake word "Zaria" (Porcupine) en service fond.
 *
 * Écoute "Zaria" en continu (foreground service) même app fermée → ouvre la barre overlay.
 * - dépendance gradle ai.picovoice:porcupine-android
 * - copie le modèle .ppn dans les assets Android
 * - Service Kotlin WakeWordService (PorcupineManager → onWake → démarre DzaryxOverlayService)
 * - Activity trampoline (deep link dzaryxwake://start) pour démarrer le service depuis le JS
 *
 * Démarrage : index.tsx fait Linking.openURL('dzaryxwake://start') au lancement de l'app.
 */
const {
  withAndroidManifest,
  withDangerousMod,
  withAppBuildGradle,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG = 'com.dzaryx.app';
const PPN_ASSET = 'Zaria_android.ppn';
// Clé Picovoice : JAMAIS en dur dans le repo. Lue depuis l'env (secret EAS).
const ACCESS_KEY = process.env.PICOVOICE_ACCESS_KEY || '';
const PORCUPINE_VERSION = '4.0.0';  // DOIT matcher le .ppn (Zaria..._v4_0_0)

const SERVICE_KT = `package ${PKG}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import ai.picovoice.porcupine.PorcupineManager
import ai.picovoice.porcupine.PorcupineManagerCallback
import java.io.File
import java.io.FileOutputStream

class DzaryxWakeWordService : Service() {
  private var porcupineManager: PorcupineManager? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotif()
    if (porcupineManager == null) startPorcupine()
    return START_STICKY
  }

  private fun startForegroundNotif() {
    val channelId = "dzaryx_wake"
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(channelId, "Dzaryx — \\"Zaria\\"", NotificationManager.IMPORTANCE_MIN)
      nm.createNotificationChannel(ch)
    }
    // Tap sur la notif → ouvre la barre overlay (pas l'app entière)
    val overlayIntent = Intent(this, DzaryxOverlayLauncherActivity::class.java)
    overlayIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    else PendingIntent.FLAG_UPDATE_CURRENT
    val pi = PendingIntent.getActivity(this, 0, overlayIntent, piFlags)

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      Notification.Builder(this, channelId) else Notification.Builder(this)
    val notif = builder
      .setContentTitle("Dzaryx à l'écoute")
      .setContentText("Dis \\"Zaria\\" ou tape ici pour parler")
      .setSmallIcon(applicationInfo.icon)
      .setContentIntent(pi)
      .build()
    startForeground(4243, notif)
  }

  private fun copyAsset(name: String): String {
    val out = File(filesDir, name)
    if (!out.exists()) {
      assets.open(name).use { input -> FileOutputStream(out).use { input.copyTo(it) } }
    }
    return out.absolutePath
  }

  private val retryHandler = Handler(Looper.getMainLooper())

  private fun startPorcupine() {
    // Micro requis — si pas accordé, on garde le service VIVANT (notif reste → tap ouvre overlay),
    // on retente plus tard. JAMAIS de stopSelf (sinon la notif disparaît).
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED) {
      retryHandler.postDelayed({ if (porcupineManager == null) startPorcupine() }, 8000)
      return
    }
    try {
      val keywordPath = copyAsset("${PPN_ASSET}")
      porcupineManager = PorcupineManager.Builder()
        .setAccessKey("${ACCESS_KEY}")
        .setKeywordPath(keywordPath)
        .setSensitivity(0.85f)
        .build(applicationContext, PorcupineManagerCallback { onWake() })
      porcupineManager?.start()
    } catch (e: Exception) {
      // Échec (activation hors-ligne, etc.) → on NE tue PAS le service (notif reste utilisable),
      // on retente dans 10s (ex: internet revenu).
      porcupineManager = null
      retryHandler.postDelayed({ if (porcupineManager == null) startPorcupine() }, 10000)
    }
  }

  private fun onWake() {
    // Réveil détecté → ouvre la barre overlay
    val i = Intent(this, DzaryxOverlayService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
  }

  override fun onDestroy() {
    retryHandler.removeCallbacksAndMessages(null)
    try { porcupineManager?.stop(); porcupineManager?.delete() } catch (e: Exception) {}
    porcupineManager = null
    super.onDestroy()
  }
}
`;

const BOOT_KT = `package ${PKG}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class DzaryxBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
      val i = Intent(context, DzaryxWakeWordService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i)
      else context.startService(i)
    }
  }
}
`;

const LAUNCHER_KT = `package ${PKG}

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings

class DzaryxWakeLauncherActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Exemption batterie (OnePlus tue les services fond sinon)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
          val bi = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + packageName))
          bi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(bi)
        }
      }
    } catch (e: Exception) {}
    try {
      val i = Intent(this, DzaryxWakeWordService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
    } catch (e: Exception) {}
    finish()
  }
}
`;

function withKotlin(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const javaDir = path.join(root, 'app', 'src', 'main', 'java', ...PKG.split('.'));
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'DzaryxWakeWordService.kt'), SERVICE_KT);
      fs.writeFileSync(path.join(javaDir, 'DzaryxWakeLauncherActivity.kt'), LAUNCHER_KT);
      fs.writeFileSync(path.join(javaDir, 'DzaryxBootReceiver.kt'), BOOT_KT);

      // Copie le .ppn dans les assets Android
      const assetsDir = path.join(root, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      const src = path.join(cfg.modRequest.projectRoot, 'assets', 'wakeword', PPN_ASSET);
      fs.copyFileSync(src, path.join(assetsDir, PPN_ASSET));
      return cfg;
    },
  ]);
}

function withGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    const dep = `    implementation "ai.picovoice:porcupine-android:${PORCUPINE_VERSION}"`;
    if (!cfg.modResults.contents.includes('porcupine-android')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*{/,
        (m) => `${m}\n${dep}`
      );
    }
    return cfg;
  });
}

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
    const perms = [
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    ];
    for (const p of perms) {
      if (!manifest.manifest['uses-permission'].some((u) => u.$['android:name'] === p)) {
        manifest.manifest['uses-permission'].push({ $: { 'android:name': p } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    // BootReceiver — relance le wake word après redémarrage
    app.receiver = app.receiver || [];
    if (!app.receiver.some((r) => r.$['android:name'] === '.DzaryxBootReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.DzaryxBootReceiver', 'android:exported': 'true' },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] },
        ],
      });
    }
    app.service = app.service || [];
    if (!app.service.some((s) => s.$['android:name'] === '.DzaryxWakeWordService')) {
      app.service.push({
        $: {
          'android:name': '.DzaryxWakeWordService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
    }
    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$['android:name'] === '.DzaryxWakeLauncherActivity')) {
      app.activity.push({
        $: {
          'android:name': '.DzaryxWakeLauncherActivity',
          'android:exported': 'true',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
          'android:excludeFromRecents': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } },
              { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
            ],
            data: [{ $: { 'android:scheme': 'dzaryxwake', 'android:host': 'start' } }],
          },
        ],
      });
    }
    return cfg;
  });
}

module.exports = function withDzaryxWakeWord(config) {
  config = withKotlin(config);
  config = withGradle(config);
  config = withManifest(config);
  return config;
};
