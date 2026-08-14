import 'dotenv/config';
import fs from 'fs';
import { IOS_NOTIFICATION_SOUND_ASSETS } from './src/constants/notificationSounds.js';

export default ({ config }) => {
  // Handle google-services.json creation from environment variable if provided
  if (process.env.GOOGLE_SERVICES_JSON) {
    let content = process.env.GOOGLE_SERVICES_JSON;
    // Decode if base64 encoded
    if (!content.trim().startsWith('{')) {
      try {
        content = Buffer.from(content, 'base64').toString('utf-8');
      } catch (e) {
        console.warn('Failed to decode GOOGLE_SERVICES_JSON from base64, using raw value');
      }
    }
    fs.writeFileSync('./google-services.json', content);
  }

  const hasGoogleServices = fs.existsSync('./google-services.json');
  const androidConfig = { ...config.android };
  if (hasGoogleServices) {
    androidConfig.googleServicesFile = './google-services.json';
  } else {
    delete androidConfig.googleServicesFile;
  }

  const basePlugins = (config.plugins || []).filter(
    (plugin) => !(Array.isArray(plugin) && plugin[0] === 'expo-notifications'),
  );

  // Load environment variables based on NODE_ENV
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'staging';
  const envFile = env === 'production' ? '.env.production' : '.env.staging';
  // dotenv already loaded via import above, but ensure file is read
  // The values will be available in process.env

  return {
    ...config,
    android: androidConfig,
    plugins: [
      [
        'expo-notifications',
        {
          sounds: IOS_NOTIFICATION_SOUND_ASSETS,
        },
      ],
      ...basePlugins,
    ],
    extra: {
      ...config.extra,
      apiUrl: process.env.API_URL,
      socketUrl: process.env.SOCKET_URL,
      sentryDsn: process.env.SENTRY_DSN,
      firebaseConfig: {
        apiKey: process.env.FIREBASE_API_KEY,
        appId: process.env.FIREBASE_APP_ID,
        projectId: process.env.FIREBASE_PROJECT_ID,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
      },
    },
  };
};
