import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCRYPTION_PREFIX = 'enc:v1:';
const MASTER_KEY_SALT = 'flowtask-message-master-key-v1';
const WORKSPACE_KEY_INFO = 'flowtask-chat-workspace-key-v1';

let cachedMasterKey = null;
const cachedWorkspaceKeys = new Map();

/**
 * Returns the 32-byte master encryption key buffer.
 * If MESSAGE_ENCRYPTION_KEY is provided, uses that.
 * Otherwise, derives a 256-bit key from JWT_SECRET or FLOWTASK_JWT_SECRET using PBKDF2.
 */
export function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;

  const rawKey = process.env.MESSAGE_ENCRYPTION_KEY;
  if (rawKey && typeof rawKey === 'string' && rawKey.trim().length >= 32) {
    const trimmed = rawKey.trim();
    if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
      cachedMasterKey = Buffer.from(trimmed, 'hex');
    } else {
      cachedMasterKey = crypto.createHash('sha256').update(trimmed).digest();
    }
    return cachedMasterKey;
  }

  // Fallback: derive deterministically from JWT_SECRET
  const seed = process.env.JWT_SECRET || process.env.FLOWTASK_JWT_SECRET || 'flowtask-default-dev-secret-do-not-use-in-prod';
  cachedMasterKey = crypto.pbkdf2Sync(seed, MASTER_KEY_SALT, 100000, 32, 'sha256');
  return cachedMasterKey;
}

/**
 * Derives a tenant-isolated 32-byte key for a specific workspace using HKDF.
 * This guarantees cryptographic workspace isolation.
 */
export function getWorkspaceKey(workspaceId) {
  const wsIdStr = workspaceId ? String(workspaceId) : 'global';
  if (cachedWorkspaceKeys.has(wsIdStr)) {
    return cachedWorkspaceKeys.get(wsIdStr);
  }

  const master = getMasterKey();
  const salt = crypto.createHash('sha256').update(`workspace-salt-${wsIdStr}`).digest();
  const derivedKey = crypto.hkdfSync('sha256', master, salt, WORKSPACE_KEY_INFO, 32);
  const keyBuffer = Buffer.from(derivedKey);

  // Cache up to 1000 workspace keys
  if (cachedWorkspaceKeys.size >= 1000) {
    cachedWorkspaceKeys.clear();
  }
  cachedWorkspaceKeys.set(wsIdStr, keyBuffer);
  return keyBuffer;
}

/**
 * Checks if a string is already encrypted.
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encrypt(plaintext, workspaceId = null) {
  if (plaintext == null) return plaintext;
  if (typeof plaintext !== 'string') {
    plaintext = String(plaintext);
  }
  if (plaintext === '') return '';
  if (isEncrypted(plaintext)) return plaintext; // Prevent double encryption

  const key = getWorkspaceKey(workspaceId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a ciphertext string encrypted with AES-256-GCM.
 * If the input is not encrypted, returns it as-is.
 */
export function decrypt(ciphertext, workspaceId = null) {
  if (ciphertext == null) return ciphertext;
  if (typeof ciphertext !== 'string') return ciphertext;
  if (!isEncrypted(ciphertext)) return ciphertext; // Legacy plaintext

  try {
    const parts = ciphertext.slice(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) {
      return ciphertext; // Invalid format, return safely
    }

    const [ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encryptedText = Buffer.from(cipherHex, 'hex');

    const key = getWorkspaceKey(workspaceId);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    // If decryption fails under workspace-derived key, try master key fallback
    try {
      const parts = ciphertext.slice(ENCRYPTION_PREFIX.length).split(':');
      if (parts.length === 3) {
        const [ivHex, tagHex, cipherHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');
        const encryptedText = Buffer.from(cipherHex, 'hex');

        const masterKey = getMasterKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
          decipher.update(encryptedText),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
      }
    } catch (_) {
      // Fallback failed
    }
    return ciphertext;
  }
}

/**
 * Generates blind index HMAC tokens for searchable encryption without revealing plaintext.
 * Words are lowercased and hashed with a derived search key.
 */
export function generateSearchTokens(text, workspaceId = null) {
  if (!text || typeof text !== 'string') return [];
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 50);

  if (words.length === 0) return [];

  const key = getWorkspaceKey(workspaceId);
  const searchHmacKey = crypto.createHmac('sha256', key).update('search-tokens-salt').digest();

  const tokens = new Set();
  for (const word of words) {
    const hmac = crypto.createHmac('sha256', searchHmacKey).update(word).digest('hex').slice(0, 16);
    tokens.add(hmac);
  }

  return Array.from(tokens);
}

/**
 * Generates a HMAC search query token for a specific word.
 */
export function generateSearchQueryToken(word, workspaceId = null) {
  if (!word || typeof word !== 'string') return null;
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;

  const key = getWorkspaceKey(workspaceId);
  const searchHmacKey = crypto.createHmac('sha256', key).update('search-tokens-salt').digest();
  return crypto.createHmac('sha256', searchHmacKey).update(normalized).digest('hex').slice(0, 16);
}
