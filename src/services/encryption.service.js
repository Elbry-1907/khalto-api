/**
 * Khalto — Encryption Service
 * تشفير البيانات الحساسة: أرقام الهواتف، الحسابات البنكية، الهوية
 */

const crypto = require('crypto');

const ALGO      = 'aes-256-gcm';
const KEY_HEX   = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const KEY       = Buffer.from(KEY_HEX, 'hex');
const IV_LENGTH = 16;
const TAG_LEN   = 16;

// ── Encrypt ───────────────────────────────────────────────
const encrypt = (text) => {
  if (!text) return null;
  const iv         = crypto.randomBytes(IV_LENGTH);
  const cipher     = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag        = cipher.getAuthTag();
  // Format: iv(hex):tag(hex):data(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

// ── Decrypt ───────────────────────────────────────────────
const decrypt = (ciphertext) => {
  if (!ciphertext || !ciphertext.includes(':')) return ciphertext;
  try {
    const [ivHex, tagHex, dataHex] = ciphertext.split(':');
    const iv       = Buffer.from(ivHex, 'hex');
    const tag      = Buffer.from(tagHex, 'hex');
    const data     = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch {
    return null; // decryption failed (wrong key or tampered)
  }
};

// ── Hash (one-way, for search) ────────────────────────────
const hashForSearch = (value) => {
  if (!value) return null;
  return crypto.createHmac('sha256', KEY_HEX).update(String(value).toLowerCase()).digest('hex');
};

// ── Field-level encryption helpers ───────────────────────

// Encrypt sensitive fields before DB insert/update
const encryptFields = (obj, fields) => {
  const result = { ...obj };
  for (const field of fields) {
    if (result[field]) {
      result[`${field}_hash`]      = hashForSearch(result[field]);  // for search
      result[field]                = encrypt(result[field]);         // encrypted value
    }
  }
  return result;
};

// Decrypt fields after DB read
const decryptFields = (obj, fields) => {
  if (!obj) return obj;
  const result = { ...obj };
  for (const field of fields) {
    if (result[field]) result[field] = decrypt(result[field]);
  }
  return result;
};

// ── Sensitive fields per table ────────────────────────────
const SENSITIVE = {
  users:    ['phone', 'email'],
  kitchens: ['iban', 'bank_account_name'],
  couriers: ['iban', 'national_id_number'],
};

// ── Token masking (for logs/display) ─────────────────────
const maskPhone  = (phone) => phone ? phone.slice(0,4) + '****' + phone.slice(-2) : null;
const maskEmail  = (email) => {
  if (!email) return null;
  const [user, domain] = email.split('@');
  return user.slice(0,2) + '***@' + domain;
};
const maskIBAN   = (iban)  => iban  ? iban.slice(0,4) + ' **** **** ' + iban.slice(-4) : null;
const maskCard   = (card)  => card  ? '**** **** **** ' + card.slice(-4) : null;

// ── JWT payload sanitizer ─────────────────────────────────
// Never include sensitive fields in JWT
const sanitizeForToken = (user) => ({
  id:   user.id,
  role: user.role,
  // NO phone, email, etc.
});

// ── Password strength validator ───────────────────────────
const validatePasswordStrength = (password) => {
  const checks = {
    minLength:   password.length >= 8,
    hasUpper:    /[A-Z]/.test(password),
    hasLower:    /[a-z]/.test(password),
    hasNumber:   /\d/.test(password),
    hasSpecial:  /[!@#$%^&*()_+\-=\[\]{}|;':"\\,./<>?]/.test(password),
    notCommon:   !['password','123456','khalto123','admin123'].includes(password.toLowerCase()),
  };
  const score  = Object.values(checks).filter(Boolean).length;
  const passed = checks.minLength && checks.hasNumber && checks.notCommon;
  return { passed, score, checks };
};

// ── Secure comparison (timing-safe) ──────────────────────
const secureCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

module.exports = {
  encrypt, decrypt,
  hashForSearch,
  encryptFields, decryptFields,
  SENSITIVE,
  maskPhone, maskEmail, maskIBAN, maskCard,
  sanitizeForToken,
  validatePasswordStrength,
  secureCompare,
};
