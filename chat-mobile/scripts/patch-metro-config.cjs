/**
 * Patches the nested metro-config inside @expo/metro to fix the
 * ERR_UNSUPPORTED_ESM_URL_SCHEME error on Windows with Node >= 22.
 *
 * The older metro-config bundled inside @expo/metro calls
 *   await import(absolutePath)
 * without converting Windows drive-letter paths (D:\...) to file:// URLs.
 * This script adds the missing pathToFileURL() conversion.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'metro',
  'node_modules',
  'metro-config',
  'src',
  'loadConfig.js'
);

if (!fs.existsSync(target)) {
  console.log('[postinstall] Nested metro-config not found, skipping patch.');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');

// Already patched
if (src.includes('pathToFileURL')) {
  console.log('[postinstall] metro-config Windows ESM patch already applied.');
  process.exit(0);
}

// 1. Add the require for 'url' after the path require
src = src.replace(
  /(var path = _interopRequireWildcard\(require\("path"\)\);)\n(var _yaml = require\("yaml"\);)/,
  '$1\nvar _url = require("url");\n$2'
);

// 2. Replace the bare import(absolutePath) with the pathToFileURL version
src = src.replace(
  'const configModule = await import(absolutePath);',
  `const configModule = await import(
          path.isAbsolute(absolutePath)
            ? (0, _url.pathToFileURL)(absolutePath).toString()
            : absolutePath
        );`
);

fs.writeFileSync(target, src, 'utf8');
console.log('[postinstall] Applied metro-config Windows ESM URL patch.');
