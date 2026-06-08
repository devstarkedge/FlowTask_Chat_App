import Constants from 'expo-constants';

/**
 * Centralized environment configuration for mobile app
 * Validates required variables and provides fallbacks
 */

const ENV = {
  API_BASE_URL: Constants.expoConfig?.extra?.API_BASE_URL || 'https://chat-app-api-cyyl.onrender.com/api/chat',
  SOCKET_URL: Constants.expoConfig?.extra?.SOCKET_URL || 'https://chat-app-api-cyyl.onrender.com',
  FLOWTASK_ENABLED: Constants.expoConfig?.extra?.FLOWTASK_ENABLED !== 'false',
};

// Validate required environment variables
const validateEnv = () => {
  const required = ['API_BASE_URL', 'SOCKET_URL'];
  const missing = required.filter(key => !ENV[key]);
  
  if (missing.length > 0) {
    console.warn(`[ENV] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[ENV] Using default production values');
  }

  // ── Startup diagnostic logs ──────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('[ENV] FlowTask-Chat Mobile — Environment Report');
  console.log('[ENV] API_BASE_URL :', ENV.API_BASE_URL);
  console.log('[ENV] SOCKET_URL   :', ENV.SOCKET_URL);
  console.log('[ENV] FLOWTASK     :', ENV.FLOWTASK_ENABLED ? 'enabled' : 'disabled');
  console.log('[ENV] Login endpoint  :', `${ENV.API_BASE_URL}/auth/login`);
  console.log('[ENV] Channel endpoint:', `${ENV.API_BASE_URL}/channels`);
  console.log('═══════════════════════════════════════════════════');
};

validateEnv();

export default ENV;
