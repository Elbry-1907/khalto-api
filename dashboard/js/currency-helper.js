/* ═══════════════════════════════════════════════════════════
   Currency Helper
   Centralized currency formatting for the dashboard
   ═══════════════════════════════════════════════════════════ */

window.Currency = {

  // Default fallback (in case no currency info available)
  DEFAULT_SYMBOL: 'ر.س',
  DEFAULT_CODE: 'SAR',

  // Cache of countries (loaded once)
  _cache: null,

  /**
   * Load all countries into cache
   */
  async loadCountries() {
    if (this._cache) return this._cache;
    try {
      const { countries } = await API.countries.list({ active_only: 'true' });
      this._cache = {};
      (countries || []).forEach(c => {
        this._cache[c.id] = c;
        if (c.code) this._cache[c.code] = c;
      });
      return this._cache;
    } catch (err) {
      console.warn('Currency: failed to load countries', err);
      this._cache = {};
      return this._cache;
    }
  },

  /**
   * Format an amount with the appropriate currency symbol.
   * 
   * @param {number|string} amount - The numeric amount
   * @param {object|string} currencyOrCountry - Either:
   *   - { currency_symbol, currency_code } object (e.g. courier/kitchen entity)
   *   - country_id (UUID string)
   *   - country_code (e.g. 'SA')
   *   - currency_code directly (e.g. 'SAR')
   * @param {object} options - { decimals: 0, showCode: false }
   */
  format(amount, currencyOrCountry, options = {}) {
    const num = Number(amount || 0);
    const decimals = options.decimals != null ? options.decimals : 0;
    const formatted = num.toFixed(decimals);

    let symbol = this.DEFAULT_SYMBOL;
    let code = this.DEFAULT_CODE;

    if (currencyOrCountry) {
      // Object with currency info
      if (typeof currencyOrCountry === 'object') {
        symbol = currencyOrCountry.currency_symbol || symbol;
        code = currencyOrCountry.currency_code || code;
      }
      // String — try to find in cache
      else if (typeof currencyOrCountry === 'string' && this._cache) {
        const c = this._cache[currencyOrCountry];
        if (c) {
          symbol = c.currency_symbol || symbol;
          code = c.currency_code || code;
        } else {
          // Maybe it's a currency code directly
          const upper = currencyOrCountry.toUpperCase();
          if (upper === 'SAR') { symbol = 'ر.س'; code = 'SAR'; }
          else if (upper === 'EGP') { symbol = 'ج.م'; code = 'EGP'; }
          else if (upper === 'AED') { symbol = 'د.إ'; code = 'AED'; }
          else if (upper === 'USD') { symbol = '$'; code = 'USD'; }
        }
      }
    }

    return options.showCode 
      ? `${formatted} ${symbol} (${code})` 
      : `${formatted} ${symbol}`;
  },

  /**
   * Get just the symbol for a country/currency
   */
  symbolFor(currencyOrCountry) {
    if (!currencyOrCountry) return this.DEFAULT_SYMBOL;
    if (typeof currencyOrCountry === 'object') {
      return currencyOrCountry.currency_symbol || this.DEFAULT_SYMBOL;
    }
    if (this._cache && this._cache[currencyOrCountry]) {
      return this._cache[currencyOrCountry].currency_symbol || this.DEFAULT_SYMBOL;
    }
    const upper = currencyOrCountry.toUpperCase();
    if (upper === 'SAR') return 'ر.س';
    if (upper === 'EGP') return 'ج.م';
    if (upper === 'AED') return 'د.إ';
    return this.DEFAULT_SYMBOL;
  },

  /**
   * Render a country selector dropdown HTML
   */
  countrySelector(selectedId, fieldId = 'country-select') {
    if (!this._cache) return `<select id="${fieldId}"><option value="">— تحميل... —</option></select>`;
    const countries = Object.values(this._cache).filter(c => c.id);
    // Deduplicate (since cache has both id and code keys)
    const unique = [...new Map(countries.map(c => [c.id, c])).values()];
    return `
      <select id="${fieldId}">
        <option value="">— اختر دولة —</option>
        ${unique.map(c => `
          <option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>
            ${c.name_ar} (${c.currency_symbol})
          </option>
        `).join('')}
      </select>
    `;
  },

};

// Auto-load countries on page load
if (typeof API !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Currency.loadCountries(), 500);
  });
}
