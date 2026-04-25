/* ═══════════════════════════════════════════════════════════════════
   Khalto Dashboard — Country Switcher
   ───────────────────────────────────────────────────────────────────
   Provides a global country filter that:
   - Loads all active countries on app startup
   - Persists selection in localStorage
   - Exposes window.CountrySwitcher.getSelectedId() for pages to use
   - Triggers a 'country-changed' event for pages to react
   ═══════════════════════════════════════════════════════════════════ */

window.CountrySwitcher = {

  STORAGE_KEY: 'khalto_selected_country_id',

  countries: [],
  selectedId: null,

  /**
   * Initialize: load countries + restore selection from localStorage
   * Call this AFTER login (when API.countries.list works)
   */
  async init() {
    try {
      const { countries } = await API.countries.list({ active_only: 'true' });
      this.countries = countries || [];

      // Restore selection from localStorage
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored && this.countries.find(c => c.id === stored)) {
        this.selectedId = stored;
      } else {
        this.selectedId = null; // "All countries"
      }

      this.render();
    } catch (err) {
      console.warn('CountrySwitcher: failed to init', err);
    }
  },

  /**
   * Get the currently selected country ID
   * Returns null if "All countries" is selected
   */
  getSelectedId() {
    return this.selectedId;
  },

  /**
   * Get the selected country object (or null)
   */
  getSelectedCountry() {
    return this.countries.find(c => c.id === this.selectedId) || null;
  },

  /**
   * Helper: returns query params object with country_id (if any)
   * Use in API calls: API.adminCouriers.list({ ...CountrySwitcher.params(), page: 1 })
   */
  params() {
    return this.selectedId ? { country_id: this.selectedId } : {};
  },

  /**
   * Change the selected country
   */
  setSelected(countryId) {
    this.selectedId = countryId || null;
    if (countryId) {
      localStorage.setItem(this.STORAGE_KEY, countryId);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    this.render();
    // Notify pages
    window.dispatchEvent(new CustomEvent('country-changed', {
      detail: { countryId: this.selectedId }
    }));
  },

  /**
   * Render the switcher UI in the sidebar
   */
  render() {
    const container = document.getElementById('country-switcher');
    if (!container) return;

    const selected = this.getSelectedCountry();
    const flag = selected
      ? (selected.code === 'SA' ? '🇸🇦' : selected.code === 'EG' ? '🇪🇬' : selected.code === 'AE' ? '🇦🇪' : '🌍')
      : '🌍';

    container.innerHTML = `
      <div style="position:relative;">
        <button id="country-switcher-btn" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;">
          <span style="font-size:18px;">${flag}</span>
          <span style="flex:1;text-align:right;">${selected ? Utils.escape(selected.name_ar) : 'كل الدول'}</span>
          <span style="opacity:0.6;">▾</span>
        </button>
        <div id="country-switcher-menu" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
          <div data-country-pick="" style="padding:10px 12px;cursor:pointer;color:#fff;font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,0.05);${!this.selectedId ? 'background:rgba(232,96,60,0.2);' : ''}">
            <span style="font-size:16px;">🌍</span>
            <span>كل الدول</span>
          </div>
          ${this.countries.map(c => {
            const cflag = c.code === 'SA' ? '🇸🇦' : c.code === 'EG' ? '🇪🇬' : c.code === 'AE' ? '🇦🇪' : '🌍';
            return `
              <div data-country-pick="${c.id}" style="padding:10px 12px;cursor:pointer;color:#fff;font-size:13px;display:flex;align-items:center;gap:8px;${this.selectedId === c.id ? 'background:rgba(232,96,60,0.2);' : ''}">
                <span style="font-size:16px;">${cflag}</span>
                <span>${Utils.escape(c.name_ar)}</span>
                <span style="margin-right:auto;opacity:0.5;font-size:11px;">${c.code}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Wire button toggle
    const btn = document.getElementById('country-switcher-btn');
    const menu = document.getElementById('country-switcher-menu');

    btn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };

    // Click outside closes menu
    document.addEventListener('click', () => { menu.style.display = 'none'; }, { once: true });

    // Wire picks
    container.querySelectorAll('[data-country-pick]').forEach(el => {
      el.onmouseenter = () => { el.style.opacity = '0.85'; };
      el.onmouseleave = () => { el.style.opacity = '1'; };
      el.onclick = (e) => {
        e.stopPropagation();
        const id = el.dataset.countryPick || null;
        this.setSelected(id);
        menu.style.display = 'none';
      };
    });
  },
};
