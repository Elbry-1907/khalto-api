/**
 * Khalto — Provider Resolver
 *
 * Single source of truth for "which provider should I use?"
 * Used by sms.service.js, email.service.js, payments routes etc.
 *
 * Resolution order:
 *   1. Country-specific mapping (country_provider_mapping)
 *   2. First active+configured provider for the service
 *   3. Fallback to env variables (legacy)
 */

const db = require('../db');
const { decrypt } = require('./credentials.service');

// Cache for 60 seconds to avoid hitting DB on every notification
let cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getCacheKey = (serviceType, countryId) => `${serviceType}:${countryId || 'global'}`;

const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCached = (key, value) => {
  cache.set(key, { value, at: Date.now() });
};

const clearCache = () => cache.clear();

/**
 * Get the active provider for a (service, country) pair with decrypted credentials.
 *
 * @param {string} serviceType - 'sms' | 'whatsapp' | 'email' | 'payment'
 * @param {string} countryId   - UUID of country (optional)
 * @returns {object|null} - { provider_key, config, ...meta }
 */
async function resolveActiveProvider(serviceType, countryId = null) {
  const cacheKey = getCacheKey(serviceType, countryId);
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  let provider = null;

  // Try country-specific mapping first
  if (countryId) {
    const mapping = await db('country_provider_mapping as cpm')
      .join('service_providers as p', 'p.id', 'cpm.provider_id')
      .where({ 'cpm.country_id': countryId, 'cpm.service_type': serviceType, 'p.is_configured': true })
      .first('p.*', 'cpm.cash_on_delivery');
    if (mapping) provider = mapping;
  }

  // Fallback: any active+configured provider for this service
  if (!provider) {
    provider = await db('service_providers')
      .where({ service_type: serviceType, is_configured: true, is_active: true })
      .first();
  }

  if (!provider) {
    setCached(cacheKey, null);
    return null;
  }

  const result = {
    id: provider.id,
    provider_key: provider.provider_key,
    display_name: provider.display_name_en,
    config: decrypt(provider.config_encrypted) || {},
    cash_on_delivery: provider.cash_on_delivery || false,
  };

  setCached(cacheKey, result);
  return result;
}

/**
 * Get the country ID for a user.
 */
async function getUserCountryId(userId) {
  if (!userId) return null;
  const user = await db('users').where({ id: userId }).first('country_id');
  return user?.country_id || null;
}

/**
 * Helper: try-active-then-fallback pattern.
 * If DB has no active provider, returns null and caller should use env-based fallback.
 */
async function tryResolveOrFallback(serviceType, countryId) {
  try {
    return await resolveActiveProvider(serviceType, countryId);
  } catch (err) {
    console.error(`Provider resolution failed for ${serviceType}:`, err.message);
    return null;
  }
}

module.exports = {
  resolveActiveProvider,
  tryResolveOrFallback,
  getUserCountryId,
  clearCache,
};
