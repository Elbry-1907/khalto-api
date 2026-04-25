/* ═══════════════════════════════════════════════════════════
   Page: Settlements
   ═══════════════════════════════════════════════════════════ */

Router.register('settlements', {

  state: { filter: 'all' },

  async render(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div class="filters" style="margin-bottom:0;">
          <button class="filter-chip ${this.state.filter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
          <button class="filter-chip ${this.state.filter === 'pending' ? 'active' : ''}" data-filter="pending">معلّق</button>
          <button class="filter-chip ${this.state.filter === 'approved' ? 'active' : ''}" data-filter="approved">معتمد</button>
        </div>
        <button class="btn btn-primary" id="new-settlement-btn">+ إنشاء دفعة تسوية</button>
      </div>
      <div id="settlements-table"></div>
    `;

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.onclick = () => {
        this.state.filter = chip.dataset.filter;
        this.render(container);
      };
    });

    document.getElementById('new-settlement-btn').onclick = () => this.showRunModal();

    await this.loadTable();
  },

  async loadTable() {
    const wrap = document.getElementById('settlements-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const params = { limit: 50 };
      if (this.state.filter !== 'all') params.status = this.state.filter;

      const { settlements } = await API.settlements.list(params);

      if (!settlements || settlements.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد تسويات', 'اضغط "إنشاء دفعة تسوية" للبدء', '💰');
        return;
      }

      const rows = settlements.map(s => `
        <tr>
          <td>
            <span class="badge ${s.recipient_type === 'chef' ? 'badge-coral' : 'badge-info'}">
              ${s.recipient_type === 'chef' ? '🍳 شيف' : '🛵 مندوب'}
            </span>
          </td>
          <td class="text-sm">${Utils.date(s.period_start)} ← ${Utils.date(s.period_end)}</td>
          <td><strong>${Utils.number(s.order_count)}</strong></td>
          <td>${Utils.currency(s.gross_amount, s)}</td>
          <td><strong class="text-success">${Utils.currency(s.net_amount, s)}</strong></td>
          <td>${Utils.statusBadge(s.status)}</td>
          <td class="row-actions">
            ${s.status === 'pending' ? `<button class="btn btn-sm btn-success" data-approve="${s.id}">✅ اعتماد</button>` : ''}
          </td>
        </tr>
      `).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>النوع</th>
                <th>الفترة</th>
                <th>الطلبات</th>
                <th>الإجمالي</th>
                <th>الصافي</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-approve]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('هل تريد اعتماد هذه التسوية؟');
          if (!confirmed) return;
          try {
            await API.settlements.approve(btn.dataset.approve);
            Utils.success('تم الاعتماد');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  showRunModal() {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const body = `
      <p class="text-muted text-sm mb-4">التسوية هتتحسب تلقائياً من الطلبات المكتملة اللي لسه ما اتسوّتش.</p>
      <div class="form-group">
        <label>النوع</label>
        <select id="r-type">
          <option value="chef">🍳 شيف</option>
          <option value="courier">🛵 مندوب</option>
        </select>
      </div>
      <div class="form-row mt-4">
        <div class="form-group">
          <label>من تاريخ</label>
          <input type="date" id="r-from" value="${weekAgo}">
        </div>
        <div class="form-group">
          <label>إلى تاريخ</label>
          <input type="date" id="r-to" value="${today}">
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="run-btn">✅ إنشاء الدفعة</button>
    `;

    const { close } = Utils.modal({ title: '💰 إنشاء دفعة تسوية', body, footer });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('run-btn').onclick = async () => {
      const btn = document.getElementById('run-btn');
      btn.disabled = true;
      try {
        const result = await API.settlements.run({
          recipient_type: document.getElementById('r-type').value,
          period_start: document.getElementById('r-from').value,
          period_end: document.getElementById('r-to').value,
        });
        Utils.success(result.message || 'تم إنشاء الدفعة');
        close();
        this.loadTable();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

});
