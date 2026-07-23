import 'dotenv/config';

export default ({ config }) => {
  // Load environment variables based on NODE_ENV
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'staging';
  const envFile = env === 'production' ? '.env.production' : '.env.staging';
  // dotenv already loaded via import above, but ensure file is read
  // The values will be available in process.env

  return {
    ...config,
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
