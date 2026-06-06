/**
 * Config plugin Dzaryx — Overlay flottant "comme Gemini Live".
 *
 * Android étant en workflow managed (android/ régénéré au prebuild), on injecte ici :
 *  - permissions (SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE[_MICROPHONE])
 *  - un Service Kotlin qui affiche une WebView (la page vocale) PAR-DESSUS les autres apps
 *  - une Activity "trampoline" (deep link dzaryxoverlay://go) qui demande la permission
 *    "affichage par-dessus les autres apps" puis démarre le service
 *
 * Déclenchement depuis le JS : Linking.openURL('dzaryxoverlay://go')
 */
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG = 'com.dzaryx.app';
const OVERLAY_URL = 'https://kouider213.github.io/ibrahim/?overlay=1';

// ── Kotlin : Service overlay ────────────────────────────────────────────────
const SERVICE_KT = `package ${PKG}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView

class DzaryxOverlayService : Service() {
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotif()
    if (overlayView == null) showOverlay()
    return START_STICKY
  }

  private fun startForegroundNotif() {
    val channelId = "dzaryx_overlay"
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(channelId, "Dzaryx Overlay", NotificationManager.IMPORTANCE_MIN)
      nm.createNotificationChannel(ch)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      Notification.Builder(this, channelId) else Notification.Builder(this)
    val notif = builder
      .setContentTitle("Dzaryx")
      .setContentText("Assistant vocal actif")
      .setSmallIcon(applicationInfo.icon)
      .build()
    startForeground(4242, notif)
  }

  private fun showOverlay() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      stopSelf(); return
    }
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val container = FrameLayout(this)
    container.setBackgroundColor(Color.parseColor("#CC000000"))

    val web = WebView(this)
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.mediaPlaybackRequiresUserGesture = false
    web.webViewClient = WebViewClient()
    web.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest) {
        request.grant(request.resources)
      }
    }
    web.loadUrl("${OVERLAY_URL}")

    val close = TextView(this)
    close.text = "✕"
    close.setTextColor(Color.WHITE)
    close.textSize = 20f
    close.setPadding(28, 14, 28, 14)
    close.setOnClickListener { removeOverlay(); stopSelf() }

    container.addView(
      web,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
      )
    )
    val closeLp = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT
    )
    closeLp.gravity = Gravity.TOP or Gravity.END
    container.addView(close, closeLp)

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else
      @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    val height = (resources.displayMetrics.heightPixels * 0.42).toInt()
    val lp = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      height,
      type,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    )
    lp.gravity = Gravity.TOP

    overlayView = container
    try { wm.addView(container, lp) } catch (e: Exception) { stopSelf() }
  }

  private fun removeOverlay() {
    overlayView?.let { try { windowManager?.removeView(it) } catch (e: Exception) {} }
    overlayView = null
  }

  override fun onDestroy() {
    removeOverlay()
    super.onDestroy()
  }
}
`;

// ── Kotlin : Activity trampoline (deep link → permission → start service) ────
const LAUNCHER_KT = `package ${PKG}

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings

class DzaryxOverlayLauncherActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      try {
        startActivity(
          Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + packageName)
          )
        )
      } catch (e: Exception) {}
    } else {
      val i = Intent(this, DzaryxOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(i) else startService(i)
    }
    finish()
  }
}
`;

function withKotlinFiles(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const javaDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', ...PKG.split('.')
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'DzaryxOverlayService.kt'), SERVICE_KT);
      fs.writeFileSync(path.join(javaDir, 'DzaryxOverlayLauncherActivity.kt'), LAUNCHER_KT);
      return cfg;
    },
  ]);
}

function withOverlayManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // Permissions
    const perms = [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || [];
    for (const p of perms) {
      const exists = manifest.manifest['uses-permission'].some(
        (u) => u.$['android:name'] === p
      );
      if (!exists) manifest.manifest['uses-permission'].push({ $: { 'android:name': p } });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    // Service
    app.service = app.service || [];
    if (!app.service.some((s) => s.$['android:name'] === '.DzaryxOverlayService')) {
      app.service.push({
        $: {
          'android:name': '.DzaryxOverlayService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'microphone',
        },
      });
    }

    // Activity trampoline (deep link dzaryxoverlay://go)
    app.activity = app.activity || [];
    if (!app.activity.some((a) => a.$['android:name'] === '.DzaryxOverlayLauncherActivity')) {
      app.activity.push({
        $: {
          'android:name': '.DzaryxOverlayLauncherActivity',
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
            data: [{ $: { 'android:scheme': 'dzaryxoverlay', 'android:host': 'go' } }],
          },
        ],
      });
    }

    return cfg;
  });
}

module.exports = function withDzaryxOverlay(config) {
  config = withKotlinFiles(config);
  config = withOverlayManifest(config);
  return config;
};
