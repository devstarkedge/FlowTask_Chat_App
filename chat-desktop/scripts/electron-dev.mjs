import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { DEV_URL, isWorkspaceServer } from './dev-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let server;
let electron;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // Close only resources this launcher created; an existing Vite stays alive.
  if (electron && electron.exitCode === null && !electron.killed) electron.kill();
  await server?.close();
  process.exitCode = code;
}

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  process.env.BROWSER = 'none';
  if (await isWorkspaceServer(root)) {
    console.info('[TaskChat] Reusing this workspace’s Vite server on port 5174.');
  } else {
    server = await createServer({ root, server: { port: 5174, strictPort: true } });
    try {
      await server.listen();
    } catch (error) {
      // Another launcher may have started our server after the initial check.
      await server.close();
      server = undefined;
      if (!(await isWorkspaceServer(root))) throw error;
    }
  }
  if (!(await isWorkspaceServer(root))) throw new Error('TaskChat dev server is not ready.');
  if (!stopping) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    console.info(`[TaskChat] Dev server ready at ${DEV_URL}. Starting Electron.`);
    electron = spawn(require('electron'), ['.'], { cwd: root, env, stdio: 'inherit' });
    electron.once('error', (error) => {
      console.error(`[TaskChat] Electron startup failed: ${error.message}`);
      void stop(1);
    });
    electron.once('exit', (code, signal) => void stop(signal ? 0 : (code ?? 1)));
  }
} catch (error) {
  console.error(`[TaskChat] ${error.message}`);
  console.error('[TaskChat] Electron was not launched. Port 5174 must be free or belong to this workspace’s Vite server.');
  await stop(1);
}
