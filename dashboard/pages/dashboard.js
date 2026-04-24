/* ═══════════════════════════════════════════════════════════
   Page: Dashboard Home
   ═══════════════════════════════════════════════════════════ */

Router.register('dashboard', {

  async render(container) {
    try {
      const { kpis, charts } = await API.dashboard.stats();

      const maxCount = Math.max(...(charts.last_7_days || []).map(d => parseInt(d.count) || 0), 1);

      container.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon coral">📋</div>
            <div class="kpi-content">
              <div class="kpi-label">طلبات اليوم</div>
              <div class="kpi-value">${Utils.number(kpis.orders_today)}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon green">💰</div>
            <div class="kpi-content">
              <div class="kpi-label">إيرادات اليوم</div>
              <div class="kpi-value">${Utils.currency(kpis.gmv_today)}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon blue">🍳</div>
            <div class="kpi-content">
              <div class="kpi-label">مطابخ نشطة</div>
              <div class="kpi-value">${Utils.number(kpis.active_kitchens)}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon purple">🛵</div>
            <div class="kpi-content">
              <div class="kpi-label">مندوبين متصلين</div>
              <div class="kpi-value">${Utils.number(kpis.online_couriers)}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon amber">⏳</div>
            <div class="kpi-content">
              <div class="kpi-label">تسويات معلّقة</div>
              <div class="kpi-value">${Utils.currency(kpis.pending_settlements)}</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon red">🎧</div>
            <div class="kpi-content">
              <div class="kpi-label">تذاكر مفتوحة</div>
              <div class="kpi-value">${Utils.number(kpis.open_tickets)}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 الطلبات آخر 7 أيام</div>
          </div>
          ${this.renderChart(charts.last_7_days || [], maxCount)}
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">🚀 إجراءات سريعة</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
            <button class="btn btn-secondary" data-quick="orders">📋 مراجعة الطلبات</button>
            <button class="btn btn-secondary" data-quick="kitchens">🍳 إدارة المطابخ</button>
            <button class="btn btn-secondary" data-quick="couriers">🛵 إدارة المندوبين</button>
            <button class="btn btn-secondary" data-quick="settlements">💰 التسويات</button>
            <button class="btn btn-secondary" data-quick="coupons">🎁 كوبون جديد</button>
            <button class="btn btn-secondary" data-quick="notifications">🔔 إرسال إشعار</button>
          </div>
        </div>
      `;

      // Wire up quick action buttons
      container.querySelectorAll('[data-quick]').forEach(btn => {
        btn.onclick = () => Router.navigate(btn.dataset.quick);
      });

    } catch (err) {
      container.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderChart(data, maxCount) {
    if (!data || data.length === 0) {
      return Utils.emptyHTML('لا توجد بيانات', 'الرسم البياني هيظهر لما يكون في طلبات');
    }

    // Simple CSS bar chart
    const bars = data.map(d => {
      const count = parseInt(d.count) || 0;
      const height = Math.max(4, (count / maxCount) * 180);
      const date = new Date(d.date).toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric' });
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:1;">
          <div style="font-size:12px;font-weight:600;color:var(--text);">${count}</div>
          <div style="
            width: 100%;
            max-width: 50px;
            height: ${height}px;
            background: linear-gradient(to top, var(--coral), var(--coral-dark));
            border-radius: 4px 4px 0 0;
            transition: all 0.3s;
          "></div>
          <div style="font-size:11px;color:var(--text-muted);">${date}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="display:flex;align-items:flex-end;gap:12px;height:240px;padding:10px 0;">
        ${bars}
      </div>
    `;
  },

});
