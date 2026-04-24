/* ═══════════════════════════════════════════════════════════
   Page: Commission
   ═══════════════════════════════════════════════════════════ */

Router.register('commission', {

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">📈 قواعد العمولة</div>
          <button class="btn btn-primary btn-sm" id="add-rule-btn">+ إضافة قاعدة</button>
        </div>
        <div id="rules-container">${Utils.loadingHTML()}</div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🧮 حاسبة عمولة الشيف</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>قيمة الطلب (SAR)</label>
            <input type="number" id="calc-amount" placeholder="100" step="0.01">
          </div>
          <div class="form-group">
            <label>&nbsp;</label>
            <button class="btn btn-primary" id="calc-btn">احسب العمولة</button>
          </div>
        </div>
        <div id="calc-result"></div>
      </div>
    `;

    document.getElementById('add-rule-btn').onclick = () => this.showAddRule();
    document.getElementById('calc-btn').onclick = () => this.calculate();

    await this.loadRules();
  },

  async loadRules() {
    const wrap = document.getElementById('rules-container');
    if (!wrap) return;

    try {
      const { rules } = await API.commission.listRules();

      if (!rules || rules.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا توجد قواعد', 'اضغط "إضافة قاعدة" للبدء', '📈');
        return;
      }

      const rows = rules.map(r => `
        <tr>
          <td><strong>${Utils.escape(r.name)}</strong></td>
          <td><span class="badge badge-info">${r.rule_type}</span></td>
          <td>${r.value}${r.unit === 'percentage' ? '%' : ''}</td>
          <td class="text-sm text-muted">${r.condition || '—'}</td>
          <td>${r.priority}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-danger" data-delete="${r.id}">🗑️</button>
          </td>
        </tr>
      `).join('');

      wrap.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>النوع</th>
              <th>القيمة</th>
              <th>الشرط</th>
              <th>الأولوية</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      wrap.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('هل تريد حذف هذه القاعدة؟', { danger: true });
          if (!confirmed) return;
          try {
            await API.commission.deleteRule(btn.dataset.delete);
            Utils.success('تم الحذف');
            this.loadRules();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  showAddRule() {
    const body = `
      <div class="form-group">
        <label>اسم القاعدة</label>
        <input type="text" id="rule-name" placeholder="مثال: عمولة عالية للمطابخ الجديدة">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>نوع القاعدة</label>
          <select id="rule-type">
            <option value="chef_commission">عمولة الشيف</option>
            <option value="delivery_fee">رسوم التوصيل</option>
            <option value="courier_payout">دفعة المندوب</option>
          </select>
        </div>
        <div class="form-group">
          <label>الوحدة</label>
          <select id="rule-unit">
            <option value="percentage">نسبة مئوية %</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>القيمة</label>
          <input type="number" id="rule-value" step="0.01" placeholder="15">
        </div>
        <div class="form-group">
          <label>الأولوية (أقل = أعلى)</label>
          <input type="number" id="rule-priority" value="10">
        </div>
      </div>
      <div class="form-group">
        <label>الشرط (اختياري)</label>
        <input type="text" id="rule-condition" placeholder="مثال: rating < 4">
        <div class="form-help">يمكن استخدام: rating > 4, category == breakfast</div>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="save-rule">✅ إضافة القاعدة</button>
    `;

    const { close } = Utils.modal({ title: '📈 قاعدة عمولة جديدة', body, footer });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('save-rule').onclick = async () => {
      const btn = document.getElementById('save-rule');
      btn.disabled = true;
      try {
        await API.commission.addRule({
          name: document.getElementById('rule-name').value,
          rule_type: document.getElementById('rule-type').value,
          unit: document.getElementById('rule-unit').value,
          value: parseFloat(document.getElementById('rule-value').value) || 0,
          priority: parseInt(document.getElementById('rule-priority').value) || 10,
          condition: document.getElementById('rule-condition').value || null,
        });
        Utils.success('تم إضافة القاعدة');
        close();
        this.loadRules();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

  async calculate() {
    const amount = parseFloat(document.getElementById('calc-amount').value);
    const resultEl = document.getElementById('calc-result');

    if (!amount || amount <= 0) {
      resultEl.innerHTML = '<div class="error-msg">الرجاء إدخال قيمة صحيحة</div>';
      return;
    }

    resultEl.innerHTML = Utils.loadingHTML();

    try {
      const { breakdown } = await API.commission.calcChef({ order_total: amount });

      resultEl.innerHTML = `
        <div style="background:var(--bg);padding:16px;border-radius:var(--radius);margin-top:16px;">
          <div class="flex justify-between mb-2"><span>إجمالي الطلب</span><strong>${Utils.currency(breakdown.order_total)}</strong></div>
          <div class="flex justify-between mb-2 text-muted"><span>العمولة (${breakdown.commission_pct}%)</span><span>-${Utils.currency(breakdown.commission)}</span></div>
          <div class="flex justify-between mb-2 text-muted"><span>رسوم الدفع</span><span>-${Utils.currency(breakdown.payment_fee)}</span></div>
          <div class="flex justify-between mb-2 text-muted"><span>VAT على العمولة</span><span>-${Utils.currency(breakdown.vat_on_commission)}</span></div>
          <div class="flex justify-between" style="padding-top:10px;border-top:2px solid var(--border);">
            <strong>صافي الشيف</strong>
            <strong class="text-success text-lg">${Utils.currency(breakdown.chef_net)}</strong>
          </div>
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
  },

});
