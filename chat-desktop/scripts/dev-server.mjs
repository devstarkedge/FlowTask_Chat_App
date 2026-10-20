import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

export const DEV_URL = 'http://localhost:5174';
export const IDENTITY_PATH = '/__taskchat_dev_server__';

export function workspaceIdentity(root) {
  return createHash('sha256').update(realpathSync(root)).digest('hex');
}

export function taskChatDevServer(root) {
  const workspace = workspaceIdentity(root);
  return {
    name: 'taskchat-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(IDENTITY_PATH, (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ app: 'taskchat-desktop', workspace }));
      });
    },
  };
}

// An open TCP port alone does not establish that this is our Vite server.
export async function isWorkspaceServer(root, url = DEV_URL) {
  try {
    const response = await fetch(`${url}${IDENTITY_PATH}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return false;
    const identity = await response.json();
    return identity.app === 'taskchat-desktop' && identity.workspace === workspaceIdentity(root);
  } catch {
    return false;
  }
}
