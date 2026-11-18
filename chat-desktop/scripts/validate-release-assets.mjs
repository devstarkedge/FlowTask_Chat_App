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
const macDmgBlockmap = files.find(f => f.endsWith('.dmg.blockmap'));
const macZip = files.find(f => f.endsWith('.zip') && !f.endsWith('.exe.zip'));
const macZipBlockmap = files.find(f => f.endsWith('.zip.blockmap'));
const macYaml = files.find(f => f === 'latest-mac.yml');
const hasAnyMacAsset = Boolean(macDmg || macDmgBlockmap || macZip || macZipBlockmap || macYaml);

let errors = [];

function validateManifestAssetUrls(manifestName) {
  const content = fs.readFileSync(path.join(assetsDir, manifestName), 'utf8');
  const urls = [...content.matchAll(/^\s*-\s+url:\s*["']?([^"'\r\n]+)["']?\s*$/gm)];
  for (const [, rawUrl] of urls) {
    const assetName = decodeURIComponent(rawUrl.trim().split(/[?#]/, 1)[0].split('/').pop());
    if (assetName && !files.includes(assetName)) {
      errors.push(`${manifestName} references missing release asset: ${assetName}`);
    }
  }
}

if (!winInstaller) {
  errors.push('Missing Windows installer (*.exe)');
} else {
  console.log(`[validate-assets] Found Windows installer: ${winInstaller}`);
}

if (!winBlockmap) {
  errors.push('Missing Windows installer blockmap (*.exe.blockmap)');
} else {
  console.log(`[validate-assets] Found Windows blockmap: ${winBlockmap}`);
}

if (!winYaml) {
  errors.push('Missing Windows update manifest (latest.yml)');
} else {
  console.log(`[validate-assets] Found Windows update manifest: ${winYaml}`);
  validateManifestAssetUrls(winYaml);
  if (expectedVersion) {
    const content = fs.readFileSync(path.join(assetsDir, winYaml), 'utf8');
    if (!content.includes(`version: ${expectedVersion}`) && !content.includes(`version: '${expectedVersion}'`) && !content.includes(`version: "${expectedVersion}"`)) {
      errors.push(`Windows latest.yml does not match expected version ${expectedVersion}`);
    }
  }
}

if (hasAnyMacAsset) {
  if (!macDmg) {
    errors.push('Missing macOS installer (*.dmg)');
  } else {
    console.log(`[validate-assets] Found macOS DMG: ${macDmg}`);
  }

  if (!macDmgBlockmap) {
    errors.push('Missing macOS DMG blockmap (*.dmg.blockmap)');
  } else {
    console.log(`[validate-assets] Found macOS DMG blockmap: ${macDmgBlockmap}`);
  }

  if (!macZip) {
    errors.push('Missing macOS update archive (*.zip)');
  } else {
    console.log(`[validate-assets] Found macOS ZIP: ${macZip}`);
  }

  if (!macZipBlockmap) {
    errors.push('Missing macOS ZIP blockmap (*.zip.blockmap)');
  } else {
    console.log(`[validate-assets] Found macOS ZIP blockmap: ${macZipBlockmap}`);
  }

  if (!macYaml) {
    errors.push('Missing macOS update manifest (latest-mac.yml)');
  } else {
    console.log(`[validate-assets] Found macOS update manifest: ${macYaml}`);
    validateManifestAssetUrls(macYaml);
    if (expectedVersion) {
      const content = fs.readFileSync(path.join(assetsDir, macYaml), 'utf8');
      if (!content.includes(`version: ${expectedVersion}`) && !content.includes(`version: '${expectedVersion}'`) && !content.includes(`version: "${expectedVersion}"`)) {
        errors.push(`macOS latest-mac.yml does not match expected version ${expectedVersion}`);
      }
    }
  }
} else {
  console.log('[validate-assets] No macOS assets supplied; continuing with the validated Windows release.');
}

if (errors.length > 0) {
  console.error('[validate-assets] Release asset validation FAILED:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log('[validate-assets] All supplied release assets validated successfully!');
process.exit(0);
