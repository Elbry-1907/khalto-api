/* ═══════════════════════════════════════════════════════════
   Page: Admin Kitchens Management
   Full CRUD + lifecycle for kitchens
   ═══════════════════════════════════════════════════════════ */

Router.register('admin-kitchens', {

  state: {
    activeTab: 'all',        // all | pending_review | active | paused | suspended | rejected
    page: 1,
    limit: 20,
    search: '',
    countryFilter: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    kitchens: [],
    total: 0,
    stats: null,
    countries: [],
    selectedKitchen: null,    // for modal
    detailTab: 'info',        // info | stats | orders | log
  },

  // ── ENTRY ─────────────────────────────────────────────
  async render(container) {
    container.innerHTML = `
      <div class="ak-page">
        ${this.renderHeader()}
        ${this.renderTabs()}
        ${this.renderToolbar()}
        <div id="ak-table-container">${Utils.loadingHTML()}</div>
      </div>
    `;
    this.injectStyles();
    this.attachStaticHandlers();
    await this.loadStats();
    await this.loadCountries();
    await this.loadKitchens();
  },

  // ── DATA LOADING ─────────────────────────────────────
  async loadStats() {
    try {
      this.state.stats = await API.adminKitchens.stats();
      this.updateHeader();
    } catch (err) { /* silent */ }
  },

  async loadCountries() {
    try {
      const { countries } = await API.countries.list({ active_only: 'true' });
      this.state.countries = countries || [];
    } catch (err) { /* silent */ }
  },

  async loadKitchens() {
    const wrap = document.getElementById('ak-table-container');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const params = {
        page: this.state.page,
        limit: this.state.limit,
        sort_by: this.state.sortBy,
        sort_dir: this.state.sortDir,
      };
      if (this.state.activeTab !== 'all') params.status = this.state.activeTab;
      if (this.state.search) params.search = this.state.search;
      if (this.state.countryFilter) params.country_id = this.state.countryFilter;

      const result = await API.adminKitchens.list(params);
      this.state.kitchens = result.kitchens || [];
      this.state.total = result.total || 0;

      this.renderTable();
    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  // ── HEADER ───────────────────────────────────────────
  renderHeader() {
    return `
      <div class="card" style="background:linear-gradient(135deg, var(--coral) 0%, #C04F2D 100%); color:white; border:none; margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <h2 style="font-size:20px; margin-bottom:4px;">🍳 إدارة المطابخ</h2>
            <p style="font-size:13px; opacity:0.9;">موافقة، تعليق، تعديل، وإحصائيات لكل المطابخ</p>
          </div>
          <button class="btn" id="ak-add-btn" style="background:white; color:var(--coral); font-weight:700;">+ إضافة مطبخ يدوياً</button>
        </div>
        <div id="ak-header-stats" style="display:flex; gap:24px; flex-wrap:wrap; margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.15);">
          <div><div style="font-size:11px; opacity:0.8;">الإجمالي</div><div style="font-size:18px; font-weight:700;">—</div></div>
        </div>
      </div>
    `;
  },

  updateHeader() {
    const stats = this.state.stats;
    if (!stats) return;
    const wrap = document.getElementById('ak-header-stats');
    if (!wrap) return;
    wrap.innerHTML = `
      <div><div style="font-size:11px; opacity:0.8;">الإجمالي</div><div style="font-size:18px; font-weight:700;">${stats.total}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">قيد المراجعة</div><div style="font-size:18px; font-weight:700;">${stats.pending_review}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">نشط</div><div style="font-size:18px; font-weight:700;">${stats.active}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">متوقف</div><div style="font-size:18px; font-weight:700;">${stats.paused}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">معلّق</div><div style="font-size:18px; font-weight:700;">${stats.suspended}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">مرفوض</div><div style="font-size:18px; font-weight:700;">${stats.rejected}</div></div>
    `;
  },

  // ── TABS ─────────────────────────────────────────────
  renderTabs() {
    const tabs = [
      { id: 'all',             icon: '📋', label: 'الكل' },
      { id: 'pending_review',  icon: '⏳', label: 'قيد المراجعة' },
      { id: 'active',          icon: '✅', label: 'نشط' },
      { id: 'paused',          icon: '⏸️', label: 'متوقف' },
      { id: 'suspended',       icon: '🚫', label: 'معلّق' },
      { id: 'rejected',        icon: '❌', label: 'مرفوض' },
    ];
    return `
      <div class="ak-tabs">
        ${tabs.map(t => {
          const count = t.id === 'all' ? (this.state.stats?.total ?? '') : (this.state.stats?.[t.id] ?? '');
          return `<button class="ak-tab ${t.id === this.state.activeTab ? 'active' : ''}" data-tab="${t.id}">
            <span style="margin-left:6px;">${t.icon}</span>${t.label}
            ${count !== '' ? `<span class="ak-tab-count">${count}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    `;
  },

  // ── TOOLBAR (search + filters) ───────────────────────
  renderToolbar() {
    return `
      <div class="ak-toolbar">
        <input type="text" id="ak-search" placeholder="🔍 بحث بالاسم أو الهاتف..." value="${Utils.escape(this.state.search)}">
        <select id="ak-country-filter">
          <option value="">كل الدول</option>
          ${(this.state.countries || []).map(c => `<option value="${c.id}" ${c.id === this.state.countryFilter ? 'selected' : ''}>${Utils.escape(c.name_ar)}</option>`).join('')}
        </select>
        <select id="ak-sort">
          <option value="created_at:desc">الأحدث أولاً</option>
          <option value="created_at:asc">الأقدم أولاً</option>
          <option value="rating:desc">الأعلى تقييماً</option>
          <option value="name_ar:asc">الاسم (أ-ي)</option>
        </select>
        <button class="btn btn-secondary" id="ak-refresh">🔄 تحديث</button>
      </div>
    `;
  },

  // ── TABLE ────────────────────────────────────────────
  renderTable() {
    const wrap = document.getElementById('ak-table-container');
    if (!wrap) return;

    if (this.state.kitchens.length === 0) {
      wrap.innerHTML = Utils.emptyHTML('لا توجد مطابخ', 'هتظهر هنا لما يسجّل أول طاهي', '🍳');
      return;
    }

    const rows = this.state.kitchens.map(k => this.renderRow(k)).join('');
    const totalPages = Math.ceil(this.state.total / this.state.limit) || 1;

    wrap.innerHTML = `
      <div class="card" style="padding:0;">
        <table class="table ak-table">
          <thead>
            <tr>
              <th>المطبخ</th>
              <th>المالك</th>
              <th>الموقع</th>
              <th>الحالة</th>
              <th>التقييم</th>
              <th>العمولة</th>
              <th>التاريخ</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="ak-pagination">
        <button class="btn btn-sm btn-secondary" data-page-prev ${this.state.page <= 1 ? 'disabled' : ''}>← السابق</button>
        <span class="text-sm text-muted">صفحة ${this.state.page} من ${totalPages} (${this.state.total} مطبخ)</span>
        <button class="btn btn-sm btn-secondary" data-page-next ${this.state.page >= totalPages ? 'disabled' : ''}>التالي →</button>
      </div>
    `;

    this.attachRowHandlers();
  },

  renderRow(k) {
    const statusClass = `status-${k.status}`;
    const statusLabel = {
      pending_review: 'قيد المراجعة',
      active: 'نشط',
      paused: 'متوقف',
      suspended: 'معلّق',
      rejected: 'مرفوض',
    }[k.status] || k.status;

    const rating = Number(k.rating || 0).toFixed(1);
    const ratingStars = '⭐'.repeat(Math.round(Number(k.rating || 0))) || '—';

    return `
      <tr class="ak-row" data-id="${k.id}">
        <td>
          <div class="ak-kitchen-cell">
            <div class="ak-avatar" ${k.logo_url ? `style="background-image:url('${Utils.escape(k.logo_url)}')"` : ''}>
              ${!k.logo_url ? '🍳' : ''}
            </div>
            <div>
              <div style="font-weight:600;">${Utils.escape(k.name_ar)}</div>
              <div class="text-sm text-muted">${Utils.escape(k.name_en || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <div>${Utils.escape(k.owner_name || '—')}</div>
          <div class="text-sm text-muted">${Utils.escape(k.owner_phone || '')}</div>
        </td>
        <td>
          <div>${Utils.escape(k.city_name || '—')}</div>
          <div class="text-sm text-muted">${Utils.escape(k.country_code || '')}</div>
        </td>
        <td><span class="badge ${statusClass}">${statusLabel}</span>${k.blocked_at ? '<br><span class="badge status-blocked" style="margin-top:3px;">🚫 محظور</span>' : ''}</td>
        <td>
          <div title="${rating}">${ratingStars}</div>
          <div class="text-sm text-muted">${k.rating_count || 0} تقييم</div>
        </td>
        <td>${Number(k.commission_pct || 0)}%</td>
        <td class="text-sm text-muted">${Utils.timeAgo(k.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-primary" data-view="${k.id}">عرض</button>
        </td>
      </tr>
    `;
  },

  // ── HANDLERS ─────────────────────────────────────────
  attachStaticHandlers() {
    // Add button
    document.getElementById('ak-add-btn').onclick = () => this.openCreateModal();

    // Tabs
    document.querySelectorAll('.ak-tab').forEach(btn => {
      btn.onclick = () => {
        this.state.activeTab = btn.dataset.tab;
        this.state.page = 1;
        document.querySelectorAll('.ak-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.state.activeTab));
        this.loadKitchens();
      };
    });

    // Search (debounced)
    let searchTimer;
    document.getElementById('ak-search').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.state.search = e.target.value.trim();
        this.state.page = 1;
        this.loadKitchens();
      }, 350);
    };

    // Country filter
    document.getElementById('ak-country-filter').onchange = (e) => {
      this.state.countryFilter = e.target.value;
      this.state.page = 1;
      this.loadKitchens();
    };

    // Sort
    document.getElementById('ak-sort').onchange = (e) => {
      const [by, dir] = e.target.value.split(':');
      this.state.sortBy = by;
      this.state.sortDir = dir;
      this.loadKitchens();
    };

    // Refresh
    document.getElementById('ak-refresh').onclick = () => {
      this.loadStats();
      this.loadKitchens();
    };
  },

  attachRowHandlers() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.onclick = () => this.openDetailModal(btn.dataset.view);
    });

    document.querySelectorAll('[data-page-prev]').forEach(b => {
      b.onclick = () => { if (this.state.page > 1) { this.state.page--; this.loadKitchens(); } };
    });
    document.querySelectorAll('[data-page-next]').forEach(b => {
      b.onclick = () => {
        const totalPages = Math.ceil(this.state.total / this.state.limit) || 1;
        if (this.state.page < totalPages) { this.state.page++; this.loadKitchens(); }
      };
    });
  },

  // ── DETAIL MODAL ─────────────────────────────────────
  async openDetailModal(kitchenId) {
    this.state.detailTab = 'info';
    Utils.modal({
      title: '🍳 تفاصيل المطبخ',
      size: 'modal-xl',
      body: Utils.loadingHTML(),
      footer: '',
    });

    try {
      const { kitchen } = await API.adminKitchens.get(kitchenId);
      this.state.selectedKitchen = kitchen;
      this.renderDetailModal();
    } catch (err) {
      const body = document.querySelector('.modal-body');
      if (body) body.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDetailModal() {
    const k = this.state.selectedKitchen;
    if (!k) return;

    const body = document.querySelector('.modal-body');
    const footer = document.querySelector('.modal-footer');
    if (!body) return;

    body.innerHTML = `
      <div class="ak-detail">
        ${this.renderDetailHeader(k)}
        <div class="ak-detail-tabs">
          <button class="ak-detail-tab ${this.state.detailTab === 'info' ? 'active' : ''}" data-detail-tab="info">📋 المعلومات</button>
          <button class="ak-detail-tab ${this.state.detailTab === 'stats' ? 'active' : ''}" data-detail-tab="stats">📊 الإحصائيات</button>
          <button class="ak-detail-tab ${this.state.detailTab === 'orders' ? 'active' : ''}" data-detail-tab="orders">📋 الطلبات</button>
          <button class="ak-detail-tab ${this.state.detailTab === 'documents' ? 'active' : ''}" data-detail-tab="documents">📷 المستندات</button>
          <button class="ak-detail-tab ${this.state.detailTab === 'log' ? 'active' : ''}" data-detail-tab="log">📜 السجل</button>
        </div>
        <div id="ak-detail-content">${this.renderDetailContent()}</div>
      </div>
    `;

    if (footer) footer.innerHTML = this.renderDetailFooter(k);

    this.attachDetailHandlers();
  },

  renderDetailHeader(k) {
    const statusLabel = {
      pending_review: 'قيد المراجعة',
      active: 'نشط',
      paused: 'متوقف',
      suspended: 'معلّق',
      rejected: 'مرفوض',
    }[k.status] || k.status;

    return `
      <div class="ak-detail-header">
        <div class="ak-avatar-lg" ${k.logo_url ? `style="background-image:url('${Utils.escape(k.logo_url)}')"` : ''}>
          ${!k.logo_url ? '🍳' : ''}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:18px; font-weight:700;">${Utils.escape(k.name_ar)}</div>
          <div class="text-sm text-muted">${Utils.escape(k.name_en || '')}</div>
          <div style="margin-top:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="badge status-${k.status}">${statusLabel}</span>
            <span class="text-sm">⭐ ${Number(k.rating || 0).toFixed(1)} (${k.rating_count || 0})</span>
            <span class="text-sm text-muted">عمولة: ${Number(k.commission_pct || 0)}%</span>
          </div>
        </div>
      </div>
    `;
  },

  renderDetailContent() {
    if (this.state.detailTab === 'info')      return this.renderInfoTab();
    if (this.state.detailTab === 'stats')     return this.renderStatsTab();
    if (this.state.detailTab === 'orders')    return this.renderOrdersTab();
    if (this.state.detailTab === 'documents') return this.renderDocumentsTab();
    if (this.state.detailTab === 'log')       return this.renderLogTab();
    return '';
  },

  renderInfoTab() {
    const k = this.state.selectedKitchen;
    return `
      <div class="ak-info-grid">
        <div class="ak-info-section">
          <div class="ak-info-title">🧑‍🍳 معلومات المالك</div>
          <div class="ak-info-row"><span>الاسم:</span><strong>${Utils.escape(k.owner_name || '—')}</strong></div>
          <div class="ak-info-row"><span>الهاتف:</span><strong>${Utils.escape(k.owner_phone || '—')}</strong></div>
          <div class="ak-info-row"><span>الإيميل:</span><strong>${Utils.escape(k.owner_email || '—')}</strong></div>
        </div>

        <div class="ak-info-section">
          <div class="ak-info-title">📍 الموقع</div>
          <div class="ak-info-row"><span>الدولة:</span><strong>${Utils.escape(k.country_name || '—')}</strong></div>
          <div class="ak-info-row"><span>المدينة:</span><strong>${Utils.escape(k.city_name || '—')}</strong></div>
          <div class="ak-info-row"><span>الإحداثيات:</span><strong>${k.lat || '—'}, ${k.lng || '—'}</strong></div>
          <div class="ak-info-row"><span>نطاق التوصيل:</span><strong>${k.delivery_radius_km || 0} كم</strong></div>
        </div>

        <div class="ak-info-section">
          <div class="ak-info-title">💰 الإعدادات المالية</div>
          <div class="ak-info-row"><span>العمولة:</span><strong>${Number(k.commission_pct || 0)}%</strong></div>
          <div class="ak-info-row"><span>الحد الأدنى:</span><strong>${Currency.format(k.min_order_amount || 0, k)}</strong></div>
          <div class="ak-info-row"><span>السجل التجاري:</span><strong>${Utils.escape(k.commercial_register || '—')}</strong></div>
          <div class="ak-info-row"><span>الرقم الضريبي:</span><strong>${Utils.escape(k.tax_number || '—')}</strong></div>
          <div class="ak-info-row"><span>IBAN:</span><strong style="direction:ltr; text-align:left;">${Utils.escape(k.bank_account_iban || '—')}</strong></div>
        </div>

        <div class="ak-info-section">
          <div class="ak-info-title">⚙️ الحالة</div>
          ${k.approved_at ? `<div class="ak-info-row"><span>تمت الموافقة:</span><strong>${Utils.timeAgo(k.approved_at)}</strong></div>` : ''}
          ${k.approved_by_name ? `<div class="ak-info-row"><span>وافق:</span><strong>${Utils.escape(k.approved_by_name)}</strong></div>` : ''}
          ${k.rejection_reason ? `<div class="ak-info-row"><span>سبب الرفض:</span><strong>${Utils.escape(k.rejection_reason)}</strong></div>` : ''}
          ${k.suspension_reason ? `<div class="ak-info-row"><span>سبب التعليق:</span><strong>${Utils.escape(k.suspension_reason)}</strong></div>` : ''}
          <div class="ak-info-row"><span>تاريخ التسجيل:</span><strong>${Utils.timeAgo(k.created_at)}</strong></div>
        </div>

        ${k.bio_ar ? `
          <div class="ak-info-section" style="grid-column: 1 / -1;">
            <div class="ak-info-title">📝 نبذة</div>
            <p>${Utils.escape(k.bio_ar)}</p>
            ${k.bio_en ? `<p class="text-sm text-muted">${Utils.escape(k.bio_en)}</p>` : ''}
          </div>
        ` : ''}

        ${k.admin_notes ? `
          <div class="ak-info-section" style="grid-column: 1 / -1; background:#FFF7E6;">
            <div class="ak-info-title">📌 ملاحظات الإدارة</div>
            <p>${Utils.escape(k.admin_notes)}</p>
          </div>
        ` : ''}
      </div>

      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-edit-kitchen="${k.id}">✏️ تعديل البيانات</button>
        <button class="btn btn-secondary" data-edit-commission="${k.id}">💰 تعديل العمولة</button>
      </div>

      <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <div class="ak-info-title" style="margin-bottom:10px;">👤 إدارة حساب المستخدم</div>
        ${k.blocked_at ? `
          <div style="background:#FED7D7; padding:10px; border-radius:6px; margin-bottom:10px; font-size:13px;">
            <strong>🚫 المستخدم محظور</strong>
            ${k.blocked_reason ? `<br><span class="text-sm">السبب: ${Utils.escape(k.blocked_reason)}</span>` : ''}
          </div>
          ${this.renderUnblockButton ? this.renderUnblockButton(k.user_id, k.owner_name) : ''}
        ` : (this.renderUserActions ? this.renderUserActions(k.user_id, k.owner_name) : '')}
      </div>
    `;
  },

  renderStatsTab() {
    return `<div id="ak-stats-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailStats() {
    try {
      const { overall, daily } = await API.adminKitchens.kitchenStats(this.state.selectedKitchen.id, { period: 30 });
      const wrap = document.getElementById('ak-stats-loading');
      if (!wrap) return;
      wrap.innerHTML = `
        <div class="ak-stats-grid">
          <div class="ak-stat-card"><div class="ak-stat-label">عدد الطلبات</div><div class="ak-stat-value">${overall?.orders_count || 0}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">المُسلَّمة</div><div class="ak-stat-value">${overall?.delivered || 0}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">الملغية</div><div class="ak-stat-value">${overall?.cancelled || 0}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">الإيرادات</div><div class="ak-stat-value">${Currency.format(overall?.gross_revenue || 0, this.state.selectedKitchen)}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">عمولة المنصة</div><div class="ak-stat-value">${Currency.format(overall?.platform_commission || 0, this.state.selectedKitchen)}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">صافي الطاهي</div><div class="ak-stat-value">${Currency.format(overall?.net_payout || 0, this.state.selectedKitchen)}</div></div>
          <div class="ak-stat-card"><div class="ak-stat-label">متوسط الطلب</div><div class="ak-stat-value">${Currency.format(overall?.avg_order_value || 0, this.state.selectedKitchen)}</div></div>
        </div>
        <p class="text-sm text-muted" style="margin-top:14px;">آخر 30 يوم</p>
        ${daily && daily.length > 0 ? `
          <div style="margin-top:16px;">
            <div class="ak-info-title">آخر الأيام</div>
            <table class="table">
              <thead><tr><th>التاريخ</th><th>الطلبات</th><th>الإيرادات</th></tr></thead>
              <tbody>
                ${daily.slice(-7).reverse().map(d => `
                  <tr><td>${new Date(d.date).toLocaleDateString('ar-SA')}</td>
                  <td>${d.orders}</td><td>${Currency.format(d.revenue, this.state.selectedKitchen)}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="text-sm text-muted" style="margin-top:14px;">لا توجد طلبات بعد</p>`}
      `;
    } catch (err) {
      const wrap = document.getElementById('ak-stats-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderOrdersTab() {
    return `<div id="ak-orders-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailOrders() {
    try {
      const { orders, total } = await API.adminKitchens.orders(this.state.selectedKitchen.id, { limit: 20 });
      const wrap = document.getElementById('ak-orders-loading');
      if (!wrap) return;
      if (!orders || orders.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد طلبات', '', '📋');
        return;
      }
      wrap.innerHTML = `
        <p class="text-sm text-muted" style="margin-bottom:10px;">إجمالي ${total} طلب — يعرض أحدث ${orders.length}</p>
        <table class="table">
          <thead><tr><th>العميل</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td>${Utils.escape(o.customer_name || '—')}<br><span class="text-sm text-muted">${Utils.escape(o.customer_phone || '')}</span></td>
                <td><span class="badge order-${o.status}">${o.status}</span></td>
                <td><strong>${Currency.format(o.total_amount || 0, this.state.selectedKitchen)}</strong></td>
                <td class="text-sm text-muted">${Utils.timeAgo(o.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      const wrap = document.getElementById('ak-orders-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDocumentsTab() {
    return `<div id="ak-documents-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailDocuments() {
    try {
      const { documents } = await API.adminKitchens.documents(this.state.selectedKitchen.id);
      const wrap = document.getElementById('ak-documents-loading');
      if (!wrap) return;
      if (!documents || documents.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد مستندات', '', '📷');
        return;
      }
      wrap.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px; margin-top:12px;">
          ${documents.map(d => `
            <div style="border:1px solid var(--border); border-radius:6px; overflow:hidden; cursor:pointer;" onclick="window.open('${Utils.escape(d.file_url || '')}', '_blank')">
              <img src="${Utils.escape(d.file_url || '')}" style="width:100%; height:120px; object-fit:cover; background:#f0f0f0;" alt="${Utils.escape(d.document_type || '')}">
              <div style="padding:8px; font-size:12px; text-align:center;">
                <div class="text-sm">${Utils.escape(d.document_type || 'مستند')}</div>
                <div class="text-xs text-muted">${Utils.timeAgo(d.uploaded_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      const wrap = document.getElementById('ak-documents-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderLogTab() {
    return `<div id="ak-log-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailLog() {
    try {
      const { logs } = await API.adminKitchens.statusLog(this.state.selectedKitchen.id);
      const wrap = document.getElementById('ak-log-loading');
      if (!wrap) return;
      if (!logs || logs.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا يوجد سجل', '', '📜');
        return;
      }
      wrap.innerHTML = `
        <div class="ak-timeline">
          ${logs.map(l => `
            <div class="ak-timeline-item">
              <div class="ak-timeline-dot status-${l.to_status}"></div>
              <div class="ak-timeline-content">
                <div><strong>${l.from_status ? `${l.from_status} → ${l.to_status}` : l.to_status}</strong></div>
                ${l.reason ? `<div class="text-sm">${Utils.escape(l.reason)}</div>` : ''}
                <div class="text-sm text-muted">${Utils.escape(l.changed_by_name || 'النظام')} · ${Utils.timeAgo(l.created_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      const wrap = document.getElementById('ak-log-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDetailFooter(k) {
    const buttons = [];
    if (k.status === 'pending_review') {
      buttons.push(`<button class="btn btn-success" data-action="approve">✅ موافقة</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="reject">❌ رفض</button>`);
    } else if (k.status === 'active') {
      buttons.push(`<button class="btn btn-secondary" data-action="toggle">⏸️ إيقاف مؤقت</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="suspend">🚫 تعليق</button>`);
    } else if (k.status === 'paused') {
      buttons.push(`<button class="btn btn-success" data-action="toggle">▶️ تفعيل</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="suspend">🚫 تعليق</button>`);
    } else if (k.status === 'suspended') {
      buttons.push(`<button class="btn btn-success" data-action="unsuspend">▶️ رفع التعليق</button>`);
    } else if (k.status === 'rejected') {
      buttons.push(`<button class="btn btn-success" data-action="approve">↩️ إعادة الموافقة</button>`);
    }
    buttons.push(`<button class="btn btn-secondary" data-modal-close style="margin-right:auto;">إغلاق</button>`);
    return buttons.join(' ');
  },

  attachDetailHandlers() {
    // Detail tabs
    document.querySelectorAll('[data-detail-tab]').forEach(btn => {
      btn.onclick = () => {
        this.state.detailTab = btn.dataset.detailTab;
        document.querySelectorAll('[data-detail-tab]').forEach(b => b.classList.toggle('active', b.dataset.detailTab === this.state.detailTab));
        const content = document.getElementById('ak-detail-content');
        if (content) content.innerHTML = this.renderDetailContent();
        if (this.state.detailTab === 'stats')     this.loadDetailStats();
        if (this.state.detailTab === 'orders')   this.loadDetailOrders();
        if (this.state.detailTab === 'documents') this.loadDetailDocuments();
        if (this.state.detailTab === 'log')      this.loadDetailLog();
      };
    });

    // Action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => this.handleAction(btn.dataset.action);
    });

    // Edit buttons
    document.querySelectorAll('[data-edit-kitchen]').forEach(btn => {
      btn.onclick = () => this.openEditModal(btn.dataset.editKitchen);
    });
    document.querySelectorAll('[data-edit-commission]').forEach(btn => {
      btn.onclick = () => this.openCommissionModal(btn.dataset.editCommission);
    });

    // Close
    if (this.attachUserActionHandlers) this.attachUserActionHandlers();
    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
    document.getElementById('modal-container').innerHTML = '';
  },

  // ── ACTIONS ──────────────────────────────────────────
  async handleAction(action) {
    const k = this.state.selectedKitchen;
    if (!k) return;

    if (action === 'approve') {
      if (!confirm(`هل تريد الموافقة على "${k.name_ar}"؟`)) return;
      try {
        await API.adminKitchens.approve(k.id);
        Utils.success('تمت الموافقة');
        this.closeModal();
        this.loadStats();
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'reject') {
      const reason = await this.promptReason('سبب الرفض');
      if (!reason) return;
      try {
        await API.adminKitchens.reject(k.id, reason);
        Utils.success('تم الرفض');
        this.closeModal();
        this.loadStats();
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'suspend') {
      const reason = await this.promptReason('سبب التعليق');
      if (!reason) return;
      try {
        await API.adminKitchens.suspend(k.id, reason);
        Utils.success('تم التعليق');
        this.closeModal();
        this.loadStats();
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'unsuspend') {
      if (!confirm('هل تريد رفع التعليق؟')) return;
      try {
        await API.adminKitchens.unsuspend(k.id);
        Utils.success('تم رفع التعليق');
        this.closeModal();
        this.loadStats();
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'toggle') {
      try {
        await API.adminKitchens.toggle(k.id);
        Utils.success('تم التبديل');
        this.closeModal();
        this.loadStats();
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }
    }
  },

  // ── PROMPTS ──────────────────────────────────────────
  async promptReason(title) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-container');
      const wrap = document.createElement('div');
      wrap.className = 'modal-overlay';
      wrap.innerHTML = `
        <div class="modal modal-md" onclick="event.stopPropagation()">
          <div class="modal-header"><div class="modal-title">${title}</div></div>
          <div class="modal-body">
            <div class="form-group">
              <label>السبب (5 أحرف على الأقل)</label>
              <textarea id="reason-input" rows="3" autofocus></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="reason-cancel">إلغاء</button>
            <button class="btn btn-primary" id="reason-ok">تأكيد</button>
          </div>
        </div>
      `;
      modal.appendChild(wrap);
      const input = document.getElementById('reason-input');
      if (input) input.focus();
      const cleanup = () => { wrap.remove(); };
      document.getElementById('reason-cancel').onclick = () => { cleanup(); resolve(null); };
      document.getElementById('reason-ok').onclick = () => {
        const val = input.value.trim();
        if (val.length < 5) { Utils.error('السبب قصير جداً'); return; }
        cleanup(); resolve(val);
      };
    });
  },

  // ── CREATE / EDIT MODALS ─────────────────────────────
  async openCreateModal() {
    // Need to fetch chefs list for dropdown
    let chefs = [];
    try {
      const { users } = await API.get('/admin/users', { role: 'chef', limit: 100 });
      chefs = users || [];
    } catch (err) { /* silent */ }

    Utils.modal({
      title: '+ إضافة مطبخ يدوياً',
      size: 'modal-lg',
      body: this.renderCreateForm(chefs),
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="ak-create-submit">حفظ</button>
      `,
    });

    document.querySelector('[data-modal-close]').onclick = () => this.closeModal();
    document.getElementById('ak-create-submit').onclick = () => this.submitCreate();
  },

  renderCreateForm(chefs) {
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div class="form-group" style="grid-column:1/-1;">
          <label>الدولة *</label>
          ${Currency.countrySelector('', 'create-country-id')}
          <p class="text-sm text-muted" style="margin-top:6px;">يحدد عملة المطبخ والعمولة الافتراضية</p>
        </div>
        <div class="form-group">
          <label>الطاهي (المالك) *</label>
          <select id="create-user-id">
            <option value="">— اختر طاهي —</option>
            ${chefs.map(u => `<option value="${u.id}">${Utils.escape(u.full_name)} (${Utils.escape(u.phone)})</option>`).join('')}
          </select>
          ${chefs.length === 0 ? `<p class="text-sm text-muted" style="margin-top:6px;">لا يوجد طهاة - أضف مستخدمين بدور "chef" أولاً</p>` : ''}
        </div>
        <div class="form-group">
          <label>المدينة *</label>
          <select id="create-city-id"><option value="">— اختر مدينة —</option></select>
          <p class="text-sm text-muted" style="margin-top:6px;">سيتم تحميلها من إعدادات الدولة</p>
        </div>
        <div class="form-group">
          <label>الاسم (عربي) *</label>
          <input type="text" id="create-name-ar" placeholder="مطبخ الخالة">
        </div>
        <div class="form-group">
          <label>الاسم (English) *</label>
          <input type="text" id="create-name-en" placeholder="Khalto Kitchen">
        </div>
        <div class="form-group">
          <label>هاتف التواصل</label>
          <input type="tel" id="create-phone" placeholder="+966...">
        </div>
        <div class="form-group">
          <label>إيميل التواصل</label>
          <input type="email" id="create-email" placeholder="kitchen@example.com">
        </div>
        <div class="form-group">
          <label>العمولة %</label>
          <input type="number" id="create-commission" value="15" min="0" max="50" step="0.5">
        </div>
        <div class="form-group">
          <label>الحد الأدنى للطلب</label>
          <input type="number" id="create-min-order" value="0" min="0">
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label>نبذة</label>
          <textarea id="create-bio" rows="2"></textarea>
        </div>
      </div>
    `;
  },

  async submitCreate() {
    const data = {
      user_id:           document.getElementById('create-user-id').value,
      name_ar:           document.getElementById('create-name-ar').value.trim(),
      name_en:           document.getElementById('create-name-en').value.trim(),
      contact_phone:     document.getElementById('create-phone').value.trim(),
      contact_email:     document.getElementById('create-email').value.trim(),
      commission_pct:    Number(document.getElementById('create-commission').value) || 15,
      min_order_amount:  Number(document.getElementById('create-min-order').value) || 0,
      bio_ar:            document.getElementById('create-bio').value.trim(),
    };

    const countryId = document.getElementById('create-country-id').value;
    if (!data.user_id || !data.name_ar || !data.name_en) {
      Utils.error('الحقول الأساسية مطلوبة');
      return;
    }
    if (!countryId) {
      Utils.error('يجب اختيار الدولة');
      return;
    }
    data.country_id = countryId;

    // Auto-set commission from country if default
    const country = Currency._cache?.[countryId];
    if (country && data.commission_pct === 15) {
      data.commission_pct = country.default_commission_pct || 15;
    }
    if (country && data.min_order_amount === 0) {
      data.min_order_amount = country.default_min_order_amount || 0;
    }

    try {
      await API.adminKitchens.create(data);
      Utils.success('تم إنشاء المطبخ');
      this.closeModal();
      this.loadStats();
      this.loadKitchens();
    } catch (err) { Utils.error(err.message); }
  },

  async openEditModal(kitchenId) {
    const k = this.state.selectedKitchen || (await API.adminKitchens.get(kitchenId)).kitchen;
    this.state.selectedKitchen = k;

    Utils.modal({
      title: '✏️ تعديل المطبخ',
      size: 'modal-lg',
      body: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div class="form-group"><label>الاسم (عربي)</label><input type="text" id="edit-name-ar" value="${Utils.escape(k.name_ar || '')}"></div>
          <div class="form-group"><label>الاسم (English)</label><input type="text" id="edit-name-en" value="${Utils.escape(k.name_en || '')}"></div>
          <div class="form-group"><label>هاتف التواصل</label><input type="tel" id="edit-phone" value="${Utils.escape(k.contact_phone || '')}"></div>
          <div class="form-group"><label>إيميل التواصل</label><input type="email" id="edit-email" value="${Utils.escape(k.contact_email || '')}"></div>
          <div class="form-group"><label>الحد الأدنى للطلب</label><input type="number" id="edit-min-order" value="${k.min_order_amount || 0}"></div>
          <div class="form-group"><label>نطاق التوصيل (كم)</label><input type="number" id="edit-radius" value="${k.delivery_radius_km || 0}" step="0.5"></div>
          <div class="form-group"><label>السجل التجاري</label><input type="text" id="edit-cr" value="${Utils.escape(k.commercial_register || '')}"></div>
          <div class="form-group"><label>الرقم الضريبي</label><input type="text" id="edit-tax" value="${Utils.escape(k.tax_number || '')}"></div>
          <div class="form-group"><label>IBAN</label><input type="text" id="edit-iban" value="${Utils.escape(k.bank_account_iban || '')}" style="direction:ltr;"></div>
          <div class="form-group"><label>اسم صاحب الحساب</label><input type="text" id="edit-bank-holder" value="${Utils.escape(k.bank_account_holder || '')}"></div>
          <div class="form-group" style="grid-column:1/-1;"><label>نبذة (عربي)</label><textarea id="edit-bio-ar" rows="2">${Utils.escape(k.bio_ar || '')}</textarea></div>
          <div class="form-group" style="grid-column:1/-1;"><label>ملاحظات الإدارة</label><textarea id="edit-admin-notes" rows="2">${Utils.escape(k.admin_notes || '')}</textarea></div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="edit-submit">حفظ التغييرات</button>
      `,
    });

    document.querySelector('[data-modal-close]').onclick = () => { this.closeModal(); this.openDetailModal(k.id); };
    document.getElementById('edit-submit').onclick = () => this.submitEdit(k.id);
  },

  async submitEdit(id) {
    const data = {
      name_ar:             document.getElementById('edit-name-ar').value.trim(),
      name_en:             document.getElementById('edit-name-en').value.trim(),
      contact_phone:       document.getElementById('edit-phone').value.trim(),
      contact_email:       document.getElementById('edit-email').value.trim(),
      min_order_amount:    Number(document.getElementById('edit-min-order').value) || 0,
      delivery_radius_km:  Number(document.getElementById('edit-radius').value) || 0,
      commercial_register: document.getElementById('edit-cr').value.trim(),
      tax_number:          document.getElementById('edit-tax').value.trim(),
      bank_account_iban:   document.getElementById('edit-iban').value.trim(),
      bank_account_holder: document.getElementById('edit-bank-holder').value.trim(),
      bio_ar:              document.getElementById('edit-bio-ar').value.trim(),
      admin_notes:         document.getElementById('edit-admin-notes').value.trim(),
    };

    try {
      await API.adminKitchens.update(id, data);
      Utils.success('تم الحفظ');
      this.closeModal();
      this.loadKitchens();
      this.openDetailModal(id);
    } catch (err) { Utils.error(err.message); }
  },

  async openCommissionModal(kitchenId) {
    const k = this.state.selectedKitchen;
    Utils.modal({
      title: '💰 تعديل عمولة المطبخ',
      size: 'modal-md',
      body: `
        <p class="text-sm text-muted" style="margin-bottom:12px;">العمولة الحالية: <strong>${Number(k.commission_pct || 0)}%</strong></p>
        <div class="form-group">
          <label>العمولة الجديدة % (0-50)</label>
          <input type="number" id="commission-input" value="${k.commission_pct || 15}" min="0" max="50" step="0.5">
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="commission-submit">حفظ</button>
      `,
    });
    document.querySelector('[data-modal-close]').onclick = () => { this.closeModal(); this.openDetailModal(kitchenId); };
    document.getElementById('commission-submit').onclick = async () => {
      const val = Number(document.getElementById('commission-input').value);
      try {
        await API.adminKitchens.setCommission(kitchenId, val);
        Utils.success('تم حفظ العمولة');
        this.closeModal();
        this.openDetailModal(kitchenId);
        this.loadKitchens();
      } catch (err) { Utils.error(err.message); }
    };
  },

  // ── STYLES ───────────────────────────────────────────
  injectStyles() {
    if (document.getElementById('ak-page-styles')) return;
    const s = document.createElement('style');
    s.id = 'ak-page-styles';
    s.textContent = `
      .ak-page { padding: 0; }
      .ak-tabs {
        display: flex; gap: 4px;
        background: var(--bg-white);
        padding: 6px;
        border-radius: var(--radius-lg);
        margin-bottom: 14px;
        border: 1px solid var(--border);
        overflow-x: auto;
      }
      .ak-tab {
        padding: 8px 14px;
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
        display: flex;
        align-items: center;
      }
      .ak-tab:hover { color: var(--text); background: var(--bg-hover); }
      .ak-tab.active { background: var(--coral); color: white; }
      .ak-tab-count {
        margin-right: 6px;
        background: rgba(0,0,0,0.1);
        padding: 1px 7px;
        border-radius: 10px;
        font-size: 11px;
      }
      .ak-tab.active .ak-tab-count { background: rgba(255,255,255,0.3); }

      .ak-toolbar {
        display: flex; gap: 8px; flex-wrap: wrap;
        margin-bottom: 14px;
      }
      .ak-toolbar input[type="text"], .ak-toolbar select {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-family: var(--font);
        font-size: 13px;
      }
      .ak-toolbar input[type="text"] { flex: 1; min-width: 200px; }

      .ak-table { font-size: 13px; }
      .ak-table th { background: var(--bg-hover); }
      .ak-row:hover { background: var(--bg-hover); }
      .ak-kitchen-cell { display: flex; gap: 10px; align-items: center; }
      .ak-avatar {
        width: 40px; height: 40px;
        border-radius: var(--radius);
        background: var(--coral);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
        background-size: cover;
        background-position: center;
        flex-shrink: 0;
      }
      .ak-avatar-lg {
        width: 64px; height: 64px;
        border-radius: var(--radius-lg);
        background: var(--coral);
        display: flex; align-items: center; justify-content: center;
        font-size: 28px;
        background-size: cover;
        background-position: center;
        flex-shrink: 0;
      }

      .badge.status-pending_review { background: #FEF3C7; color: #92400E; }
      .badge.status-active         { background: #D1FAE5; color: #065F46; }
      .badge.status-paused         { background: #E0E7FF; color: #3730A3; }
      .badge.status-suspended      { background: #FED7D7; color: #9B2C2C; }
      .badge.status-rejected       { background: #FECACA; color: #991B1B; }
      .badge.status-blocked        { background: #1F2937; color: white; }

      .badge.order-pending     { background: #FEF3C7; color: #92400E; }
      .badge.order-accepted    { background: #DBEAFE; color: #1E40AF; }
      .badge.order-preparing   { background: #FED7AA; color: #9A3412; }
      .badge.order-ready       { background: #C7D2FE; color: #3730A3; }
      .badge.order-out_for_delivery { background: #BFDBFE; color: #1E3A8A; }
      .badge.order-delivered   { background: #D1FAE5; color: #065F46; }
      .badge.order-cancelled   { background: #FECACA; color: #991B1B; }

      .ak-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        padding: 10px 14px;
        background: var(--bg-white);
        border-radius: var(--radius);
      }

      /* Detail modal */
      .ak-detail-header {
        display: flex; gap: 14px; align-items: center;
        padding: 14px;
        background: var(--bg);
        border-radius: var(--radius-lg);
        margin-bottom: 14px;
      }
      .ak-detail-tabs {
        display: flex; gap: 4px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 14px;
        overflow-x: auto;
      }
      .ak-detail-tab {
        padding: 8px 14px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        font-family: var(--font);
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        white-space: nowrap;
      }
      .ak-detail-tab:hover { color: var(--text); }
      .ak-detail-tab.active { color: var(--coral); border-bottom-color: var(--coral); }

      .ak-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 14px;
      }
      .ak-info-section {
        background: var(--bg);
        padding: 14px;
        border-radius: var(--radius);
      }
      .ak-info-title {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 10px;
        color: var(--text);
      }
      .ak-info-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 0;
        font-size: 13px;
        border-bottom: 1px solid var(--border);
      }
      .ak-info-row:last-child { border-bottom: none; }
      .ak-info-row span { color: var(--text-muted); }

      .ak-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
      }
      .ak-stat-card {
        background: var(--bg);
        padding: 14px;
        border-radius: var(--radius);
        text-align: center;
      }
      .ak-stat-label { font-size: 11px; color: var(--text-muted); }
      .ak-stat-value { font-size: 20px; font-weight: 700; margin-top: 4px; }

      .ak-timeline {
        position: relative;
        padding-right: 20px;
      }
      .ak-timeline::before {
        content: '';
        position: absolute;
        right: 6px; top: 0; bottom: 0;
        width: 2px;
        background: var(--border);
      }
      .ak-timeline-item {
        position: relative;
        padding: 8px 0;
      }
      .ak-timeline-dot {
        position: absolute;
        right: -14px; top: 12px;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: var(--coral);
        border: 3px solid var(--bg-white);
      }
      .ak-timeline-dot.status-active    { background: #10B981; }
      .ak-timeline-dot.status-rejected  { background: #EF4444; }
      .ak-timeline-dot.status-suspended { background: #F59E0B; }
      .ak-timeline-content {
        padding: 10px 14px;
        background: var(--bg);
        border-radius: var(--radius);
      }
    `;
    document.head.appendChild(s);
  },

});

// Apply user management mixin
if (window.UserMgmtMixin && Router.pages && Router.pages['admin-kitchens']) {
  Object.assign(Router.pages['admin-kitchens'], window.UserMgmtMixin);
}
