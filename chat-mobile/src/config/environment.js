import Constants from 'expo-constants';

/**
 * Centralized environment configuration for mobile app
 * Validates required variables and provides fallbacks
 */

const ENV = {
  API_BASE_URL: Constants.expoConfig?.extra?.API_BASE_URL || 'http://172.16.16.33:3200/api/chat',
  SOCKET_URL: Constants.expoConfig?.extra?.SOCKET_URL || 'http://172.16.16.33:3200',
  FLOWTASK_ENABLED: Constants.expoConfig?.extra?.FLOWTASK_ENABLED !== 'false',
};

// Validate required environment variables
const validateEnv = () => {
  const required = ['API_BASE_URL', 'SOCKET_URL'];
  const missing = required.filter(key => !ENV[key]);
  
  if (missing.length > 0) {
    console.warn(`[ENV] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[ENV] Using default development values');
  }
};

validateEnv();

export default ENV;
