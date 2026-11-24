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
  console.log('[postinstall] Nested metro-config not found, skipping ESM URL patch.');
} else {
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes('pathToFileURL')) {
    console.log('[postinstall] metro-config Windows ESM patch already applied.');
  } else {
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
  }
}

// Patch instantiateMetro to use graceful-fs on Windows to avoid EMFILE (too many open files)
const metroTargets = [
  path.join(__dirname, '..', 'node_modules', 'expo', 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'metro', 'instantiateMetro.js'),
  path.join(__dirname, '..', 'node_modules', '@expo', 'cli', 'build', 'src', 'start', 'server', 'metro', 'instantiateMetro.js')
];

for (const mTarget of metroTargets) {
  if (fs.existsSync(mTarget)) {
    let mSrc = fs.readFileSync(mTarget, 'utf8');
    if (!mSrc.includes('graceful-fs')) {
      mSrc = mSrc.replace(
        '"use strict";',
        '"use strict";\ntry { require("graceful-fs").gracefulify(require("fs")); } catch (e) {}'
      );
      fs.writeFileSync(mTarget, mSrc, 'utf8');
      console.log(`[postinstall] Injected graceful-fs into ${path.basename(mTarget)}.`);
    }
  }
}

