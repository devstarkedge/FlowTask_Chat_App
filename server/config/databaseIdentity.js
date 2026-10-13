import { randomUUID } from 'node:crypto';

const instanceId = randomUUID();
const processStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();

// Allowlisted runtime metadata only; never serialize the client/options/URI.
export function getDatabaseIdentity(connection, environment = {}) {
  let clusterHost = null;
  try { clusterHost = connection.getClient()?.options?.srvHost || null; } catch { /* No client yet. */ }
  const commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '';
  return {
    environment: environment.NODE_ENV || 'unknown',
    mongoEnvVariable: 'MONGO_URI',
    mongoEnvOverriddenByDotenv: environment.MONGO_ENV_OVERRIDDEN_BY_DOTENV === true,
    clusterHost,
    connectedHost: connection.host || null,
    database: connection.name || null,
    readyState: connection.readyState,
    commit: /^[a-f\d]{7,40}$/i.test(commit) ? commit : null,
    instanceId,
    processStartedAt,
  };
}
