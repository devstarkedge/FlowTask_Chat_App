import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

function setOutput(key, value) {
  console.log(`[check-version] OUTPUT: ${key}=${value}`);
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`, 'utf8');
  }
}

function parseSemver(v) {
  if (!v || typeof v !== 'string') return null;
  const clean = v.replace(/^v/, '').trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    raw: clean,
  };
}

function compareSemver(a, b) {
  const vA = parseSemver(a);
  const vB = parseSemver(b);
  if (!vA || !vB) throw new Error(`Invalid semantic version string: "${a}" or "${b}"`);

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1;
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1;
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1;

  if (vA.prerelease && !vB.prerelease) return -1;
  if (!vA.prerelease && vB.prerelease) return 1;
  if (vA.prerelease && vB.prerelease) {
    if (vA.prerelease !== vB.prerelease) return vA.prerelease.localeCompare(vB.prerelease);
  }
  return 0;
}

// 1. Read current version from chat-desktop/package.json
const desktopPkgPath = path.join(rootDir, 'chat-desktop', 'package.json');
if (!fs.existsSync(desktopPkgPath)) {
  console.error('[check-version] Error: chat-desktop/package.json not found!');
  process.exit(1);
}
const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
const currentVersion = desktopPkg.version;
const forceRelease = process.env.FORCE_RELEASE === 'true';

if (!parseSemver(currentVersion)) {
  console.error(`[check-version] Error: Invalid semver in chat-desktop/package.json: "${currentVersion}"`);
  process.exit(1);
}

console.log(`[check-version] Current desktop package.json version: ${currentVersion}`);

// 2. Read previous version from previous commit (chat-desktop/package.json)
let prevVersion = null;
const beforeCommit = process.env.GITHUB_EVENT_BEFORE;
const isZeroSha = !beforeCommit || /^0+$/.test(beforeCommit);

if (!isZeroSha) {
  try {
    const raw = execSync(`git show ${beforeCommit}:chat-desktop/package.json`, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const parsed = JSON.parse(raw);
    prevVersion = parsed.version;
    console.log(`[check-version] Retrieved previous version from commit ${beforeCommit.slice(0, 7)}: ${prevVersion}`);
  } catch (err) {
    console.log(`[check-version] Could not read chat-desktop/package.json from GITHUB_EVENT_BEFORE (${beforeCommit.slice(0, 7)}). Falling back to HEAD~1.`);
  }
}

if (!prevVersion) {
  try {
    const raw = execSync('git show HEAD~1:chat-desktop/package.json', { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const parsed = JSON.parse(raw);
    prevVersion = parsed.version;
    console.log(`[check-version] Retrieved previous version from HEAD~1: ${prevVersion}`);
  } catch (err) {
    console.log('[check-version] Could not read chat-desktop/package.json from HEAD~1. This may be the initial commit.');
  }
}

// 3. Version comparison
if (prevVersion) {
  const cmp = compareSemver(currentVersion, prevVersion);

  if (cmp === 0) {
    if (forceRelease) {
      console.log(`[check-version] Manual workflow run requested publication of current version ${currentVersion}.`);
    } else {
      console.log(`[check-version] No version change detected (current: ${currentVersion}, previous: ${prevVersion}).`);
      console.log('[check-version] Exiting successfully without triggering a desktop release.');
      setOutput('should_release', 'false');
      setOutput('version', currentVersion);
      setOutput('previous_version', prevVersion);
      process.exit(0);
    }
  }

  if (cmp < 0) {
    console.error(`[check-version] ERROR: Version downgrade detected! Current version (${currentVersion}) is lower than previous version (${prevVersion}).`);
    setOutput('should_release', 'false');
    process.exit(1);
  }

  console.log(`[check-version] Version increased: ${prevVersion} -> ${currentVersion}`);
} else {
  console.log(`[check-version] No previous version found. Treating as initial release candidate: ${currentVersion}`);
}

// 4. Duplicate release publication check
const tagName = `v${currentVersion}`;
let duplicateFound = false;

// Check local git tags
try {
  const localTag = execSync(`git tag -l "${tagName}"`, { cwd: rootDir, encoding: 'utf8' }).trim();
  if (localTag === tagName) {
    duplicateFound = true;
    console.error(`[check-version] Local git tag ${tagName} already exists!`);
  }
} catch {}

// Check GitHub Releases via GitHub API if in CI
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (repo && token) {
  try {
    const checkUrl = `https://api.github.com/repos/${repo}/releases/tags/${tagName}`;
    console.log(`[check-version] Checking GitHub Releases for ${tagName} at ${checkUrl}...`);
    const curlOutput = execSync(
      `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github+json" "${checkUrl}"`,
      { encoding: 'utf8' }
    ).trim();

    if (curlOutput === '200') {
      duplicateFound = true;
      console.error(`[check-version] GitHub Release ${tagName} is already published!`);
    } else {
      console.log(`[check-version] GitHub Release check status: HTTP ${curlOutput} (release does not exist yet).`);
    }
  } catch (err) {
    console.warn(`[check-version] Warning: GitHub API check encountered: ${err.message}`);
  }
}

if (duplicateFound) {
  console.error(`[check-version] ERROR: Duplicate version publication prevented! Release ${tagName} already exists.`);
  setOutput('should_release', 'false');
  process.exit(1);
}

console.log(`[check-version] Validation passed. Triggering release for ${tagName}.`);
setOutput('should_release', 'true');
setOutput('version', currentVersion);
setOutput('previous_version', prevVersion || 'none');
setOutput('tag_name', tagName);
process.exit(0);
