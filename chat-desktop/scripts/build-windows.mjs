import { existsSync } from 'node:fs';
import { mkdir, open, readFile, unlink, copyFile, rename, readdir, stat, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, 'node_modules', '.cache');
const output = path.join(root, 'dist-electron');
const lockPath = path.join(cache, 'taskchat-windows-build.lock');
const packageDir = path.join(cache, 'taskchat-windows-package');
const publishArg = process.argv.indexOf('--publish');
const publishPolicy = publishArg >= 0 ? process.argv[publishArg + 1] : 'never';
let lock;

if (!['never', 'always', 'onTag', 'onTagOrDraft'].includes(publishPolicy)) {
  throw new Error(`Unsupported --publish policy: ${publishPolicy || '(missing)'}`);
}

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
  // This is a dedicated disposable staging folder under node_modules/.cache;
  // clear stale output left by interrupted builds before packaging.
  const resolvedPackageDir = path.resolve(packageDir);
  const resolvedCacheDir = path.resolve(cache);
  if (!resolvedPackageDir.startsWith(`${resolvedCacheDir}${path.sep}`)) {
    throw new Error('Refusing to clean a package output path outside the build cache.');
  }
  await rm(packageDir, { recursive: true, force: true });
  const artifacts = await packageApp({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(),
    publish: publishPolicy,
    config: {
      directories: { output: packageDir },
      // Electron 43 no longer downloads its runtime during npm install.
      // Let electron-builder fetch its verified distribution when it is absent.
      ...(existsSync(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'))
        ? { electronDist: path.join(root, 'node_modules', 'electron', 'dist') } : {}),
    },
  });
  await mkdir(output, { recursive: true });
  // Copy all generated files (installer, blockmap, latest.yml) to output
  if (existsSync(packageDir)) {
    const files = await readdir(packageDir);
    for (const file of files) {
      const src = path.join(packageDir, file);
      const fileStat = await stat(src);
      if (fileStat.isFile()) {
        const destination = path.join(output, file);
        const temporary = `${destination}.tmp`;
        await copyFile(src, temporary);
        await rename(temporary, destination);
        console.info(`[TaskChat] Created ${destination}`);
      }
    }
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
