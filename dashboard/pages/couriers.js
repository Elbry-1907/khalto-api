/* ═══════════════════════════════════════════════════════════
   Page: Couriers
   ═══════════════════════════════════════════════════════════ */

Router.register('couriers', {

  state: { filter: 'all' },

  async render(container) {
    container.innerHTML = `
      <div class="filters">
        <button class="filter-chip ${this.state.filter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-chip ${this.state.filter === 'pending_review' ? 'active' : ''}" data-filter="pending_review">⏳ بانتظار الموافقة</button>
        <button class="filter-chip ${this.state.filter === 'active' ? 'active' : ''}" data-filter="active">✅ نشط</button>
        <button class="filter-chip ${this.state.filter === 'suspended' ? 'active' : ''}" data-filter="suspended">⏸️ موقوف</button>
      </div>
      <div id="couriers-table"></div>
    `;

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        this.state.filter = chip.dataset.filter;
        this.render(container);
      };
    });

    await this.loadTable();
  },

  async loadTable() {
    const wrap = document.getElementById('couriers-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const params = { limit: 50 };
      if (this.state.filter !== 'all') params.status = this.state.filter;

      const { couriers } = await API.couriers.list(params);

      if (!couriers || couriers.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا يوجد مندوبين', '', '🛵');
        return;
      }

      const rows = couriers.map(c => {
        const vehicleIcons = { motorcycle: '🏍️', car: '🚗', bicycle: '🚲' };
        const vehicleIcon = vehicleIcons[c.vehicle_type] || '🚗';
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--coral);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;">
                  ${(c.full_name || 'C')[0]}
                </div>
                <div>
                  <div class="text-bold">${Utils.escape(c.full_name || '—')}</div>
                  <div class="text-sm text-muted">${Utils.escape(c.phone || '')}</div>
                </div>
              </div>
            </td>
            <td>${Utils.statusBadge(c.status)}</td>
            <td>${vehicleIcon} ${Utils.escape(c.vehicle_type || '—')}<br><small class="text-muted">${Utils.escape(c.vehicle_plate || '')}</small></td>
            <td>${Utils.escape(c.city_name || '—')}</td>
            <td>${Utils.statusBadge(c.availability || 'offline')}</td>
            <td class="row-actions">
              ${c.status === 'pending_review' ? `<button class="btn btn-sm btn-success" data-approve="${c.id}">✅ قبول</button>` : ''}
            </td>
          </tr>
        `;
      }).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>المندوب</th>
                <th>الحالة</th>
                <th>المركبة</th>
                <th>المدينة</th>
                <th>التوفر</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-approve]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('هل تريد قبول هذا المندوب وتفعيله؟');
          if (!confirmed) return;
          try {
            await API.couriers.approve(btn.dataset.approve);
            Utils.success('تم قبول المندوب');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

});
