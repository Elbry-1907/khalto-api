/**
 * Khalto — Credentials Encryption Service
 *
 * Uses AES-256-GCM for encrypting provider API keys.
 * Encryption key comes from CREDENTIALS_ENCRYPTION_KEY env var.
 * If missing, falls back to JWT_SECRET (less ideal but functional).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error('No encryption key set (CREDENTIALS_ENCRYPTION_KEY or JWT_SECRET required)');
  return crypto.createHash('sha256').update(raw).digest();
};

/**
 * Encrypt a JSON-serializable object.
 * Returns: base64 string containing IV + AuthTag + Ciphertext
 */
const encrypt = (data) => {
  if (data == null) return null;
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

/**
 * Decrypt a base64 string back to its original form (parsed as JSON if possible).
 */
const decrypt = (encryptedBase64) => {
  if (!encryptedBase64) return null;
  try {
    const buffer = Buffer.from(encryptedBase64, 'base64');
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    try {
      return JSON.parse(plaintext);
    } catch {
      return plaintext;
    }
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return null;
  }
};

/**
 * Mask a credential value for display (show first 4 + last 4 chars).
 * "sk_live_abc123def456" → "sk_live_abc1...f456"
 */
const mask = (value) => {
  if (!value) return '';
  const str = String(value);
  if (str.length <= 8) return '••••••••';
  return str.substring(0, 4) + '••••' + str.substring(str.length - 4);
};

/**
 * Mask all values in a config object (for safe display in API responses).
 */
const maskConfig = (config) => {
  if (!config || typeof config !== 'object') return config;
  const masked = {};
  const sensitiveKeys = ['key', 'token', 'secret', 'password', 'sid', 'auth'];
  for (const [k, v] of Object.entries(config)) {
    const isSensitive = sensitiveKeys.some(s => k.toLowerCase().includes(s));
    masked[k] = isSensitive && v ? mask(v) : v;
  }
  return masked;
};

module.exports = { encrypt, decrypt, mask, maskConfig };
