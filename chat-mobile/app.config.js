import 'dotenv/config';
import fs from 'fs';
import { IOS_NOTIFICATION_SOUND_ASSETS } from './src/constants/notificationSounds.js';

function parseGoogleServicesEnv(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let content = raw.trim();
  if (
    (content.startsWith("'") && content.endsWith("'")) ||
    (content.startsWith('"') && content.endsWith('"'))
  ) {
    content = content.slice(1, -1).trim();
  }

  if (!content.startsWith('{')) {
    try {
      content = Buffer.from(content, 'base64').toString('utf-8').trim();
    } catch {
      return null;
    }
  }

  try {
    let parsed = JSON.parse(content);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    if (!parsed?.client?.[0]?.client_info?.mobilesdk_app_id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default ({ config }) => {
  // EAS may provide GOOGLE_SERVICES_JSON. Only overwrite the committed file
  // when the env value is valid JSON — truncated secrets cause
  // :app:processReleaseGoogleServices (MalformedJsonException).
  if (process.env.GOOGLE_SERVICES_JSON) {
    const parsedGoogleServices = parseGoogleServicesEnv(process.env.GOOGLE_SERVICES_JSON);
    if (parsedGoogleServices) {
      fs.writeFileSync(
        './google-services.json',
        `${JSON.stringify(parsedGoogleServices, null, 2)}\n`,
      );
    } else if (!fs.existsSync('./google-services.json')) {
      console.warn(
        'GOOGLE_SERVICES_JSON is not valid JSON and google-services.json is missing',
      );
    } else {
      console.warn(
        'GOOGLE_SERVICES_JSON is not valid JSON; using existing google-services.json',
      );
    }
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
