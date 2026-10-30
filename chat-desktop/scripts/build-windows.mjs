import { existsSync } from 'node:fs';
import { mkdir, open, readFile, unlink, copyFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, 'node_modules', '.cache');
const output = path.join(root, 'dist-electron');
const lockPath = path.join(cache, 'taskchat-windows-build.lock');
let lock;

async function acquireLock() {
  await mkdir(cache, { recursive: true });
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(owner) || owner <= 0) throw new Error('Another Windows build is starting. Wait for it to finish.');
    try {
      process.kill(owner, 0);
    } catch (checkError) {
      if (checkError.code !== 'ESRCH') throw new Error('Another Windows build is already running. Wait for it to finish.');
      // Recover only a lock whose owning process has exited.
      await unlink(lockPath);
      lock = await open(lockPath, 'wx');
      await lock.writeFile(String(process.pid));
      return;
    }
    throw new Error('Another Windows build is already running. Wait for it to finish.');
  }
  await lock.writeFile(String(process.pid));
}

try {
  await acquireLock();
  const { build } = await import('vite');
  const { build: packageApp, Platform } = createRequire(import.meta.url)('electron-builder');
  await build({ root, mode: 'production' });
  // Never replace the unpacked executable users may currently be running.
  const artifacts = await packageApp({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(),
    config: {
      directories: { output: path.join(cache, 'taskchat-windows-package') },
      // Electron 43 no longer downloads its runtime during npm install.
      // Let electron-builder fetch its verified distribution when it is absent.
      ...(existsSync(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'))
        ? { electronDist: path.join(root, 'node_modules', 'electron', 'dist') } : {}),
    },
  });
  await mkdir(output, { recursive: true });
  for (const artifact of artifacts) {
    const destination = path.join(output, path.basename(artifact));
    const temporary = `${destination}.tmp`;
    await copyFile(artifact, temporary);
    await rename(temporary, destination);
    console.info(`[TaskChat] Created ${destination}`);
  }
} catch (error) {
  console.error(`[TaskChat] Windows build failed: ${error.message}`);
  if (error.code === 'ERR_MODULE_NOT_FOUND') console.error('[TaskChat] Install build dependencies with: npm ci --include=dev');
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await unlink(lockPath);
  }
}
