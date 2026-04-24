/* ═══════════════════════════════════════════════════════════
   Page: Countries & Cities
   ═══════════════════════════════════════════════════════════ */

Router.register('countries', {

  async render(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div id="countries-stats"></div>
        <div class="flex gap-2">
          <button class="btn btn-secondary" id="seed-btn">🌱 إضافة SA + EG</button>
          <button class="btn btn-primary" id="add-country-btn">+ إضافة دولة</button>
        </div>
      </div>
      <div id="countries-list">${Utils.loadingHTML()}</div>
    `;

    document.getElementById('add-country-btn').onclick = () => this.showAdd();
    document.getElementById('seed-btn').onclick = () => this.seedDefaults();

    await this.load();
  },

  async load() {
    const list = document.getElementById('countries-list');
    const stats = document.getElementById('countries-stats');
    if (!list) return;

    try {
      const { countries } = await API.countries.list();

      const activeCount = countries.filter(c => c.is_active).length;
      stats.innerHTML = `
        <div class="text-muted">
          ${countries.length} دولة • ${activeCount} نشطة
        </div>
      `;

      if (!countries || countries.length === 0) {
        list.innerHTML = Utils.emptyHTML(
          'لا توجد دول',
          'اضغط "إضافة SA + EG" للبدء بالإعدادات الافتراضية',
          '🌍'
        );
        return;
      }

      list.innerHTML = countries.map(c => `
        <div class="card" style="padding:16px;">
          <div class="flex justify-between items-center mb-2">
            <div class="flex items-center gap-3">
              <div style="font-size:28px;">${c.code === 'SA' ? '🇸🇦' : c.code === 'EG' ? '🇪🇬' : '🌍'}</div>
              <div>
                <div class="text-bold text-lg">${Utils.escape(c.name_ar)}</div>
                <div class="text-sm text-muted">${Utils.escape(c.name_en)} • ${c.code}</div>
              </div>
            </div>
            <div class="flex gap-2">
              <span class="badge ${c.is_active ? 'badge-success' : 'badge-gray'}">${c.is_active ? 'نشط' : 'موقوف'}</span>
              <button class="btn btn-sm btn-secondary" data-toggle="${c.id}" data-active="${c.is_active}">
                ${c.is_active ? '⏸️ إيقاف' : '▶️ تفعيل'}
              </button>
              <button class="btn btn-sm btn-secondary" data-edit="${c.id}">✏️</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);">
            <div><div class="text-sm text-muted">العملة</div><div class="text-bold">${c.currency} ${c.currency_symbol}</div></div>
            <div><div class="text-sm text-muted">العمولة</div><div class="text-bold">${c.platform_commission_pct}%</div></div>
            <div><div class="text-sm text-muted">الضريبة</div><div class="text-bold">${c.tax_rate}%</div></div>
            <div><div class="text-sm text-muted">حد أدنى</div><div class="text-bold">${Utils.currency(c.min_order_amount, c.currency)}</div></div>
            <div><div class="text-sm text-muted">بوابة الدفع</div><div class="text-bold">${c.payment_gateway}</div></div>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await API.countries.toggle(btn.dataset.toggle);
            Utils.success('تم التحديث');
            this.load();
          } catch (err) { Utils.error(err.message); }
        };
      });

      list.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => this.showEdit(btn.dataset.edit);
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
      this.load();
    } catch (err) { Utils.error(err.message); }
  },

  showAdd(existing = null) {
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
        if (existing) {
          await API.countries.update(existing.id, data);
        } else {
          await API.countries.create(data);
        }
        Utils.success('تم الحفظ');
        close();
        this.load();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

  async showEdit(id) {
    try {
      const { country } = await API.countries.get(id);
      this.showAdd(country);
    } catch (err) {
      Utils.error(err.message);
    }
  },

});
