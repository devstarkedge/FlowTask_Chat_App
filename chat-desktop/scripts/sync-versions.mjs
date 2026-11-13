import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

const desktopPackagePath = path.join(rootDir, 'chat-desktop', 'package.json');
const desktopPkg = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));

const targetVersion = process.argv[2] || desktopPkg.version;

if (!targetVersion) {
  console.error('[sync-versions] Error: No version specified.');
  process.exit(1);
}

console.log(`[sync-versions] Synchronizing desktop package versions to: ${targetVersion}`);

const desktopPackages = [
  path.join(rootDir, 'chat-desktop', 'package.json'),
  path.join(rootDir, 'chat-desktop(mac)', 'package.json'),
];

for (const pkgPath of desktopPackages) {
  if (!fs.existsSync(pkgPath)) {
    console.warn(`[sync-versions] File not found, skipping: ${pkgPath}`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const prev = pkg.version;
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[sync-versions] Updated ${path.relative(rootDir, pkgPath)}: ${prev} -> ${targetVersion}`);
}

console.log('[sync-versions] Synchronization complete.');
