const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Prefer adjustNothing so the window does not resize/pan.
 * JS uses measureInWindow overlap as the keyboard bottom offset, which also
 * stays correct if an OEM still applies adjustResize.
 */
function withAndroidAdjustNothing(config) {
  return withAndroidManifest(config, (config) => {
    const activities = config.modResults?.manifest?.application?.[0]?.activity;
    if (!Array.isArray(activities)) return config;

    for (const activity of activities) {
      activity.$ = activity.$ || {};
      activity.$['android:windowSoftInputMode'] = 'adjustNothing';
    }
    return config;
  });
}

module.exports = withAndroidAdjustNothing;
