import fs from 'node:fs';
import path from 'node:path';

const assetsDir = path.resolve(process.argv[2] || 'release-assets');
const expectedVersion = process.argv[3];

console.log(`[validate-assets] Validating release assets in: ${assetsDir}`);
console.log(`[validate-assets] Expected application version: ${expectedVersion}`);

if (!fs.existsSync(assetsDir)) {
  console.error(`[validate-assets] ERROR: Assets directory does not exist: ${assetsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
console.log('[validate-assets] Files found:', files);

// Criteria checks
const winInstaller = files.find(f => f.endsWith('.exe'));
const winBlockmap = files.find(f => f.endsWith('.exe.blockmap'));
const winYaml = files.find(f => f === 'latest.yml');

const macDmg = files.find(f => f.endsWith('.dmg'));
const macZip = files.find(f => f.endsWith('.zip') && !f.endsWith('.exe.zip'));
const macYaml = files.find(f => f === 'latest-mac.yml');

let errors = [];

if (!winInstaller) {
  errors.push('Missing Windows installer (*.exe)');
} else {
  console.log(`[validate-assets] Found Windows installer: ${winInstaller}`);
}

if (!winYaml) {
  errors.push('Missing Windows update manifest (latest.yml)');
} else {
  console.log(`[validate-assets] Found Windows update manifest: ${winYaml}`);
  if (expectedVersion) {
    const content = fs.readFileSync(path.join(assetsDir, winYaml), 'utf8');
    if (!content.includes(`version: ${expectedVersion}`) && !content.includes(`version: '${expectedVersion}'`) && !content.includes(`version: "${expectedVersion}"`)) {
      errors.push(`Windows latest.yml does not match expected version ${expectedVersion}`);
    }
  }
}

if (!macDmg) {
  errors.push('Missing macOS installer (*.dmg)');
} else {
  console.log(`[validate-assets] Found macOS DMG: ${macDmg}`);
}

if (!macZip) {
  errors.push('Missing macOS update archive (*.zip)');
} else {
  console.log(`[validate-assets] Found macOS ZIP: ${macZip}`);
}

if (!macYaml) {
  errors.push('Missing macOS update manifest (latest-mac.yml)');
} else {
  console.log(`[validate-assets] Found macOS update manifest: ${macYaml}`);
  if (expectedVersion) {
    const content = fs.readFileSync(path.join(assetsDir, macYaml), 'utf8');
    if (!content.includes(`version: ${expectedVersion}`) && !content.includes(`version: '${expectedVersion}'`) && !content.includes(`version: "${expectedVersion}"`)) {
      errors.push(`macOS latest-mac.yml does not match expected version ${expectedVersion}`);
    }
  }
}

if (errors.length > 0) {
  console.error('[validate-assets] Release asset validation FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('[validate-assets] All required Windows and macOS release assets validated successfully!');
process.exit(0);
