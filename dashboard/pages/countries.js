/* ═══════════════════════════════════════════════════════════
   Page: Countries & Cities (with Tabs)
   ═══════════════════════════════════════════════════════════ */

Router.register('countries', {

  state: {
    activeTab: 'countries', // 'countries' or 'cities'
    countriesCache: [],
    citiesCache: [],
  },

  async render(container) {
    container.innerHTML = `
      <div class="tabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid var(--border-light);">
        <button class="tab-btn ${this.state.activeTab === 'countries' ? 'active' : ''}" data-tab="countries"
                style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-muted);border-bottom:3px solid transparent;margin-bottom:-2px;">
          🌍 الدول
        </button>
        <button class="tab-btn ${this.state.activeTab === 'cities' ? 'active' : ''}" data-tab="cities"
                style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-muted);border-bottom:3px solid transparent;margin-bottom:-2px;">
          🏙️ المدن
        </button>
      </div>

      <style>
        .tab-btn.active {
          color: var(--coral, #E8603C) !important;
          border-bottom-color: var(--coral, #E8603C) !important;
        }
        .tab-btn:hover { color: var(--text); }
      </style>

      <div id="tab-content"></div>
    `;

    // Wire tabs
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        this.state.activeTab = btn.dataset.tab;
        this.render(container);
      };
    });

    // Render the active tab content
    if (this.state.activeTab === 'countries') {
      await this.renderCountriesTab();
    } else {
      await this.renderCitiesTab();
    }
  },

  // ═══════════════════════════════════════════════════════════
  // COUNTRIES TAB
  // ═══════════════════════════════════════════════════════════
  async renderCountriesTab() {
    const tabContent = document.getElementById('tab-content');
    tabContent.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div id="countries-stats"></div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="seed-btn">🌱 إضافة SA + EG</button>
          <button class="btn btn-primary" id="add-country-btn">+ إضافة دولة</button>
        </div>
      </div>
      <div id="countries-list">${Utils.loadingHTML()}</div>
    `;

    document.getElementById('add-country-btn').onclick = () => this.showAddCountry();
    document.getElementById('seed-btn').onclick = () => this.seedDefaults();

    await this.loadCountries();
  },

  async loadCountries() {
    const list = document.getElementById('countries-list');
    const stats = document.getElementById('countries-stats');
    if (!list) return;

    try {
      const { countries } = await API.countries.list();
      this.state.countriesCache = countries;

      const activeCount = countries.filter(c => c.is_active).length;
      stats.innerHTML = `
        <div class="text-muted">${countries.length} دولة • ${activeCount} نشطة</div>
      `;

      if (!countries || countries.length === 0) {
        list.innerHTML = Utils.emptyHTML('لا توجد دول', 'اضغط "إضافة SA + EG" للبدء بالإعدادات الافتراضية', '🌍');
        return;
      }

      list.innerHTML = countries.map(c => `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div class="flex justify-between items-center mb-2">
            <div class="flex items-center gap-3">
              <div style="font-size:28px;">${c.code === 'SA' ? '🇸🇦' : c.code === 'EG' ? '🇪🇬' : c.code === 'AE' ? '🇦🇪' : '🌍'}</div>
              <div>
                <div class="text-bold text-lg">${Utils.escape(c.name_ar)}</div>
                <div class="text-sm text-muted">${Utils.escape(c.name_en)} • ${c.code}</div>
              </div>
            </div>
            <div class="flex gap-2">
              <span class="badge ${c.is_active ? 'badge-success' : 'badge-gray'}">${c.is_active ? 'نشط' : 'موقوف'}</span>
              <button class="btn btn-sm btn-secondary" data-toggle="${c.id}">${c.is_active ? '⏸️ إيقاف' : '▶️ تفعيل'}</button>
              <button class="btn btn-sm btn-secondary" data-edit="${c.id}">✏️</button>
              <button class="btn btn-sm btn-secondary" data-cities="${c.id}" title="عرض المدن">🏙️ المدن</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);">
            <div><div class="text-sm text-muted">العملة</div><div class="text-bold">${c.currency} ${c.currency_symbol || ''}</div></div>
            <div><div class="text-sm text-muted">العمولة</div><div class="text-bold">${c.platform_commission_pct}%</div></div>
            <div><div class="text-sm text-muted">الضريبة</div><div class="text-bold">${c.tax_rate}%</div></div>
            <div><div class="text-sm text-muted">حد أدنى</div><div class="text-bold">${Utils.currency(c.min_order_amount, c)}</div></div>
            <div><div class="text-sm text-muted">بوابة الدفع</div><div class="text-bold">${c.payment_gateway}</div></div>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await API.countries.toggle(btn.dataset.toggle);
            Utils.success('تم التحديث');
            this.loadCountries();
          } catch (err) { Utils.error(err.message); }
        };
      });

      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => this.showEditCountry(btn.dataset.edit);
      });

      list.querySelectorAll('[data-cities]').forEach(btn => {
        btn.onclick = () => {
          this.state.citiesFilterCountryId = btn.dataset.cities;
          this.state.activeTab = 'cities';
          this.render(document.getElementById('page-content'));
        };
      });

    } catch (err) {
      list.innerHTML = Utils.errorHTML(err.message);
    }
  },

  async seedDefaults() {
    const confirmed = await Utils.confirm('هل تريد إضافة السعودية ومصر بالإعدادات الافتراضية؟');
    if (!confirmed) return;
    try {
      await API.countries.seedDefaults();
      Utils.success('تم الإضافة');
      this.loadCountries();
    } catch (err) { Utils.error(err.message); }
  },

  showAddCountry(existing = null) {
    const c = existing || {};
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>الاسم (عربي) *</label>
          <input type="text" id="c-name-ar" value="${Utils.escape(c.name_ar || '')}">
        </div>
        <div class="form-group">
          <label>الاسم (إنجليزي)</label>
          <input type="text" id="c-name-en" value="${Utils.escape(c.name_en || '')}">
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>الرمز (ISO) *</label>
          <input type="text" id="c-code" value="${Utils.escape(c.code || '')}" placeholder="SA" maxlength="2" style="text-transform:uppercase;" ${existing ? 'disabled' : ''}>
        </div>
        <div class="form-group">
          <label>كود الهاتف</label>
          <input type="text" id="c-phone" value="${Utils.escape(c.phone_code || '')}" placeholder="+966">
        </div>
        <div class="form-group">
          <label>العملة *</label>
          <input type="text" id="c-currency" value="${Utils.escape(c.currency || '')}" placeholder="SAR" maxlength="3" style="text-transform:uppercase;">
        </div>
      </div>
      <div class="form-row-3 mt-2">
        <div class="form-group">
          <label>رمز العملة</label>
          <input type="text" id="c-symbol" value="${Utils.escape(c.currency_symbol || '')}" placeholder="ر.س">
        </div>
        <div class="form-group">
          <label>اللغة الافتراضية</label>
          <select id="c-lang">
            <option value="ar" ${c.default_language === 'ar' ? 'selected' : ''}>العربية</option>
            <option value="en" ${c.default_language === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
        <div class="form-group">
          <label>بوابة الدفع</label>
          <select id="c-gateway">
            <option value="tap" ${c.payment_gateway === 'tap' ? 'selected' : ''}>Tap Payments</option>
            <option value="paymob" ${c.payment_gateway === 'paymob' ? 'selected' : ''}>Paymob</option>
          </select>
        </div>
      </div>
      <h4 class="mt-4 mb-2" style="font-size:14px;">الإعدادات المالية</h4>
      <div class="form-row-3">
        <div class="form-group">
          <label>عمولة المنصة %</label>
          <input type="number" id="c-commission" value="${c.platform_commission_pct || 15}" step="0.1">
        </div>
        <div class="form-group">
          <label>ضريبة VAT %</label>
          <input type="number" id="c-tax" value="${c.tax_rate || 15}" step="0.1">
        </div>
        <div class="form-group">
          <label>نسبة الشيف %</label>
          <input type="number" id="c-chef-pct" value="${c.chef_payout_pct || 85}" step="0.1">
        </div>
      </div>
      <h4 class="mt-4 mb-2" style="font-size:14px;">التوصيل</h4>
      <div class="form-row-3">
        <div class="form-group">
          <label>رسوم أساسية</label>
          <input type="number" id="c-delivery-base" value="${c.delivery_fee_base || 8}" step="0.01">
        </div>
        <div class="form-group">
          <label>رسوم لكل كم</label>
          <input type="number" id="c-delivery-km" value="${c.delivery_fee_per_km || 1}" step="0.01">
        </div>
        <div class="form-group">
          <label>حد أدنى للطلب</label>
          <input type="number" id="c-min-order" value="${c.min_order_amount || 30}" step="0.01">
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="save-country">💾 حفظ</button>
    `;

    const { close } = Utils.modal({
      title: existing ? `✏️ تعديل: ${c.name_ar}` : '🌍 إضافة دولة جديدة',
      body, footer, size: 'modal-xl',
    });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('save-country').onclick = async () => {
      const btn = document.getElementById('save-country');
      const data = {
        name_ar: document.getElementById('c-name-ar').value.trim(),
        name_en: document.getElementById('c-name-en').value.trim(),
        code: document.getElementById('c-code').value.trim().toUpperCase(),
        currency: document.getElementById('c-currency').value.trim().toUpperCase(),
        currency_symbol: document.getElementById('c-symbol').value.trim(),
        phone_code: document.getElementById('c-phone').value.trim(),
        default_language: document.getElementById('c-lang').value,
        payment_gateway: document.getElementById('c-gateway').value,
        platform_commission_pct: parseFloat(document.getElementById('c-commission').value) || 15,
        tax_rate: parseFloat(document.getElementById('c-tax').value) || 0,
        chef_payout_pct: parseFloat(document.getElementById('c-chef-pct').value) || 85,
        delivery_fee_base: parseFloat(document.getElementById('c-delivery-base').value) || 0,
        delivery_fee_per_km: parseFloat(document.getElementById('c-delivery-km').value) || 0,
        min_order_amount: parseFloat(document.getElementById('c-min-order').value) || 0,
      };

      if (!data.name_ar || !data.code || !data.currency) {
        Utils.error('الاسم والرمز والعملة مطلوبين');
        return;
      }

      btn.disabled = true;
      try {
        if (existing) await API.countries.update(existing.id, data);
        else await API.countries.create(data);
        Utils.success('تم الحفظ');
        close();
        this.loadCountries();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

  async showEditCountry(id) {
    try {
      const { country } = await API.countries.get(id);
      this.showAddCountry(country);
    } catch (err) { Utils.error(err.message); }
  },

  // ═══════════════════════════════════════════════════════════
  // CITIES TAB
  // ═══════════════════════════════════════════════════════════
  async renderCitiesTab() {
    const tabContent = document.getElementById('tab-content');
    tabContent.innerHTML = `
      <div class="flex justify-between items-center mb-4 gap-3" style="flex-wrap:wrap;">
        <div class="flex gap-2 items-center" style="flex-wrap:wrap;">
          <select id="city-country-filter" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);min-width:200px;">
            <option value="">— كل الدول —</option>
          </select>
          <div id="cities-stats" class="text-muted"></div>
        </div>
        <button class="btn btn-primary" id="add-city-btn">+ إضافة مدينة</button>
      </div>
      <div id="cities-list">${Utils.loadingHTML()}</div>
    `;

    // Load countries for dropdown
    if (this.state.countriesCache.length === 0) {
      try {
        const { countries } = await API.countries.list();
        this.state.countriesCache = countries;
      } catch (err) {}
    }

    const filterSelect = document.getElementById('city-country-filter');
    this.state.countriesCache.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name_ar} (${c.code})`;
      if (this.state.citiesFilterCountryId === c.id) opt.selected = true;
      filterSelect.appendChild(opt);
    });

    filterSelect.onchange = () => {
      this.state.citiesFilterCountryId = filterSelect.value || null;
      this.loadCities();
    };

    document.getElementById('add-city-btn').onclick = () => this.showAddCity();

    await this.loadCities();
  },

  async loadCities() {
    const list = document.getElementById('cities-list');
    const stats = document.getElementById('cities-stats');
    if (!list) return;

    try {
      const params = {};
      if (this.state.citiesFilterCountryId) params.country_id = this.state.citiesFilterCountryId;

      const { cities } = await API.cities.listAll(params);
      this.state.citiesCache = cities;

      const activeCount = cities.filter(c => c.is_active).length;
      stats.innerHTML = `${cities.length} مدينة • ${activeCount} نشطة`;

      if (!cities || cities.length === 0) {
        list.innerHTML = Utils.emptyHTML('لا توجد مدن', 'اضغط "إضافة مدينة" لبدء إضافة المدن', '🏙️');
        return;
      }

      list.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>المدينة</th>
                <th>الدولة</th>
                <th>الموقع</th>
                <th>رسوم خاصة</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${cities.map(c => `
                <tr>
                  <td><strong>${Utils.escape(c.name_ar)}</strong>${c.name_en ? `<br><small class="text-muted">${Utils.escape(c.name_en)}</small>` : ''}</td>
                  <td>${Utils.escape(c.country_name || '—')} <span class="text-muted text-sm">${c.country_code || ''}</span></td>
                  <td class="text-sm text-muted">${c.lat && c.lng ? `${parseFloat(c.lat).toFixed(3)}, ${parseFloat(c.lng).toFixed(3)}` : '—'}</td>
                  <td>${c.delivery_fee_override != null ? Utils.currency(c.delivery_fee_override, c) : '<span class="text-muted">افتراضي</span>'}</td>
                  <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-gray'}">${c.is_active ? 'نشطة' : 'موقوفة'}</span></td>
                  <td class="row-actions">
                    <button class="btn btn-sm btn-secondary" data-toggle-city="${c.id}">${c.is_active ? '⏸️' : '▶️'}</button>
                    <button class="btn btn-sm btn-secondary" data-edit-city='${JSON.stringify(c).replace(/'/g, '&#39;')}'>✏️</button>
                    <button class="btn btn-sm btn-danger" data-delete-city="${c.id}" data-name="${Utils.escape(c.name_ar)}">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      list.querySelectorAll('[data-toggle-city]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await API.cities.toggle(btn.dataset.toggleCity);
            Utils.success('تم التحديث');
            this.loadCities();
          } catch (err) { Utils.error(err.message); }
        };
      });

      list.querySelectorAll('[data-edit-city]').forEach(btn => {
        btn.onclick = () => {
          const city = JSON.parse(btn.dataset.editCity.replace(/&#39;/g, "'"));
          this.showAddCity(city);
        };
      });

      list.querySelectorAll('[data-delete-city]').forEach(btn => {
        btn.onclick = async () => {
          const ok = await Utils.confirm(`حذف مدينة "${btn.dataset.name}"؟ لا يمكن التراجع.`, { danger: true });
          if (!ok) return;
          try {
            await API.cities.delete(btn.dataset.deleteCity);
            Utils.success('تم الحذف');
            this.loadCities();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      list.innerHTML = Utils.errorHTML(err.message);
    }
  },

  showAddCity(existing = null) {
    const ci = existing || {};

    // Build country options
    const countryOptions = this.state.countriesCache.map(c =>
      `<option value="${c.id}" ${ci.country_id === c.id ? 'selected' : ''}>${c.name_ar} (${c.code})</option>`
    ).join('');

    const body = `
      <div class="form-group">
        <label>الدولة *</label>
        <select id="ci-country" ${existing ? 'disabled' : ''}>
          <option value="">— اختر —</option>
          ${countryOptions}
        </select>
      </div>
      <div class="form-row mt-2">
        <div class="form-group">
          <label>الاسم (عربي) *</label>
          <input type="text" id="ci-name-ar" value="${Utils.escape(ci.name_ar || '')}" placeholder="الرياض">
        </div>
        <div class="form-group">
          <label>الاسم (إنجليزي)</label>
          <input type="text" id="ci-name-en" value="${Utils.escape(ci.name_en || '')}" placeholder="Riyadh">
        </div>
      </div>
      <div class="form-row-3 mt-2">
        <div class="form-group">
          <label>خط العرض (Lat)</label>
          <input type="number" id="ci-lat" value="${ci.lat || ''}" step="0.000001" placeholder="24.7136">
        </div>
        <div class="form-group">
          <label>خط الطول (Lng)</label>
          <input type="number" id="ci-lng" value="${ci.lng || ''}" step="0.000001" placeholder="46.6753">
        </div>
        <div class="form-group">
          <label>رسوم توصيل خاصة</label>
          <input type="number" id="ci-fee" value="${ci.delivery_fee_override || ''}" step="0.01" placeholder="افتراضي">
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="save-city">💾 حفظ</button>
    `;

    const { close } = Utils.modal({
      title: existing ? `✏️ تعديل: ${ci.name_ar}` : '🏙️ إضافة مدينة جديدة',
      body, footer,
    });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('save-city').onclick = async () => {
      const btn = document.getElementById('save-city');
      const country_id = document.getElementById('ci-country').value;
      const name_ar = document.getElementById('ci-name-ar').value.trim();

      if (!country_id || !name_ar) {
        Utils.error('الدولة واسم المدينة مطلوبين');
        return;
      }

      const data = {
        name_ar,
        name_en: document.getElementById('ci-name-en').value.trim(),
        lat: parseFloat(document.getElementById('ci-lat').value) || null,
        lng: parseFloat(document.getElementById('ci-lng').value) || null,
        delivery_fee_override: parseFloat(document.getElementById('ci-fee').value) || null,
      };

      btn.disabled = true;
      try {
        if (existing) {
          await API.cities.update(existing.id, data);
        } else {
          await API.cities.create(country_id, data);
        }
        Utils.success('تم الحفظ');
        close();
        this.loadCities();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

});
