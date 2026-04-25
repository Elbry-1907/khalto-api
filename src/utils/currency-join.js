// ═══════════════════════════════════════════════════════════
// src/utils/currency-join.js
// ─────────────────────────────────────────────────────────────
// Reusable helpers to attach country/currency data to admin
// list endpoints. Keeps every admin route consistent.
// ═══════════════════════════════════════════════════════════

/**
 * Standard SELECT fields to add when joining countries table.
 * Returns an array of qualified column expressions.
 *
 * Usage with raw pg:
 *   const SELECT = `SELECT t.*, ${currencyFields('c').join(', ')} FROM ...`;
 *
 * Usage with knex:
 *   knex.select('t.*', ...currencyFields('c'))
 */
const currencyFields = (alias = 'c') => [
  `${alias}.id           as country_id`,
  `${alias}.code         as country_code`,
  `${alias}.name_ar      as country_name_ar`,
  `${alias}.name_en      as country_name_en`,
  `${alias}.currency_code`,
  `${alias}.currency_symbol`,
  `${alias}.currency_symbol_en`,
];

/**
 * SQL fragment for raw queries — joins countries via country_id FK.
 *
 * Usage:
 *   const sql = `
 *     SELECT t.*, ${currencyFields('c').join(',\n            ')}
 *     FROM kitchens t
 *     ${joinCountrySql('t.country_id', 'c')}
 *     WHERE ...
 *   `;
 */
const joinCountrySql = (fkColumn, alias = 'c') =>
  `LEFT JOIN countries AS ${alias} ON ${alias}.id = ${fkColumn}`;

/**
 * SQL fragment that joins via currency_code instead of FK.
 * Used for tables that store currency_code directly (orders, settlements).
 */
const joinCountryByCodeSql = (currencyColumn, alias = 'c') =>
  `LEFT JOIN countries AS ${alias} ON ${alias}.currency_code = ${currencyColumn}`;

/**
 * Knex-style helper (kept for compatibility if needed later).
 */
const joinCountry = (q, fkColumn, alias = 'c') =>
  q.leftJoin(`countries as ${alias}`, `${alias}.id`, fkColumn);

/**
 * Resolve currency for a row, with a sensible fallback chain:
 *   row.currency_code  →  fallback.code  →  'SAR'
 */
const resolveCurrency = (row, fallback = { code: 'SAR', symbol: 'ر.س' }) => ({
  code:   row?.currency_code   || fallback.code,
  symbol: row?.currency_symbol || fallback.symbol,
});

/**
 * Serializer — flattens currency fields into a clean shape
 * for frontend consumption. Use in route mappers:
 *
 *   const out = rows.map(r => ({ ...r, ...withCurrency(r) }));
 */
const withCurrency = (row) => ({
  currency_code:      row.currency_code   || 'SAR',
  currency_symbol:    row.currency_symbol || 'ر.س',
  currency_symbol_en: row.currency_symbol_en || row.currency_code || 'SAR',
  country: row.country_id ? {
    id:      row.country_id,
    code:    row.country_code,
    name_ar: row.country_name_ar,
    name_en: row.country_name_en,
  } : null,
});

module.exports = {
  currencyFields,
  joinCountrySql,
  joinCountryByCodeSql,
  joinCountry,
  resolveCurrency,
  withCurrency,
};
