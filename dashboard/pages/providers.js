/* ═══════════════════════════════════════════════════════════
   Page: Service Providers (Premium)
   Full management UI for SMS / WhatsApp / Email / Payments
   ═══════════════════════════════════════════════════════════ */

Router.register('providers', {

  state: {
    activeTab: 'sms',
    providers: { sms: [], whatsapp: [], email: [], payment: [] },
    expandedProviderId: null,
    countries: [],
    mappings: [],
    webhooks: {},
  },

  // ── ENTRY POINT ───────────────────────────────────────
  async render(container) {
    container.innerHTML = `
      <div class="providers-page">
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div id="providers-tab-content">${Utils.loadingHTML()}</div>
      </div>
    `;
    this.injectStyles();
    this.attachTabHandlers();
    await this.loadAll();
  },

  // ── Initial bulk load ─────────────────────────────────
  async loadAll() {
    try {
      const [providersRes, mappingsRes, webhooksRes, countriesRes] = await Promise.allSettled([
        API.providers.list(),
        API.providers.countryMapping(),
        API.providers.webhooks(),
        API.countries.list({ active_only: 'true' }),
      ]);

      this.state.providers = providersRes.value?.providers || { sms: [], whatsapp: [], email: [], payment: [] };
      this.state.mappings = mappingsRes.value?.mappings || [];
      this.state.webhooks = webhooksRes.value?.webhooks || {};
      this.state.countries = countriesRes.value?.countries || [];

      this.renderTabContent();
    } catch (err) {
      document.getElementById('providers-tab-content').innerHTML = Utils.errorHTML(err.message);
    }
  },

  // ── HEADER ────────────────────────────────────────────
  renderHeader() {
    const counts = {
      sms: this.countActive('sms'),
      whatsapp: this.countActive('whatsapp'),
      email: this.countActive('email'),
      payment: this.countActive('payment'),
    };
    return `
      <div class="card" style="background:linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%); color:white; border:none;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <h2 style="font-size:20px; margin-bottom:6px;">🔌 إدارة مزودي الخدمة</h2>
            <p style="font-size:13px; opacity:0.8;">تحكم في مزودي SMS و WhatsApp والبريد الإلكتروني وبوابات الدفع — كل دولة بإعداداتها المستقلة</p>
          </div>
          <div style="display:flex; gap:24px; flex-wrap:wrap;">
            <div><div style="font-size:11px; opacity:0.7;">SMS نشط</div><div style="font-size:18px; font-weight:700;">${counts.sms}</div></div>
            <div><div style="font-size:11px; opacity:0.7;">WhatsApp</div><div style="font-size:18px; font-weight:700;">${counts.whatsapp}</div></div>
            <div><div style="font-size:11px; opacity:0.7;">Email</div><div style="font-size:18px; font-weight:700;">${counts.email}</div></div>
            <div><div style="font-size:11px; opacity:0.7;">Payment</div><div style="font-size:18px; font-weight:700;">${counts.payment}</div></div>
          </div>
        </div>
      </div>
    `;
  },

  // ── TABS ──────────────────────────────────────────────
  renderTabs() {
    const tabs = [
      { id: 'sms', icon: '📱', label: 'SMS' },
      { id: 'whatsapp', icon: '💬', label: 'WhatsApp' },
      { id: 'email', icon: '📧', label: 'Email' },
      { id: 'payment', icon: '💳', label: 'بوابات الدفع' },
      { id: 'mapping', icon: '🌍', label: 'ربط الدول' },
    ];
    return `
      <div class="provider-tabs">
        ${tabs.map(t => `
          <button class="provider-tab ${t.id === this.state.activeTab ? 'active' : ''}" data-tab="${t.id}">
            <span style="margin-left:6px;">${t.icon}</span>${t.label}
          </button>
        `).join('')}
      </div>
    `;
  },

  attachTabHandlers() {
    document.querySelectorAll('.provider-tab').forEach(btn => {
      btn.onclick = () => {
        this.state.activeTab = btn.dataset.tab;
        this.state.expandedProviderId = null;
        document.querySelectorAll('.provider-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.state.activeTab));
        this.renderTabContent();
      };
    });
  },

  // ── TAB CONTENT ───────────────────────────────────────
  renderTabContent() {
    const wrap = document.getElementById('providers-tab-content');
    if (!wrap) return;

    if (this.state.activeTab === 'mapping') {
      wrap.innerHTML = this.renderMappingTab();
      this.attachMappingHandlers();
      return;
    }

    const list = this.state.providers[this.state.activeTab] || [];
    if (list.length === 0) {
      wrap.innerHTML = Utils.emptyHTML('لا يوجد مزودين', 'هتظهر هنا بعد ما تتسجّل في الـ DB', '🔌');
      return;
    }

    wrap.innerHTML = `
      <div class="providers-grid">
        ${list.map(p => this.renderProviderCard(p)).join('')}
      </div>
      ${this.state.activeTab === 'payment' ? this.renderWebhookCard() : ''}
      ${this.renderTestPanel()}
    `;
    this.attachProviderHandlers();
  },

  // ── PROVIDER CARD ─────────────────────────────────────
  renderProviderCard(p) {
    const schemaKey = `${p.service_type}.${p.provider_key}`;
    const schema = ProviderSchemas[schemaKey] || { icon: '?', color: '#888', fields: [] };
    const isExpanded = this.state.expandedProviderId === p.id;
    const statusClass = p.is_active ? 'active' : (p.is_configured ? 'configured' : 'unconfigured');
    const statusLabel = p.is_active ? 'نشط ✅' : (p.is_configured ? 'مُعدّ' : 'غير مُعدّ');
    const statusBadgeClass = p.is_active ? 'badge-success' : (p.is_configured ? 'badge-info' : 'badge-gray');

    return `
      <div class="provider-card ${statusClass} ${isExpanded ? 'expanded' : ''}" data-provider-id="${p.id}">
        <div class="provider-header" data-toggle-id="${p.id}">
          <div class="provider-logo" style="background:${schema.color};">${schema.icon}</div>
          <div class="provider-meta">
            <div class="provider-name">${Utils.escape(p.display_name_ar || p.display_name_en)}</div>
            <div class="provider-desc">${Utils.escape(p.description_ar || '')}</div>
          </div>
          <div class="provider-status">
            <span class="badge ${statusBadgeClass}">${statusLabel}</span>
            ${p.last_tested_at ? `<span class="text-sm text-muted" style="margin-right:8px;">اختبار: ${Utils.timeAgo(p.last_tested_at)}</span>` : ''}
          </div>
          <div class="provider-toggle">${isExpanded ? '▲' : '▼'}</div>
        </div>
        ${isExpanded ? this.renderProviderConfig(p, schema) : ''}
      </div>
    `;
  },

  // ── PROVIDER CONFIG (expanded) ────────────────────────
  renderProviderConfig(p, schema) {
    const config = p.config || {};

    if (schema.fields.length === 0) {
      // No-config providers like Cash
      return `
        <div class="provider-config">
          ${schema.note ? `<div class="provider-note">${schema.note}</div>` : ''}
          <div class="provider-actions">
            ${p.is_active
              ? `<button class="btn btn-secondary" data-deactivate="${p.id}">⏸️ تعطيل</button>`
              : `<button class="btn btn-success" data-activate="${p.id}">▶️ تفعيل مباشر</button>`}
          </div>
        </div>
      `;
    }

    const webhookUrl = schema.showWebhook ? this.state.webhooks[schema.showWebhook] : null;

    return `
      <div class="provider-config">
        ${schema.note ? `<div class="provider-note">⚠️ ${schema.note}</div>` : ''}

        ${webhookUrl ? `
          <div class="webhook-box">
            <div class="text-sm text-muted" style="margin-bottom:4px;">🔗 Webhook URL:</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <code class="webhook-url">${webhookUrl}</code>
              <button class="btn btn-sm btn-secondary" data-copy="${webhookUrl}">نسخ</button>
            </div>
          </div>
        ` : ''}

        <div class="config-grid">
          ${schema.fields.map(f => this.renderField(f, config[f.key], p.id)).join('')}
        </div>

        ${p.last_test_result ? `
          <div class="test-result ${p.status === 'tested_ok' ? 'test-ok' : 'test-fail'}">
            <strong>${p.status === 'tested_ok' ? '✅' : '❌'} آخر اختبار:</strong> ${Utils.escape(p.last_test_result)}
          </div>
        ` : ''}

        <div class="provider-actions">
          <button class="btn btn-primary" data-save="${p.id}">💾 حفظ الإعدادات</button>
          <button class="btn btn-secondary" data-test="${p.id}" data-service="${p.service_type}">🧪 اختبار</button>
          ${p.is_configured && !p.is_active ? `<button class="btn btn-success" data-activate="${p.id}">▶️ تفعيل</button>` : ''}
          ${p.is_active ? `<button class="btn btn-secondary" data-deactivate="${p.id}">⏸️ تعطيل</button>` : ''}
          <button class="btn btn-secondary" data-logs="${p.id}" style="margin-right:auto;">📋 السجلات</button>
        </div>
      </div>
    `;
  },

  renderField(field, value, providerId) {
    const id = `field-${providerId}-${field.key}`;
    const reqMark = field.required ? '<span style="color:var(--danger);">*</span>' : '';
    const placeholder = field.placeholder || '';
    const safeValue = value != null ? Utils.escape(String(value)) : '';

    if (field.type === 'select') {
      return `
        <div class="form-group">
          <label>${field.label} ${reqMark}</label>
          <select id="${id}" data-field-key="${field.key}">
            ${(field.options || []).map(o =>
              `<option value="${o.v}" ${value === o.v ? 'selected' : ''}>${o.l}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }

    return `
      <div class="form-group">
        <label>${field.label} ${reqMark}</label>
        <input type="${field.type}" id="${id}" data-field-key="${field.key}"
               placeholder="${placeholder}" value="${safeValue}"
               ${field.type === 'password' ? 'autocomplete="new-password"' : ''}>
      </div>
    `;
  },

  // ── ATTACH HANDLERS ───────────────────────────────────
  attachProviderHandlers() {
    // Toggle expand/collapse
    document.querySelectorAll('[data-toggle-id]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.toggleId;
        this.state.expandedProviderId = this.state.expandedProviderId === id ? null : id;
        this.renderTabContent();
      };
    });

    // Save
    document.querySelectorAll('[data-save]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this.saveProvider(btn.dataset.save); };
    });

    // Test
    document.querySelectorAll('[data-test]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this.testProvider(btn.dataset.test, btn.dataset.service); };
    });

    // Activate
    document.querySelectorAll('[data-activate]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this.activateProvider(btn.dataset.activate); };
    });

    // Deactivate
    document.querySelectorAll('[data-deactivate]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this.deactivateProvider(btn.dataset.deactivate); };
    });

    // Copy
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.copy);
        Utils.success('تم النسخ');
      };
    });

    // Logs
    document.querySelectorAll('[data-logs]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); this.showLogs(btn.dataset.logs); };
    });
  },

  // ── ACTIONS ───────────────────────────────────────────
  async saveProvider(providerId) {
    const provider = this.findProvider(providerId);
    if (!provider) return;
    const schemaKey = `${provider.service_type}.${provider.provider_key}`;
    const schema = ProviderSchemas[schemaKey];
    if (!schema) return;

    const config = {};
    schema.fields.forEach(f => {
      const el = document.getElementById(`field-${providerId}-${f.key}`);
      if (el) config[f.key] = el.value;
    });

    // Validate required fields
    for (const f of schema.fields) {
      if (f.required && !config[f.key]) {
        Utils.error(`الحقل "${f.label}" مطلوب`);
        return;
      }
    }

    try {
      const result = await API.providers.update(providerId, config);
      Utils.success('تم حفظ الإعدادات');
      // Update local state
      const updated = result.provider;
      const list = this.state.providers[provider.service_type];
      const idx = list.findIndex(p => p.id === providerId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updated, config };
      }
      this.renderTabContent();
    } catch (err) {
      Utils.error(err.message);
    }
  },

  async testProvider(providerId, serviceType) {
    const provider = this.findProvider(providerId);
    if (!provider) return;

    let payload = {};
    if (serviceType === 'sms' || serviceType === 'whatsapp') {
      const phone = await this.promptInput(
        serviceType === 'sms' ? '📱 اختبار SMS' : '💬 اختبار WhatsApp',
        'رقم الهاتف للاختبار',
        '+966500000001'
      );
      if (!phone) return;
      payload = { recipient: phone };
    } else if (serviceType === 'email') {
      const email = await this.promptInput('📧 اختبار Email', 'البريد الإلكتروني للاختبار', 'test@example.com');
      if (!email) return;
      payload = { recipient: email };
    }

    Utils.info ? Utils.info('جاري الاختبار...') : Utils.toast('جاري الاختبار...', 'info');

    try {
      const result = await API.providers.test(providerId, payload);
      if (result.ok || result.success) {
        Utils.success(result.message || 'تم الاختبار بنجاح');
      } else {
        Utils.error(result.message || result.error || 'فشل الاختبار');
      }
      // Refresh to show updated last_test_result
      await this.loadAll();
    } catch (err) {
      Utils.error(err.message);
    }
  },

  async activateProvider(providerId) {
    try {
      await API.providers.activate(providerId);
      Utils.success('تم التفعيل');
      await this.loadAll();
    } catch (err) { Utils.error(err.message); }
  },

  async deactivateProvider(providerId) {
    try {
      await API.providers.deactivate(providerId);
      Utils.success('تم التعطيل');
      await this.loadAll();
    } catch (err) { Utils.error(err.message); }
  },

  async showLogs(providerId) {
    try {
      const { logs } = await API.providers.testLogs(providerId);
      const provider = this.findProvider(providerId);

      const rowsHtml = (logs || []).length > 0 ? logs.map(l => `
        <tr>
          <td>${l.success ? '✅' : '❌'}</td>
          <td>${Utils.escape(l.test_type || '—')}</td>
          <td>${Utils.escape(l.recipient || '—')}</td>
          <td class="text-sm">${Utils.escape(l.response_message || '—')}</td>
          <td class="text-sm text-muted">${Utils.timeAgo(l.created_at)}</td>
        </tr>
      `).join('') : `<tr><td colspan="5" class="text-center text-muted">لا توجد سجلات</td></tr>`;

      Utils.modal({
        title: `📋 سجل اختبارات ${provider?.display_name_ar || provider?.display_name_en}`,
        size: 'modal-lg',
        body: `
          <table class="table">
            <thead>
              <tr><th></th><th>النوع</th><th>المستلم</th><th>النتيجة</th><th>الوقت</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        `,
        footer: `<button class="btn btn-secondary" data-modal-close>إغلاق</button>`,
      });
      document.querySelector('[data-modal-close]').onclick = () => {
        document.getElementById('modal-container').innerHTML = '';
      };
    } catch (err) { Utils.error(err.message); }
  },

  // ── TEST PANEL (per-tab quick test) ───────────────────
  renderTestPanel() {
    if (this.state.activeTab === 'payment') return '';
    return ''; // Tests are per-provider via the test button. Quick panel removed for cleanliness.
  },

  // ── WEBHOOK CARD (payment tab) ────────────────────────
  renderWebhookCard() {
    if (!this.state.webhooks.tap && !this.state.webhooks.paymob) return '';
    return `
      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <div class="card-title">🔗 Webhook URLs</div>
        </div>
        <p class="text-sm text-muted" style="margin-bottom:12px;">انسخ هذه الروابط في إعدادات بوابة الدفع لاستقبال الإشعارات</p>
        ${this.state.webhooks.tap ? `
          <div class="webhook-box">
            <div class="text-sm" style="margin-bottom:4px;"><strong>Tap Payments:</strong></div>
            <div style="display:flex; gap:8px; align-items:center;">
              <code class="webhook-url">${this.state.webhooks.tap}</code>
              <button class="btn btn-sm btn-secondary" data-copy="${this.state.webhooks.tap}">نسخ</button>
            </div>
          </div>
        ` : ''}
        ${this.state.webhooks.paymob ? `
          <div class="webhook-box" style="margin-top:10px;">
            <div class="text-sm" style="margin-bottom:4px;"><strong>Paymob:</strong></div>
            <div style="display:flex; gap:8px; align-items:center;">
              <code class="webhook-url">${this.state.webhooks.paymob}</code>
              <button class="btn btn-sm btn-secondary" data-copy="${this.state.webhooks.paymob}">نسخ</button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  // ── COUNTRY MAPPING TAB ───────────────────────────────
  renderMappingTab() {
    if (this.state.countries.length === 0) {
      return Utils.emptyHTML('لا توجد دول نشطة', 'روح لصفحة "الدول والمدن" أولاً وضيف SA + EG', '🌍');
    }

    const services = ['sms', 'whatsapp', 'email', 'payment'];
    const serviceLabels = { sms: '📱 SMS', whatsapp: '💬 WhatsApp', email: '📧 Email', payment: '💳 الدفع' };

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🌍 ربط المزودين بالدول</div>
        </div>
        <p class="text-sm text-muted" style="margin-bottom:16px;">حدد المزود النشط لكل خدمة في كل دولة. لو لم يتم التحديد، يُستخدم المزود النشط عالمياً.</p>

        ${this.state.countries.map(country => `
          <div class="mapping-country">
            <div class="mapping-country-header">
              <span style="font-size:24px;">${country.code === 'SA' ? '🇸🇦' : country.code === 'EG' ? '🇪🇬' : '🌍'}</span>
              <strong>${Utils.escape(country.name_ar)}</strong>
              <span class="text-sm text-muted">(${country.code})</span>
            </div>
            <div class="mapping-grid">
              ${services.map(svc => this.renderMappingRow(country, svc, serviceLabels[svc])).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderMappingRow(country, service, label) {
    const list = this.state.providers[service] || [];
    const configured = list.filter(p => p.is_configured);
    const currentMapping = this.state.mappings.find(m => m.country_id === country.id && m.service_type === service);
    const cashCheckbox = service === 'payment' ? `
      <label style="display:flex; align-items:center; gap:6px; font-size:12px; margin-right:auto;">
        <input type="checkbox" data-cash="${country.id}" ${currentMapping?.cash_on_delivery ? 'checked' : ''}>
        كاش عند التسليم
      </label>
    ` : '';

    return `
      <div class="mapping-row">
        <span class="mapping-label">${label}</span>
        <select data-mapping-country="${country.id}" data-mapping-service="${service}">
          <option value="">— استخدم النشط عالمياً —</option>
          ${configured.map(p => `
            <option value="${p.id}" ${currentMapping?.provider_id === p.id ? 'selected' : ''}>
              ${Utils.escape(p.display_name_en)} ${p.is_active ? '⭐' : ''}
            </option>
          `).join('')}
        </select>
        ${cashCheckbox}
      </div>
    `;
  },

  attachMappingHandlers() {
    document.querySelectorAll('[data-mapping-country]').forEach(sel => {
      sel.onchange = async () => {
        const country_id = sel.dataset.mappingCountry;
        const service_type = sel.dataset.mappingService;
        const provider_id = sel.value || null;
        const cashEl = document.querySelector(`[data-cash="${country_id}"]`);
        const cash_on_delivery = cashEl ? cashEl.checked : false;

        try {
          await API.providers.setCountryMapping({ country_id, service_type, provider_id, cash_on_delivery });
          Utils.success('تم الحفظ');
          await this.loadAll();
        } catch (err) { Utils.error(err.message); }
      };
    });

    document.querySelectorAll('[data-cash]').forEach(cb => {
      cb.onchange = async () => {
        const country_id = cb.dataset.cash;
        try {
          await API.providers.setCountryMapping({
            country_id, service_type: 'payment', cash_on_delivery: cb.checked,
          });
          Utils.success('تم تحديث إعدادات الكاش');
        } catch (err) { Utils.error(err.message); cb.checked = !cb.checked; }
      };
    });
  },

  // ── HELPERS ───────────────────────────────────────────
  countActive(serviceType) {
    return (this.state.providers[serviceType] || []).filter(p => p.is_active).length;
  },

  findProvider(id) {
    for (const list of Object.values(this.state.providers)) {
      const p = list.find(x => x.id === id);
      if (p) return p;
    }
    return null;
  },

  promptInput(title, label, defaultValue = '') {
    return new Promise((resolve) => {
      const body = `
        <div class="form-group">
          <label>${label}</label>
          <input type="text" id="prompt-input" value="${Utils.escape(defaultValue)}" autofocus>
        </div>
      `;
      const footer = `
        <button class="btn btn-secondary" data-cancel-prompt>إلغاء</button>
        <button class="btn btn-primary" data-confirm-prompt>تأكيد</button>
      `;
      Utils.modal({ title, body, footer });
      const close = () => { document.getElementById('modal-container').innerHTML = ''; };
      document.querySelector('[data-cancel-prompt]').onclick = () => { close(); resolve(null); };
      document.querySelector('[data-confirm-prompt]').onclick = () => {
        const val = document.getElementById('prompt-input').value.trim();
        close(); resolve(val);
      };
      const inp = document.getElementById('prompt-input');
      if (inp) {
        inp.focus();
        inp.onkeydown = (e) => {
          if (e.key === 'Enter') { document.querySelector('[data-confirm-prompt]').click(); }
        };
      }
    });
  },

  // ── INJECT STYLES (one-time) ──────────────────────────
  injectStyles() {
    if (document.getElementById('providers-page-styles')) return;
    const style = document.createElement('style');
    style.id = 'providers-page-styles';
    style.textContent = `
      .providers-page { padding: 0; }

      /* Tabs */
      .provider-tabs {
        display: flex; gap: 4px;
        background: var(--bg-white);
        padding: 6px;
        border-radius: var(--radius-lg);
        margin-bottom: 20px;
        border: 1px solid var(--border);
        overflow-x: auto;
      }
      .provider-tab {
        flex: 1;
        padding: 10px 14px;
        text-align: center;
        border-radius: var(--radius);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        color: var(--text-muted);
        transition: all 0.15s;
        border: none;
        background: transparent;
        font-family: var(--font);
        white-space: nowrap;
      }
      .provider-tab:hover { color: var(--text); background: var(--bg-hover); }
      .provider-tab.active { background: var(--coral); color: white; }

      /* Provider Cards */
      .providers-grid {
        display: grid;
        gap: 12px;
      }
      .provider-card {
        background: var(--bg-white);
        border: 1.5px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: all 0.2s;
      }
      .provider-card.active { border-color: var(--coral); box-shadow: 0 0 0 3px rgba(232, 96, 60, 0.1); }
      .provider-card.expanded { box-shadow: var(--shadow-md); }

      .provider-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 18px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .provider-header:hover { background: var(--bg-hover); }

      .provider-logo {
        width: 44px; height: 44px;
        border-radius: var(--radius);
        display: flex; align-items: center; justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 13px;
        flex-shrink: 0;
      }

      .provider-meta { flex: 1; min-width: 0; }
      .provider-name { font-size: 15px; font-weight: 700; }
      .provider-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
      .provider-status { display: flex; align-items: center; gap: 6px; }
      .provider-toggle { font-size: 12px; color: var(--text-muted); }

      .provider-config {
        padding: 16px 18px;
        background: var(--bg);
        border-top: 1px solid var(--border);
        animation: slideDown 0.2s;
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .provider-note {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: var(--radius);
        padding: 10px 14px;
        font-size: 13px;
        margin-bottom: 14px;
        color: #92400E;
      }

      .config-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }

      .webhook-box {
        background: var(--bg-white);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .webhook-url {
        flex: 1;
        background: var(--bg);
        padding: 6px 10px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 12px;
        direction: ltr;
        word-break: break-all;
      }

      .test-result {
        padding: 10px 14px;
        border-radius: var(--radius);
        font-size: 13px;
        margin-bottom: 12px;
      }
      .test-ok { background: var(--success-bg); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.2); }
      .test-fail { background: var(--danger-bg); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.2); }

      .provider-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* Mapping tab */
      .mapping-country {
        background: var(--bg);
        border-radius: var(--radius-lg);
        padding: 14px;
        margin-bottom: 12px;
      }
      .mapping-country-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--border);
      }
      .mapping-grid {
        display: grid;
        gap: 10px;
      }
      .mapping-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mapping-label {
        min-width: 110px;
        font-size: 13px;
        font-weight: 600;
      }
      .mapping-row select {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-family: var(--font);
        font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  },

});
