// ═══════════════════════════════════════════════════════════
// src/utils/currency-join.js
// ─────────────────────────────────────────────────────────────
// Reusable helpers to attach country/currency data to admin
// list endpoints. Keeps every admin route consistent.
// ═══════════════════════════════════════════════════════════

/**
 * Standard SELECT fields to add when joining countries table.
 * Use as: knex.select(...currencyFields('c'))
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
 * Apply LEFT JOIN to countries.
 * @param {KnexQueryBuilder} q  — the query builder
 * @param {string} fkColumn     — foreign-key column on the parent (e.g. 'kitchens.country_id')
 * @param {string} alias        — table alias for countries (default 'c')
 */
const joinCountry = (q, fkColumn, alias = 'c') =>
  q.leftJoin(`countries as ${alias}`, `${alias}.id`, fkColumn);

/**
 * Resolve currency for a row, with a sensible fallback chain:
 *   row.currency_code  →  default country's currency  →  'SAR'
 * Used when row was created before currency was tracked.
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
  joinCountry,
  resolveCurrency,
  withCurrency,
};
