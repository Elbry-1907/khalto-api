/* ═══════════════════════════════════════════════════════════
   Page: Coupons
   ═══════════════════════════════════════════════════════════ */

Router.register('coupons', {

  async render(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div></div>
        <button class="btn btn-primary" id="add-coupon-btn">+ كوبون جديد</button>
      </div>
      <div id="coupons-table"></div>
    `;

    document.getElementById('add-coupon-btn').onclick = () => this.showAdd();

    await this.loadTable();
  },

  async loadTable() {
    const wrap = document.getElementById('coupons-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const { coupons } = await API.coupons.list();

      if (!coupons || coupons.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد كوبونات', 'اضغط "كوبون جديد" لإنشاء كوبون', '🎁');
        return;
      }

      const rows = coupons.map(c => {
        const valueDisplay = c.type === 'percentage'
          ? `${c.value}%`
          : Utils.currency(c.value);
        const usagePct = c.usage_limit ? Math.round((c.usage_count || 0) / c.usage_limit * 100) : 0;
        return `
          <tr>
            <td><code style="background:var(--bg);padding:3px 8px;border-radius:4px;font-family:monospace;">${Utils.escape(c.code)}</code></td>
            <td><span class="badge ${c.type === 'percentage' ? 'badge-info' : 'badge-coral'}">${c.type === 'percentage' ? 'نسبة' : 'مبلغ'}</span></td>
            <td><strong>${valueDisplay}</strong></td>
            <td>${Utils.currency(c.min_order_amount)}</td>
            <td>${c.usage_count || 0}/${c.usage_limit || '∞'}</td>
            <td class="text-sm text-muted">${Utils.date(c.valid_until)}</td>
            <td><span class="badge ${c.is_active ? 'badge-success' : 'badge-gray'}">${c.is_active ? 'فعّال' : 'معطّل'}</span></td>
            <td class="row-actions">
              <button class="btn btn-sm btn-secondary" data-toggle="${c.id}" data-active="${c.is_active}">
                ${c.is_active ? '⏸️' : '▶️'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>النوع</th>
                <th>القيمة</th>
                <th>الحد الأدنى</th>
                <th>الاستخدام</th>
                <th>ينتهي في</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.onclick = async () => {
          const isActive = btn.dataset.active === 'true';
          try {
            await API.coupons.update(btn.dataset.toggle, { is_active: !isActive });
            Utils.success(isActive ? 'تم التعطيل' : 'تم التفعيل');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  showAdd() {
    const today = new Date().toISOString().slice(0, 10);
    const monthLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label>كود الكوبون *</label>
          <input type="text" id="c-code" placeholder="SUMMER10" style="text-transform:uppercase;">
        </div>
        <div class="form-group">
          <label>نوع الخصم</label>
          <select id="c-type">
            <option value="percentage">نسبة مئوية %</option>
            <option value="fixed_amount">مبلغ ثابت</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>قيمة الخصم *</label>
          <input type="number" id="c-value" step="0.01" placeholder="10">
        </div>
        <div class="form-group">
          <label>الحد الأقصى للخصم</label>
          <input type="number" id="c-max" step="0.01" placeholder="50">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>الحد الأدنى للطلب</label>
          <input type="number" id="c-min" step="0.01" value="0">
        </div>
        <div class="form-group">
          <label>الحد الأقصى للاستخدام</label>
          <input type="number" id="c-limit" placeholder="1000">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>صالح من *</label>
          <input type="date" id="c-from" value="${today}">
        </div>
        <div class="form-group">
          <label>صالح حتى</label>
          <input type="date" id="c-until" value="${monthLater}">
        </div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="save-coupon">✅ إنشاء الكوبون</button>
    `;

    const { close } = Utils.modal({ title: '🎁 كوبون جديد', body, footer, size: 'modal-lg' });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('save-coupon').onclick = async () => {
      const btn = document.getElementById('save-coupon');

      const code = document.getElementById('c-code').value.trim().toUpperCase();
      const value = parseFloat(document.getElementById('c-value').value);
      const validFrom = document.getElementById('c-from').value;

      if (!code || !value || !validFrom) {
        Utils.error('الحقول المطلوبة ناقصة');
        return;
      }

      btn.disabled = true;
      try {
        await API.coupons.create({
          code,
          type: document.getElementById('c-type').value,
          value,
          min_order_amount: parseFloat(document.getElementById('c-min').value) || 0,
          max_discount: parseFloat(document.getElementById('c-max').value) || null,
          usage_limit: parseInt(document.getElementById('c-limit').value) || null,
          per_user_limit: 1,
          valid_from: validFrom,
          valid_until: document.getElementById('c-until').value || null,
        });
        Utils.success('تم إنشاء الكوبون');
        close();
        this.loadTable();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

});
