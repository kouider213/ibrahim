const { withMainActivity } = require('@expo/config-plugins');

// Forces screen to wake when app receives a deep link (e.g. dzaryx://voice from Porcupine)
module.exports = function withWakeScreen(config) {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    // Add WindowManager import
    if (!contents.includes('android.view.WindowManager')) {
      contents = contents.replace(
        /(^import android\.)/m,
        'import android.view.WindowManager\n$1'
      );
    }

    // Add Intent import (for onNewIntent)
    if (!contents.includes('android.content.Intent')) {
      contents = contents.replace(
        /(^import android\.)/m,
        'import android.content.Intent\n$1'
      );
    }

    // Add wake flags in onCreate (app launched from killed state)
    if (!contents.includes('FLAG_TURN_SCREEN_ON')) {
      contents = contents.replace(
        /setTheme\(R\.style\.AppTheme\)\s*\n(\s*)super\.onCreate/,
        `setTheme(R.style.AppTheme)\n$1window.addFlags(\n$1  android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or\n$1  android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or\n$1  android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD\n$1)\n$1super.onCreate`
      );
    }

    // Add onNewIntent override (app already running in background — most common case)
    if (!contents.includes('onNewIntent')) {
      contents = contents.replace(
        /(\s*override fun getMainComponentName)/,
        `
  override fun onNewIntent(intent: android.content.Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    window.addFlags(
      android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
      android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
  }
$1`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
