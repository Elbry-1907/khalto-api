/* ═══════════════════════════════════════════════════════════
   Page: Admin Couriers Management
   Full CRUD + lifecycle for couriers
   ═══════════════════════════════════════════════════════════ */

Router.register('admin-couriers', {

  state: {
    activeTab: 'all',
    page: 1,
    limit: 20,
    search: '',
    countryFilter: '',
    availabilityFilter: '',
    sortBy: 'created_at',
    sortDir: 'desc',
    couriers: [],
    total: 0,
    stats: null,
    countries: [],
    selectedCourier: null,
    detailTab: 'info',
  },

  // ── ENTRY ─────────────────────────────────────────────
  async render(container) {
    container.innerHTML = `
      <div class="ac-page">
        ${this.renderHeader()}
        ${this.renderTabs()}
        ${this.renderToolbar()}
        <div id="ac-table-container">${Utils.loadingHTML()}</div>
      </div>
    `;
    this.injectStyles();
    this.attachStaticHandlers();
    await this.loadStats();
    await this.loadCountries();
    await this.loadCouriers();
  },

  // ── DATA LOADING ─────────────────────────────────────
  async loadStats() {
    try {
      this.state.stats = await API.adminCouriers.stats();
      this.updateHeader();
    } catch (err) { /* silent */ }
  },

  async loadCountries() {
    try {
      const { countries } = await API.countries.list({ active_only: 'true' });
      this.state.countries = countries || [];
    } catch (err) { /* silent */ }
  },

  async loadCouriers() {
    const wrap = document.getElementById('ac-table-container');
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
      if (this.state.availabilityFilter) params.availability = this.state.availabilityFilter;

      const result = await API.adminCouriers.list(params);
      this.state.couriers = result.couriers || [];
      this.state.total = result.total || 0;
      this.renderTable();
    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  // ── HEADER ───────────────────────────────────────────
  renderHeader() {
    return `
      <div class="card" style="background:linear-gradient(135deg, #6c5ce7 0%, #5043a8 100%); color:white; border:none; margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <h2 style="font-size:20px; margin-bottom:4px;">🛵 إدارة المندوبين</h2>
            <p style="font-size:13px; opacity:0.9;">موافقة، تعليق، تعديل، وإحصائيات لكل المندوبين</p>
          </div>
          <button class="btn" id="ac-add-btn" style="background:white; color:#5043a8; font-weight:700;">+ إضافة مندوب يدوياً</button>
        </div>
        <div id="ac-header-stats" style="display:flex; gap:24px; flex-wrap:wrap; margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.15);">
          <div><div style="font-size:11px; opacity:0.8;">الإجمالي</div><div style="font-size:18px; font-weight:700;">—</div></div>
        </div>
      </div>
    `;
  },

  updateHeader() {
    const stats = this.state.stats;
    if (!stats) return;
    const wrap = document.getElementById('ac-header-stats');
    if (!wrap) return;
    wrap.innerHTML = `
      <div><div style="font-size:11px; opacity:0.8;">الإجمالي</div><div style="font-size:18px; font-weight:700;">${stats.total}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">قيد المراجعة</div><div style="font-size:18px; font-weight:700;">${stats.pending_review}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">نشط</div><div style="font-size:18px; font-weight:700;">${stats.active}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">معلّق</div><div style="font-size:18px; font-weight:700;">${stats.suspended}</div></div>
      <div><div style="font-size:11px; opacity:0.8;">مرفوض</div><div style="font-size:18px; font-weight:700;">${stats.rejected}</div></div>
      <div style="border-right:1px solid rgba(255,255,255,0.2); padding-right:24px;">
        <div style="font-size:11px; opacity:0.8;">🟢 متاح الآن</div>
        <div style="font-size:18px; font-weight:700;">${stats.online_now || 0}</div>
      </div>
      <div><div style="font-size:11px; opacity:0.8;">🚚 يوصّل الآن</div><div style="font-size:18px; font-weight:700;">${stats.delivering_now || 0}</div></div>
    `;
  },

  // ── TABS ─────────────────────────────────────────────
  renderTabs() {
    const tabs = [
      { id: 'all',             icon: '📋', label: 'الكل' },
      { id: 'pending_review',  icon: '⏳', label: 'قيد المراجعة' },
      { id: 'active',          icon: '✅', label: 'نشط' },
      { id: 'suspended',       icon: '🚫', label: 'معلّق' },
      { id: 'rejected',        icon: '❌', label: 'مرفوض' },
    ];
    return `
      <div class="ac-tabs">
        ${tabs.map(t => {
          const count = t.id === 'all' ? (this.state.stats?.total ?? '') : (this.state.stats?.[t.id] ?? '');
          return `<button class="ac-tab ${t.id === this.state.activeTab ? 'active' : ''}" data-tab="${t.id}">
            <span style="margin-left:6px;">${t.icon}</span>${t.label}
            ${count !== '' ? `<span class="ac-tab-count">${count}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    `;
  },

  // ── TOOLBAR ──────────────────────────────────────────
  renderToolbar() {
    return `
      <div class="ac-toolbar">
        <input type="text" id="ac-search" placeholder="🔍 بحث بالاسم أو الهاتف أو رقم اللوحة..." value="${Utils.escape(this.state.search)}">
        <select id="ac-availability-filter">
          <option value="">كل الحالات</option>
          <option value="online">🟢 متاح</option>
          <option value="offline">⚪ غير متاح</option>
          <option value="delivering">🚚 يوصّل</option>
        </select>
        <select id="ac-country-filter">
          <option value="">كل الدول</option>
          ${(this.state.countries || []).map(c => `<option value="${c.id}" ${c.id === this.state.countryFilter ? 'selected' : ''}>${Utils.escape(c.name_ar)}</option>`).join('')}
        </select>
        <select id="ac-sort">
          <option value="created_at:desc">الأحدث أولاً</option>
          <option value="created_at:asc">الأقدم أولاً</option>
          <option value="rating:desc">الأعلى تقييماً</option>
          <option value="total_deliveries:desc">الأكثر توصيلاً</option>
          <option value="total_earnings:desc">الأعلى أرباحاً</option>
        </select>
        <button class="btn btn-secondary" id="ac-refresh">🔄 تحديث</button>
      </div>
    `;
  },

  // ── TABLE ────────────────────────────────────────────
  renderTable() {
    const wrap = document.getElementById('ac-table-container');
    if (!wrap) return;

    if (this.state.couriers.length === 0) {
      wrap.innerHTML = Utils.emptyHTML('لا يوجد مندوبين', 'هيظهروا هنا لما يسجّل أول مندوب', '🛵');
      return;
    }

    const rows = this.state.couriers.map(c => this.renderRow(c)).join('');
    const totalPages = Math.ceil(this.state.total / this.state.limit) || 1;

    wrap.innerHTML = `
      <div class="card" style="padding:0;">
        <table class="table ac-table">
          <thead>
            <tr>
              <th>المندوب</th>
              <th>المركبة</th>
              <th>الموقع</th>
              <th>الحالة</th>
              <th>الإتاحة</th>
              <th>التوصيلات</th>
              <th>الأرباح</th>
              <th>التقييم</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="ac-pagination">
        <button class="btn btn-sm btn-secondary" data-page-prev ${this.state.page <= 1 ? 'disabled' : ''}>← السابق</button>
        <span class="text-sm text-muted">صفحة ${this.state.page} من ${totalPages} (${this.state.total} مندوب)</span>
        <button class="btn btn-sm btn-secondary" data-page-next ${this.state.page >= totalPages ? 'disabled' : ''}>التالي →</button>
      </div>
    `;

    this.attachRowHandlers();
  },

  renderRow(c) {
    const statusLabel = {
      pending_review: 'قيد المراجعة',
      active: 'نشط',
      suspended: 'معلّق',
      rejected: 'مرفوض',
    }[c.status] || c.status;

    const availLabel = {
      online: '🟢 متاح',
      offline: '⚪ غير متاح',
      delivering: '🚚 يوصّل',
    }[c.availability] || c.availability;

    const vehicleIcon = {
      motorcycle: '🛵',
      bicycle: '🚲',
      car: '🚗',
    }[c.vehicle_type] || '🛵';

    const rating = Number(c.rating || 0).toFixed(1);
    const ratingStars = '⭐'.repeat(Math.round(Number(c.rating || 0))) || '—';

    return `
      <tr class="ac-row" data-id="${c.id}">
        <td>
          <div class="ac-courier-cell">
            <div class="ac-avatar">${(c.user_name || '?').substring(0, 1)}</div>
            <div>
              <div style="font-weight:600;">${Utils.escape(c.user_name || '—')}</div>
              <div class="text-sm text-muted">${Utils.escape(c.user_phone || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <div>${vehicleIcon} ${Utils.escape(c.vehicle_type || '—')}</div>
          <div class="text-sm text-muted">${Utils.escape(c.vehicle_plate || '')}</div>
        </td>
        <td>
          <div>${Utils.escape(c.city_name || '—')}</div>
          <div class="text-sm text-muted">${Utils.escape(c.country_code || '')}</div>
        </td>
        <td><span class="badge status-${c.status}">${statusLabel}</span></td>
        <td><span class="badge avail-${c.availability}">${availLabel}</span></td>
        <td>
          <div style="font-weight:600;">${c.total_deliveries || 0}</div>
          ${c.cancelled_deliveries > 0 ? `<div class="text-sm text-muted">${c.cancelled_deliveries} ملغية</div>` : ''}
        </td>
        <td><strong>${Number(c.total_earnings || 0).toFixed(0)} ر.س</strong></td>
        <td>
          <div title="${rating}">${ratingStars}</div>
          <div class="text-sm text-muted">${c.rating_count || 0} تقييم</div>
        </td>
        <td>
          <button class="btn btn-sm btn-primary" data-view="${c.id}">عرض</button>
        </td>
      </tr>
    `;
  },

  // ── HANDLERS ─────────────────────────────────────────
  attachStaticHandlers() {
    document.getElementById('ac-add-btn').onclick = () => this.openCreateModal();

    document.querySelectorAll('.ac-tab').forEach(btn => {
      btn.onclick = () => {
        this.state.activeTab = btn.dataset.tab;
        this.state.page = 1;
        document.querySelectorAll('.ac-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this.state.activeTab));
        this.loadCouriers();
      };
    });

    let searchTimer;
    document.getElementById('ac-search').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.state.search = e.target.value.trim();
        this.state.page = 1;
        this.loadCouriers();
      }, 350);
    };

    document.getElementById('ac-availability-filter').onchange = (e) => {
      this.state.availabilityFilter = e.target.value;
      this.state.page = 1;
      this.loadCouriers();
    };

    document.getElementById('ac-country-filter').onchange = (e) => {
      this.state.countryFilter = e.target.value;
      this.state.page = 1;
      this.loadCouriers();
    };

    document.getElementById('ac-sort').onchange = (e) => {
      const [by, dir] = e.target.value.split(':');
      this.state.sortBy = by;
      this.state.sortDir = dir;
      this.loadCouriers();
    };

    document.getElementById('ac-refresh').onclick = () => {
      this.loadStats();
      this.loadCouriers();
    };
  },

  attachRowHandlers() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.onclick = () => this.openDetailModal(btn.dataset.view);
    });

    document.querySelectorAll('[data-page-prev]').forEach(b => {
      b.onclick = () => { if (this.state.page > 1) { this.state.page--; this.loadCouriers(); } };
    });
    document.querySelectorAll('[data-page-next]').forEach(b => {
      b.onclick = () => {
        const totalPages = Math.ceil(this.state.total / this.state.limit) || 1;
        if (this.state.page < totalPages) { this.state.page++; this.loadCouriers(); }
      };
    });
  },

  // ── DETAIL MODAL ─────────────────────────────────────
  async openDetailModal(courierId) {
    this.state.detailTab = 'info';
    Utils.modal({
      title: '🛵 تفاصيل المندوب',
      size: 'modal-xl',
      body: Utils.loadingHTML(),
      footer: '',
    });

    try {
      const { courier } = await API.adminCouriers.get(courierId);
      this.state.selectedCourier = courier;
      this.renderDetailModal();
    } catch (err) {
      const body = document.querySelector('.modal-body');
      if (body) body.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDetailModal() {
    const c = this.state.selectedCourier;
    if (!c) return;
    const body = document.querySelector('.modal-body');
    const footer = document.querySelector('.modal-footer');
    if (!body) return;

    body.innerHTML = `
      <div class="ac-detail">
        ${this.renderDetailHeader(c)}
        <div class="ac-detail-tabs">
          <button class="ac-detail-tab ${this.state.detailTab === 'info' ? 'active' : ''}" data-detail-tab="info">📋 المعلومات</button>
          <button class="ac-detail-tab ${this.state.detailTab === 'earnings' ? 'active' : ''}" data-detail-tab="earnings">💰 الأرباح</button>
          <button class="ac-detail-tab ${this.state.detailTab === 'deliveries' ? 'active' : ''}" data-detail-tab="deliveries">🚚 التوصيلات</button>
          <button class="ac-detail-tab ${this.state.detailTab === 'log' ? 'active' : ''}" data-detail-tab="log">📜 السجل</button>
        </div>
        <div id="ac-detail-content">${this.renderDetailContent()}</div>
      </div>
    `;

    if (footer) footer.innerHTML = this.renderDetailFooter(c);
    this.attachDetailHandlers();
  },

  renderDetailHeader(c) {
    const statusLabel = {
      pending_review: 'قيد المراجعة',
      active: 'نشط',
      suspended: 'معلّق',
      rejected: 'مرفوض',
    }[c.status] || c.status;

    const availLabel = {
      online: '🟢 متاح',
      offline: '⚪ غير متاح',
      delivering: '🚚 يوصّل',
    }[c.availability] || '⚪';

    const vehicleIcon = { motorcycle: '🛵', bicycle: '🚲', car: '🚗' }[c.vehicle_type] || '🛵';

    return `
      <div class="ac-detail-header">
        <div class="ac-avatar-lg">${(c.user_name || '?').substring(0, 1)}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:18px; font-weight:700;">${Utils.escape(c.user_name || '—')}</div>
          <div class="text-sm text-muted">${Utils.escape(c.user_phone || '')} · ${Utils.escape(c.user_email || '')}</div>
          <div style="margin-top:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="badge status-${c.status}">${statusLabel}</span>
            <span class="badge avail-${c.availability}">${availLabel}</span>
            <span class="text-sm">${vehicleIcon} ${Utils.escape(c.vehicle_type || '')} ${Utils.escape(c.vehicle_plate || '')}</span>
            <span class="text-sm">⭐ ${Number(c.rating || 0).toFixed(1)} (${c.rating_count || 0})</span>
          </div>
        </div>
      </div>
    `;
  },

  renderDetailContent() {
    if (this.state.detailTab === 'info')       return this.renderInfoTab();
    if (this.state.detailTab === 'earnings')   return this.renderEarningsTab();
    if (this.state.detailTab === 'deliveries') return this.renderDeliveriesTab();
    if (this.state.detailTab === 'log')        return this.renderLogTab();
    return '';
  },

  renderInfoTab() {
    const c = this.state.selectedCourier;
    return `
      <div class="ac-info-grid">
        <div class="ac-info-section">
          <div class="ac-info-title">📋 المعلومات الأساسية</div>
          <div class="ac-info-row"><span>الاسم:</span><strong>${Utils.escape(c.user_name || '—')}</strong></div>
          <div class="ac-info-row"><span>الهاتف:</span><strong>${Utils.escape(c.user_phone || '—')}</strong></div>
          <div class="ac-info-row"><span>الإيميل:</span><strong>${Utils.escape(c.user_email || '—')}</strong></div>
          <div class="ac-info-row"><span>الهوية الوطنية:</span><strong>${Utils.escape(c.national_id || '—')}</strong></div>
        </div>

        <div class="ac-info-section">
          <div class="ac-info-title">🛵 المركبة</div>
          <div class="ac-info-row"><span>النوع:</span><strong>${Utils.escape(c.vehicle_type || '—')}</strong></div>
          <div class="ac-info-row"><span>رقم اللوحة:</span><strong>${Utils.escape(c.vehicle_plate || '—')}</strong></div>
          <div class="ac-info-row"><span>رقم الرخصة:</span><strong>${Utils.escape(c.license_number || '—')}</strong></div>
          <div class="ac-info-row"><span>انتهاء الرخصة:</span><strong>${c.license_expiry ? new Date(c.license_expiry).toLocaleDateString('ar-SA') : '—'}</strong></div>
        </div>

        <div class="ac-info-section">
          <div class="ac-info-title">📍 الموقع</div>
          <div class="ac-info-row"><span>الدولة:</span><strong>${Utils.escape(c.country_name || '—')}</strong></div>
          <div class="ac-info-row"><span>المدينة:</span><strong>${Utils.escape(c.city_name || '—')}</strong></div>
          <div class="ac-info-row"><span>آخر ظهور:</span><strong>${c.last_seen_at ? Utils.timeAgo(c.last_seen_at) : '—'}</strong></div>
          <div class="ac-info-row"><span>الإحداثيات:</span><strong>${c.current_lat || '—'}, ${c.current_lng || '—'}</strong></div>
        </div>

        <div class="ac-info-section">
          <div class="ac-info-title">💰 الإعدادات المالية</div>
          <div class="ac-info-row"><span>نسبة المندوب:</span><strong>${Number(c.delivery_percentage || 80)}%</strong></div>
          <div class="ac-info-row"><span>إجمالي الأرباح:</span><strong>${Number(c.total_earnings || 0).toFixed(0)} ر.س</strong></div>
          <div class="ac-info-row"><span>إجمالي التوصيلات:</span><strong>${c.total_deliveries || 0}</strong></div>
          <div class="ac-info-row"><span>التوصيلات الملغية:</span><strong>${c.cancelled_deliveries || 0}</strong></div>
          <div class="ac-info-row"><span>IBAN:</span><strong style="direction:ltr; text-align:left; font-size:12px;">${Utils.escape(c.bank_account_iban || '—')}</strong></div>
          <div class="ac-info-row"><span>اسم الحساب:</span><strong>${Utils.escape(c.bank_account_holder || '—')}</strong></div>
        </div>

        <div class="ac-info-section">
          <div class="ac-info-title">⚙️ الحالة الإدارية</div>
          ${c.approved_at ? `<div class="ac-info-row"><span>تمت الموافقة:</span><strong>${Utils.timeAgo(c.approved_at)}</strong></div>` : ''}
          ${c.approved_by_name ? `<div class="ac-info-row"><span>وافق:</span><strong>${Utils.escape(c.approved_by_name)}</strong></div>` : ''}
          ${c.rejection_reason ? `<div class="ac-info-row"><span>سبب الرفض:</span><strong>${Utils.escape(c.rejection_reason)}</strong></div>` : ''}
          ${c.suspension_reason ? `<div class="ac-info-row"><span>سبب التعليق:</span><strong>${Utils.escape(c.suspension_reason)}</strong></div>` : ''}
          <div class="ac-info-row"><span>تاريخ التسجيل:</span><strong>${Utils.timeAgo(c.created_at)}</strong></div>
        </div>

        ${c.admin_notes ? `
          <div class="ac-info-section" style="grid-column:1/-1; background:#FFF7E6;">
            <div class="ac-info-title">📌 ملاحظات الإدارة</div>
            <p>${Utils.escape(c.admin_notes)}</p>
          </div>
        ` : ''}
      </div>

      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-edit-courier="${c.id}">✏️ تعديل البيانات</button>
        <button class="btn btn-secondary" data-edit-percentage="${c.id}">💰 تعديل النسبة</button>
        ${c.status === 'active' ? `
          <button class="btn btn-secondary" data-set-availability="online" data-courier="${c.id}">🟢 إجبار online</button>
          <button class="btn btn-secondary" data-set-availability="offline" data-courier="${c.id}">⚪ إجبار offline</button>
        ` : ''}
      </div>

      <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <div class="ac-info-title" style="margin-bottom:10px;">👤 إدارة حساب المستخدم</div>
        ${c.blocked_at ? `
          <div style="background:#FED7D7; padding:10px; border-radius:6px; margin-bottom:10px; font-size:13px;">
            <strong>🚫 المستخدم محظور</strong>
            ${c.blocked_reason ? `<br><span class="text-sm">السبب: ${Utils.escape(c.blocked_reason)}</span>` : ''}
          </div>
          ${this.renderUnblockButton ? this.renderUnblockButton(c.user_id, c.user_name) : ''}
        ` : (this.renderUserActions ? this.renderUserActions(c.user_id, c.user_name) : '')}
      </div>
    `;
  },

  renderEarningsTab() {
    return `<div id="ac-earnings-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailEarnings() {
    try {
      const { overall, daily } = await API.adminCouriers.earnings(this.state.selectedCourier.id, { period: 30 });
      const wrap = document.getElementById('ac-earnings-loading');
      if (!wrap) return;
      wrap.innerHTML = `
        <div class="ac-stats-grid">
          <div class="ac-stat-card"><div class="ac-stat-label">عدد التوصيلات</div><div class="ac-stat-value">${overall?.deliveries_count || 0}</div></div>
          <div class="ac-stat-card"><div class="ac-stat-label">المُكتملة</div><div class="ac-stat-value">${overall?.completed || 0}</div></div>
          <div class="ac-stat-card"><div class="ac-stat-label">الملغية</div><div class="ac-stat-value">${overall?.cancelled || 0}</div></div>
          <div class="ac-stat-card"><div class="ac-stat-label">إجمالي الأرباح</div><div class="ac-stat-value">${Number(overall?.total_earnings || 0).toFixed(0)} ر.س</div></div>
          <div class="ac-stat-card"><div class="ac-stat-label">متوسط التوصيلة</div><div class="ac-stat-value">${Number(overall?.avg_per_delivery || 0).toFixed(0)} ر.س</div></div>
        </div>
        <p class="text-sm text-muted" style="margin-top:14px;">آخر 30 يوم</p>
        ${daily && daily.length > 0 ? `
          <div style="margin-top:16px;">
            <div class="ac-info-title">آخر الأيام</div>
            <table class="table">
              <thead><tr><th>التاريخ</th><th>التوصيلات</th><th>الأرباح</th></tr></thead>
              <tbody>
                ${daily.slice(-7).reverse().map(d => `
                  <tr><td>${new Date(d.date).toLocaleDateString('ar-SA')}</td>
                  <td>${d.deliveries}</td><td>${Number(d.earnings).toFixed(0)} ر.س</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p class="text-sm text-muted" style="margin-top:14px;">لا توجد توصيلات بعد</p>`}
      `;
    } catch (err) {
      const wrap = document.getElementById('ac-earnings-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDeliveriesTab() {
    return `<div id="ac-deliveries-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailDeliveries() {
    try {
      const { orders, total } = await API.adminCouriers.deliveries(this.state.selectedCourier.id, { limit: 20 });
      const wrap = document.getElementById('ac-deliveries-loading');
      if (!wrap) return;
      if (!orders || orders.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد توصيلات', '', '🚚');
        return;
      }
      wrap.innerHTML = `
        <p class="text-sm text-muted" style="margin-bottom:10px;">إجمالي ${total} توصيلة — يعرض أحدث ${orders.length}</p>
        <table class="table">
          <thead><tr><th>المطبخ</th><th>العميل</th><th>الحالة</th><th>عمولتك</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td>${Utils.escape(o.kitchen_name || '—')}</td>
                <td>${Utils.escape(o.customer_name || '—')}<br><span class="text-sm text-muted">${Utils.escape(o.customer_phone || '')}</span></td>
                <td><span class="badge order-${o.status}">${o.status}</span></td>
                <td><strong>${Number(o.courier_payout || 0).toFixed(0)} ر.س</strong></td>
                <td class="text-sm text-muted">${Utils.timeAgo(o.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      const wrap = document.getElementById('ac-deliveries-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderLogTab() {
    return `<div id="ac-log-loading">${Utils.loadingHTML()}</div>`;
  },

  async loadDetailLog() {
    try {
      const { logs } = await API.adminCouriers.statusLog(this.state.selectedCourier.id);
      const wrap = document.getElementById('ac-log-loading');
      if (!wrap) return;
      if (!logs || logs.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا يوجد سجل', '', '📜');
        return;
      }
      wrap.innerHTML = `
        <div class="ac-timeline">
          ${logs.map(l => `
            <div class="ac-timeline-item">
              <div class="ac-timeline-dot status-${l.to_status}"></div>
              <div class="ac-timeline-content">
                <div><strong>${l.from_status ? `${l.from_status} → ${l.to_status}` : l.to_status}</strong></div>
                ${l.reason ? `<div class="text-sm">${Utils.escape(l.reason)}</div>` : ''}
                <div class="text-sm text-muted">${Utils.escape(l.changed_by_name || 'النظام')} · ${Utils.timeAgo(l.created_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      const wrap = document.getElementById('ac-log-loading');
      if (wrap) wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDetailFooter(c) {
    const buttons = [];
    if (c.status === 'pending_review') {
      buttons.push(`<button class="btn btn-success" data-action="approve">✅ موافقة</button>`);
      buttons.push(`<button class="btn btn-danger" data-action="reject">❌ رفض</button>`);
    } else if (c.status === 'active') {
      buttons.push(`<button class="btn btn-danger" data-action="suspend">🚫 تعليق</button>`);
    } else if (c.status === 'suspended') {
      buttons.push(`<button class="btn btn-success" data-action="unsuspend">▶️ رفع التعليق</button>`);
    } else if (c.status === 'rejected') {
      buttons.push(`<button class="btn btn-success" data-action="approve">↩️ إعادة الموافقة</button>`);
    }
    buttons.push(`<button class="btn btn-secondary" data-modal-close style="margin-right:auto;">إغلاق</button>`);
    return buttons.join(' ');
  },

  attachDetailHandlers() {
    document.querySelectorAll('[data-detail-tab]').forEach(btn => {
      btn.onclick = () => {
        this.state.detailTab = btn.dataset.detailTab;
        document.querySelectorAll('[data-detail-tab]').forEach(b => b.classList.toggle('active', b.dataset.detailTab === this.state.detailTab));
        const content = document.getElementById('ac-detail-content');
        if (content) content.innerHTML = this.renderDetailContent();
        if (this.state.detailTab === 'earnings')   this.loadDetailEarnings();
        if (this.state.detailTab === 'deliveries') this.loadDetailDeliveries();
        if (this.state.detailTab === 'log')        this.loadDetailLog();
      };
    });

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.onclick = () => this.handleAction(btn.dataset.action);
    });

    document.querySelectorAll('[data-edit-courier]').forEach(btn => {
      btn.onclick = () => this.openEditModal(btn.dataset.editCourier);
    });
    document.querySelectorAll('[data-edit-percentage]').forEach(btn => {
      btn.onclick = () => this.openPercentageModal(btn.dataset.editPercentage);
    });
    document.querySelectorAll('[data-set-availability]').forEach(btn => {
      btn.onclick = () => this.setAvailability(btn.dataset.courier, btn.dataset.setAvailability);
    });

    if (this.attachUserActionHandlers) this.attachUserActionHandlers();
    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
    document.getElementById('modal-container').innerHTML = '';
  },

  // ── ACTIONS ──────────────────────────────────────────
  async handleAction(action) {
    const c = this.state.selectedCourier;
    if (!c) return;

    if (action === 'approve') {
      if (!confirm(`هل تريد الموافقة على ${c.user_name}؟`)) return;
      try {
        await API.adminCouriers.approve(c.id);
        Utils.success('تمت الموافقة');
        this.closeModal();
        this.loadStats();
        this.loadCouriers();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'reject') {
      const reason = await this.promptReason('سبب الرفض');
      if (!reason) return;
      try {
        await API.adminCouriers.reject(c.id, reason);
        Utils.success('تم الرفض');
        this.closeModal();
        this.loadStats();
        this.loadCouriers();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'suspend') {
      const reason = await this.promptReason('سبب التعليق');
      if (!reason) return;
      try {
        await API.adminCouriers.suspend(c.id, reason);
        Utils.success('تم التعليق');
        this.closeModal();
        this.loadStats();
        this.loadCouriers();
      } catch (err) { Utils.error(err.message); }

    } else if (action === 'unsuspend') {
      if (!confirm('هل تريد رفع التعليق؟')) return;
      try {
        await API.adminCouriers.unsuspend(c.id);
        Utils.success('تم رفع التعليق');
        this.closeModal();
        this.loadStats();
        this.loadCouriers();
      } catch (err) { Utils.error(err.message); }
    }
  },

  async setAvailability(courierId, availability) {
    try {
      await API.adminCouriers.setAvailability(courierId, availability);
      Utils.success(`تم تغيير الحالة إلى ${availability}`);
      this.loadStats();
      this.openDetailModal(courierId);
    } catch (err) { Utils.error(err.message); }
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

  // ── CREATE / EDIT ────────────────────────────────────
  async openCreateModal() {
    let couriers = [];
    try {
      const { users } = await API.get('/admin/users', { role: 'courier', limit: 100 });
      couriers = users || [];
    } catch (err) { /* silent */ }

    Utils.modal({
      title: '+ إضافة مندوب يدوياً',
      size: 'modal-lg',
      body: this.renderCreateForm(couriers),
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="ac-create-submit">حفظ</button>
      `,
    });

    document.querySelector('[data-modal-close]').onclick = () => this.closeModal();
    document.getElementById('ac-create-submit').onclick = () => this.submitCreate();
  },

  renderCreateForm(couriers) {
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div class="form-group">
          <label>المستخدم *</label>
          <select id="create-user-id">
            <option value="">— اختر مندوب —</option>
            ${couriers.map(u => `<option value="${u.id}">${Utils.escape(u.full_name)} (${Utils.escape(u.phone)})</option>`).join('')}
          </select>
          ${couriers.length === 0 ? `<p class="text-sm text-muted" style="margin-top:6px;">أضف مستخدمين بدور "courier" أولاً</p>` : ''}
        </div>
        <div class="form-group">
          <label>نوع المركبة</label>
          <select id="create-vehicle-type">
            <option value="motorcycle">🛵 دراجة نارية</option>
            <option value="car">🚗 سيارة</option>
            <option value="bicycle">🚲 دراجة هوائية</option>
          </select>
        </div>
        <div class="form-group">
          <label>رقم اللوحة</label>
          <input type="text" id="create-plate" placeholder="ABC-1234">
        </div>
        <div class="form-group">
          <label>الهوية الوطنية</label>
          <input type="text" id="create-national-id" placeholder="1234567890">
        </div>
        <div class="form-group">
          <label>رقم الرخصة</label>
          <input type="text" id="create-license-num" placeholder="رقم الرخصة">
        </div>
        <div class="form-group">
          <label>انتهاء الرخصة</label>
          <input type="date" id="create-license-exp">
        </div>
        <div class="form-group">
          <label>نسبة المندوب %</label>
          <input type="number" id="create-percentage" value="80" min="0" max="100" step="0.5">
        </div>
      </div>
    `;
  },

  async submitCreate() {
    const data = {
      user_id:             document.getElementById('create-user-id').value,
      vehicle_type:        document.getElementById('create-vehicle-type').value,
      vehicle_plate:       document.getElementById('create-plate').value.trim(),
      national_id:         document.getElementById('create-national-id').value.trim(),
      license_number:      document.getElementById('create-license-num').value.trim(),
      license_expiry:      document.getElementById('create-license-exp').value || null,
      delivery_percentage: Number(document.getElementById('create-percentage').value) || 80,
    };

    if (!data.user_id) {
      Utils.error('يجب اختيار مستخدم');
      return;
    }

    try {
      await API.adminCouriers.create(data);
      Utils.success('تم إنشاء المندوب');
      this.closeModal();
      this.loadStats();
      this.loadCouriers();
    } catch (err) { Utils.error(err.message); }
  },

  async openEditModal(courierId) {
    const c = this.state.selectedCourier;

    Utils.modal({
      title: '✏️ تعديل المندوب',
      size: 'modal-lg',
      body: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div class="form-group">
            <label>نوع المركبة</label>
            <select id="edit-vehicle-type">
              <option value="motorcycle" ${c.vehicle_type === 'motorcycle' ? 'selected' : ''}>🛵 دراجة نارية</option>
              <option value="car" ${c.vehicle_type === 'car' ? 'selected' : ''}>🚗 سيارة</option>
              <option value="bicycle" ${c.vehicle_type === 'bicycle' ? 'selected' : ''}>🚲 دراجة هوائية</option>
            </select>
          </div>
          <div class="form-group"><label>رقم اللوحة</label><input type="text" id="edit-plate" value="${Utils.escape(c.vehicle_plate || '')}"></div>
          <div class="form-group"><label>الهوية الوطنية</label><input type="text" id="edit-national-id" value="${Utils.escape(c.national_id || '')}"></div>
          <div class="form-group"><label>رقم الرخصة</label><input type="text" id="edit-license-num" value="${Utils.escape(c.license_number || '')}"></div>
          <div class="form-group"><label>انتهاء الرخصة</label><input type="date" id="edit-license-exp" value="${c.license_expiry ? new Date(c.license_expiry).toISOString().split('T')[0] : ''}"></div>
          <div class="form-group"><label>IBAN</label><input type="text" id="edit-iban" value="${Utils.escape(c.bank_account_iban || '')}" style="direction:ltr;"></div>
          <div class="form-group"><label>اسم صاحب الحساب</label><input type="text" id="edit-bank-holder" value="${Utils.escape(c.bank_account_holder || '')}"></div>
          <div class="form-group"><label>نسبة المندوب %</label><input type="number" id="edit-percentage" value="${c.delivery_percentage || 80}" min="0" max="100" step="0.5"></div>
          <div class="form-group" style="grid-column:1/-1;"><label>ملاحظات الإدارة</label><textarea id="edit-admin-notes" rows="2">${Utils.escape(c.admin_notes || '')}</textarea></div>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="edit-submit">حفظ التغييرات</button>
      `,
    });

    document.querySelector('[data-modal-close]').onclick = () => { this.closeModal(); this.openDetailModal(c.id); };
    document.getElementById('edit-submit').onclick = () => this.submitEdit(c.id);
  },

  async submitEdit(id) {
    const data = {
      vehicle_type:        document.getElementById('edit-vehicle-type').value,
      vehicle_plate:       document.getElementById('edit-plate').value.trim(),
      national_id:         document.getElementById('edit-national-id').value.trim(),
      license_number:      document.getElementById('edit-license-num').value.trim(),
      license_expiry:      document.getElementById('edit-license-exp').value || null,
      bank_account_iban:   document.getElementById('edit-iban').value.trim(),
      bank_account_holder: document.getElementById('edit-bank-holder').value.trim(),
      delivery_percentage: Number(document.getElementById('edit-percentage').value) || 80,
      admin_notes:         document.getElementById('edit-admin-notes').value.trim(),
    };

    try {
      await API.adminCouriers.update(id, data);
      Utils.success('تم الحفظ');
      this.closeModal();
      this.loadCouriers();
      this.openDetailModal(id);
    } catch (err) { Utils.error(err.message); }
  },

  async openPercentageModal(courierId) {
    const c = this.state.selectedCourier;
    Utils.modal({
      title: '💰 تعديل نسبة المندوب',
      size: 'modal-md',
      body: `
        <p class="text-sm text-muted" style="margin-bottom:12px;">النسبة الحالية: <strong>${Number(c.delivery_percentage || 80)}%</strong></p>
        <div class="form-group">
          <label>النسبة الجديدة % (0-100)</label>
          <input type="number" id="percentage-input" value="${c.delivery_percentage || 80}" min="0" max="100" step="0.5">
          <p class="text-sm text-muted" style="margin-top:6px;">هذه النسبة من رسوم التوصيل اللي بيستلمها المندوب</p>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="percentage-submit">حفظ</button>
      `,
    });
    document.querySelector('[data-modal-close]').onclick = () => { this.closeModal(); this.openDetailModal(courierId); };
    document.getElementById('percentage-submit').onclick = async () => {
      const val = Number(document.getElementById('percentage-input').value);
      try {
        await API.adminCouriers.setPercentage(courierId, val);
        Utils.success('تم حفظ النسبة');
        this.closeModal();
        this.openDetailModal(courierId);
        this.loadCouriers();
      } catch (err) { Utils.error(err.message); }
    };
  },

  // ── STYLES ───────────────────────────────────────────
  injectStyles() {
    if (document.getElementById('ac-page-styles')) return;
    const s = document.createElement('style');
    s.id = 'ac-page-styles';
    s.textContent = `
      .ac-page { padding: 0; }
      .ac-tabs {
        display: flex; gap: 4px;
        background: var(--bg-white);
        padding: 6px;
        border-radius: var(--radius-lg);
        margin-bottom: 14px;
        border: 1px solid var(--border);
        overflow-x: auto;
      }
      .ac-tab {
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
      .ac-tab:hover { color: var(--text); background: var(--bg-hover); }
      .ac-tab.active { background: #6c5ce7; color: white; }
      .ac-tab-count {
        margin-right: 6px;
        background: rgba(0,0,0,0.1);
        padding: 1px 7px;
        border-radius: 10px;
        font-size: 11px;
      }
      .ac-tab.active .ac-tab-count { background: rgba(255,255,255,0.3); }

      .ac-toolbar {
        display: flex; gap: 8px; flex-wrap: wrap;
        margin-bottom: 14px;
      }
      .ac-toolbar input[type="text"], .ac-toolbar select {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        font-family: var(--font);
        font-size: 13px;
      }
      .ac-toolbar input[type="text"] { flex: 1; min-width: 200px; }

      .ac-table { font-size: 13px; }
      .ac-table th { background: var(--bg-hover); }
      .ac-row:hover { background: var(--bg-hover); }
      .ac-courier-cell { display: flex; gap: 10px; align-items: center; }
      .ac-avatar {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6c5ce7, #5043a8);
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .ac-avatar-lg {
        width: 64px; height: 64px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6c5ce7, #5043a8);
        color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px;
        font-weight: 700;
        flex-shrink: 0;
      }

      .badge.status-pending_review { background: #FEF3C7; color: #92400E; }
      .badge.status-active         { background: #D1FAE5; color: #065F46; }
      .badge.status-suspended      { background: #FED7D7; color: #9B2C2C; }
      .badge.status-rejected       { background: #FECACA; color: #991B1B; }

      .badge.avail-online     { background: #D1FAE5; color: #065F46; }
      .badge.avail-offline    { background: #E5E7EB; color: #4B5563; }
      .badge.avail-delivering { background: #DBEAFE; color: #1E40AF; }

      .badge.order-pending     { background: #FEF3C7; color: #92400E; }
      .badge.order-accepted    { background: #DBEAFE; color: #1E40AF; }
      .badge.order-preparing   { background: #FED7AA; color: #9A3412; }
      .badge.order-ready_for_pickup { background: #C7D2FE; color: #3730A3; }
      .badge.order-courier_assigned { background: #BFDBFE; color: #1E3A8A; }
      .badge.order-picked_up { background: #BAE6FD; color: #0369A1; }
      .badge.order-delivered   { background: #D1FAE5; color: #065F46; }
      .badge.order-cancelled   { background: #FECACA; color: #991B1B; }

      .ac-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        padding: 10px 14px;
        background: var(--bg-white);
        border-radius: var(--radius);
      }

      .ac-detail-header {
        display: flex; gap: 14px; align-items: center;
        padding: 14px;
        background: var(--bg);
        border-radius: var(--radius-lg);
        margin-bottom: 14px;
      }
      .ac-detail-tabs {
        display: flex; gap: 4px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 14px;
        overflow-x: auto;
      }
      .ac-detail-tab {
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
      .ac-detail-tab:hover { color: var(--text); }
      .ac-detail-tab.active { color: #6c5ce7; border-bottom-color: #6c5ce7; }

      .ac-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 14px;
      }
      .ac-info-section {
        background: var(--bg);
        padding: 14px;
        border-radius: var(--radius);
      }
      .ac-info-title {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .ac-info-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 0;
        font-size: 13px;
        border-bottom: 1px solid var(--border);
      }
      .ac-info-row:last-child { border-bottom: none; }
      .ac-info-row span { color: var(--text-muted); }

      .ac-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
      }
      .ac-stat-card {
        background: var(--bg);
        padding: 14px;
        border-radius: var(--radius);
        text-align: center;
      }
      .ac-stat-label { font-size: 11px; color: var(--text-muted); }
      .ac-stat-value { font-size: 20px; font-weight: 700; margin-top: 4px; }

      .ac-timeline {
        position: relative;
        padding-right: 20px;
      }
      .ac-timeline::before {
        content: '';
        position: absolute;
        right: 6px; top: 0; bottom: 0;
        width: 2px;
        background: var(--border);
      }
      .ac-timeline-item {
        position: relative;
        padding: 8px 0;
      }
      .ac-timeline-dot {
        position: absolute;
        right: -14px; top: 12px;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #6c5ce7;
        border: 3px solid var(--bg-white);
      }
      .ac-timeline-dot.status-active    { background: #10B981; }
      .ac-timeline-dot.status-rejected  { background: #EF4444; }
      .ac-timeline-dot.status-suspended { background: #F59E0B; }
      .ac-timeline-content {
        padding: 10px 14px;
        background: var(--bg);
        border-radius: var(--radius);
      }
    `;
    document.head.appendChild(s);
  },

});

// Apply user management mixin
if (window.UserMgmtMixin && Router.routes && Router.routes['admin-couriers']) {
  Object.assign(Router.routes['admin-couriers'], window.UserMgmtMixin);
}
