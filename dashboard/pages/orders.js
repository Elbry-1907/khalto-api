/* ═══════════════════════════════════════════════════════════
   Page: Orders
   ═══════════════════════════════════════════════════════════ */

Router.register('orders', {

  state: {
    filter: 'all',
    page: 1,
  },

  async render(container) {
    container.innerHTML = `
      <div class="filters">
        <button class="filter-chip ${this.state.filter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-chip ${this.state.filter === 'pending_payment' ? 'active' : ''}" data-filter="pending_payment">بانتظار الدفع</button>
        <button class="filter-chip ${this.state.filter === 'awaiting_acceptance' ? 'active' : ''}" data-filter="awaiting_acceptance">بانتظار القبول</button>
        <button class="filter-chip ${this.state.filter === 'preparing' ? 'active' : ''}" data-filter="preparing">قيد التحضير</button>
        <button class="filter-chip ${this.state.filter === 'delivered' ? 'active' : ''}" data-filter="delivered">مُسلّم</button>
        <button class="filter-chip ${this.state.filter === 'cancelled' ? 'active' : ''}" data-filter="cancelled">ملغي</button>
      </div>
      <div id="orders-table"></div>
    `;

    // Wire filter chips
    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        this.state.filter = chip.dataset.filter;
        this.state.page = 1;
        this.render(container);
      };
    });

    await this.loadTable();
  },

  async loadTable() {
    const wrap = document.getElementById('orders-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const params = { page: this.state.page, limit: 20 };
      if (this.state.filter !== 'all') params.status = this.state.filter;

      const { orders, total } = await API.admin.listOrders(params);

      if (!orders || orders.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد طلبات', 'هتظهر هنا لما يبدأ العملاء يطلبوا');
        return;
      }

      const rows = orders.map(o => `
        <tr>
          <td><strong>${o.order_number || o.id.slice(0, 8)}</strong></td>
          <td>${Utils.escape(o.customer_name || '—')}<br><small class="text-muted">${Utils.escape(o.customer_phone || '')}</small></td>
          <td>${Utils.escape(o.kitchen_name || '—')}</td>
          <td><strong>${Utils.currency(o.total_amount, o)}</strong></td>
          <td>${Utils.statusBadge(o.status)}</td>
          <td class="text-sm text-muted">${Utils.timeAgo(o.created_at)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-view="${o.id}">عرض</button>
          </td>
        </tr>
      `).join('');

      const totalPages = Math.ceil((total || 0) / 20);

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العميل</th>
                <th>المطبخ</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>الوقت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${Utils.paginationHTML(this.state.page, totalPages, (p) => { this.state.page = p; this.loadTable(); })}
      `;

      // Wire up view buttons
      wrap.querySelectorAll('[data-view]').forEach(btn => {
        btn.onclick = () => this.showDetails(btn.dataset.view);
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  async showDetails(orderId) {
    try {
      const { order } = await API.orders.get(orderId);

      const itemsHTML = (order.items || []).map(i => `
        <tr>
          <td>${Utils.escape(i.name_snapshot || '—')}</td>
          <td class="text-center">${i.quantity}×</td>
          <td>${Utils.currency(i.price_snapshot, order)}</td>
          <td><strong>${Utils.currency(i.subtotal, order)}</strong></td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="text-center text-muted">لا توجد عناصر</td></tr>`;

      const statusLogHTML = (order.status_log || []).map(log => `
        <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light);">
          <div style="flex:1;">
            <div class="text-sm">${log.from_status ? Utils.statusLabel(log.from_status) + ' ← ' : ''}<strong>${Utils.statusLabel(log.to_status)}</strong></div>
            ${log.note ? `<div class="text-sm text-muted mt-2">${Utils.escape(log.note)}</div>` : ''}
          </div>
          <div class="text-sm text-muted">${Utils.timeAgo(log.created_at)}</div>
        </div>
      `).join('') || '<p class="text-muted text-center">لا يوجد سجل</p>';

      const validTransitions = this.getValidTransitions(order.status);
      const statusOptionsHTML = validTransitions.map(s =>
        `<option value="${s}">${Utils.statusLabel(s)}</option>`
      ).join('');

      const body = `
        <div class="form-row">
          <div>
            <div class="text-sm text-muted">رقم الطلب</div>
            <div class="text-bold">${order.order_number}</div>
          </div>
          <div>
            <div class="text-sm text-muted">الحالة</div>
            <div>${Utils.statusBadge(order.status)}</div>
          </div>
        </div>

        <div class="form-row mt-4">
          <div>
            <div class="text-sm text-muted">العميل</div>
            <div>${Utils.escape(order.customer_name)}<br><small>${Utils.escape(order.customer_phone || '')}</small></div>
          </div>
          <div>
            <div class="text-sm text-muted">المطبخ</div>
            <div>${Utils.escape(order.kitchen_name)}</div>
          </div>
        </div>

        <div class="mt-4">
          <div class="text-sm text-muted mb-2">عنوان التوصيل</div>
          <div>${Utils.escape(order.delivery_address || '—')}</div>
        </div>

        <h4 class="mt-4 mb-2" style="font-size:14px;">الأصناف</h4>
        <table class="table" style="font-size:13px;">
          <thead>
            <tr><th>الصنف</th><th class="text-center">الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>

        <div style="background:var(--bg);padding:12px;border-radius:var(--radius);margin-top:16px;">
          <div class="flex justify-between mb-2"><span class="text-muted">المجموع الفرعي</span><span>${Utils.currency(order.subtotal, order)}</span></div>
          <div class="flex justify-between mb-2"><span class="text-muted">رسوم التوصيل</span><span>${Utils.currency(order.delivery_fee, order)}</span></div>
          ${order.discount_amount > 0 ? `<div class="flex justify-between mb-2 text-success"><span>الخصم</span><span>-${Utils.currency(order.discount_amount, order)}</span></div>` : ''}
          <div class="flex justify-between mb-2"><span class="text-muted">الضريبة</span><span>${Utils.currency(order.tax_amount, order)}</span></div>
          <div class="flex justify-between" style="padding-top:8px;border-top:1px solid var(--border);"><strong>الإجمالي</strong><strong>${Utils.currency(order.total_amount, order)}</strong></div>
        </div>

        ${validTransitions.length > 0 ? `
          <h4 class="mt-4 mb-2" style="font-size:14px;">تغيير الحالة</h4>
          <div class="form-row">
            <div class="form-group">
              <select id="new-status">
                <option value="">-- اختر الحالة --</option>
                ${statusOptionsHTML}
              </select>
            </div>
            <div class="form-group">
              <input type="text" id="status-note" placeholder="ملاحظة (اختياري)">
            </div>
          </div>
        ` : ''}

        <h4 class="mt-4 mb-2" style="font-size:14px;">📜 سجل الحالات</h4>
        <div>${statusLogHTML}</div>
      `;

      const footer = validTransitions.length > 0 ? `
        <button class="btn btn-secondary" data-modal-close>إغلاق</button>
        <button class="btn btn-primary" id="update-status-btn">💾 تحديث الحالة</button>
      ` : `<button class="btn btn-secondary" data-modal-close>إغلاق</button>`;

      const { close } = Utils.modal({
        title: `📋 تفاصيل الطلب ${order.order_number}`,
        body,
        footer,
        size: 'modal-lg',
      });

      document.querySelector('[data-modal-close]').onclick = close;

      const updateBtn = document.getElementById('update-status-btn');
      if (updateBtn) {
        updateBtn.onclick = async () => {
          const newStatus = document.getElementById('new-status').value;
          const note = document.getElementById('status-note').value;
          if (!newStatus) {
            Utils.error('الرجاء اختيار حالة');
            return;
          }
          try {
            updateBtn.disabled = true;
            await API.orders.updateStatus(order.id, newStatus, note);
            Utils.success('تم تحديث الحالة');
            close();
            this.loadTable();
          } catch (err) {
            Utils.error(err.message);
            updateBtn.disabled = false;
          }
        };
      }

    } catch (err) {
      Utils.error(err.message);
    }
  },

  getValidTransitions(currentStatus) {
    const transitions = {
      pending_payment:    ['paid', 'cancelled'],
      paid:               ['awaiting_acceptance', 'cancelled', 'refunded'],
      awaiting_acceptance:['accepted', 'cancelled'],
      accepted:           ['preparing', 'cancelled'],
      preparing:          ['ready_for_pickup', 'cancelled'],
      ready_for_pickup:   ['courier_assigned', 'picked_up'],
      courier_assigned:   ['picked_up', 'cancelled'],
      picked_up:          ['delivered'],
      delivered:          [],
      cancelled:          ['refunded'],
      refunded:           [],
    };
    return transitions[currentStatus] || [];
  },

});
