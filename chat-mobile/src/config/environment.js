import Constants from 'expo-constants';
import logger from '../utils/logger';

/**
 * Centralized environment configuration for mobile app
 * Validates required variables and provides fallbacks
 */

const ENV = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || Constants.expoConfig?.extra?.apiUrl || Constants.expoConfig?.extra?.API_BASE_URL || 'https://chat-app-api-cyyl.onrender.com/api/chat',
  SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || Constants.expoConfig?.extra?.socketUrl || Constants.expoConfig?.extra?.SOCKET_URL || 'https://chat-app-api-cyyl.onrender.com',
  CLIENT_URL: process.env.EXPO_PUBLIC_CLIENT_URL || Constants.expoConfig?.extra?.clientUrl || 'https://chat-app-kte1.onrender.com',
  FLOWTASK_ENABLED: Constants.expoConfig?.extra?.FLOWTASK_ENABLED !== 'false',
};

// Validate required environment variables
const validateEnv = () => {
  const required = ['API_BASE_URL', 'SOCKET_URL'];
  const missing = required.filter(key => !ENV[key]);
  
  if (missing.length > 0) {
    logger.warn(`[ENV] Missing environment variables: ${missing.join(', ')}`);
    logger.warn('[ENV] Using default production values');
  }

  // ── Startup diagnostic logs ──────────────────────────────────────────────
  logger.info('═══════════════════════════════════════════════════');
  logger.info('[ENV] TaskChat Mobile — Environment Report');
  logger.info('[ENV] API_BASE_URL :', ENV.API_BASE_URL);
  logger.info('[ENV] SOCKET_URL   :', ENV.SOCKET_URL);
  logger.info('[ENV] FLOWTASK     :', ENV.FLOWTASK_ENABLED ? 'enabled' : 'disabled');
  logger.info('[ENV] Login endpoint  :', `${ENV.API_BASE_URL}/auth/login`);
  logger.info('[ENV] Channel endpoint:', `${ENV.API_BASE_URL}/channels`);
  logger.info('═══════════════════════════════════════════════════');
};

validateEnv();

export default ENV;
