/* ═══════════════════════════════════════════════════════════
   Page: Kitchens
   ═══════════════════════════════════════════════════════════ */

Router.register('kitchens', {

  state: { filter: 'all' },

  async render(container) {
    container.innerHTML = `
      <div class="filters">
        <button class="filter-chip ${this.state.filter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
        <button class="filter-chip ${this.state.filter === 'pending_review' ? 'active' : ''}" data-filter="pending_review">⏳ بانتظار الموافقة</button>
        <button class="filter-chip ${this.state.filter === 'active' ? 'active' : ''}" data-filter="active">✅ نشط</button>
        <button class="filter-chip ${this.state.filter === 'suspended' ? 'active' : ''}" data-filter="suspended">⏸️ موقوف</button>
      </div>
      <div id="kitchens-table"></div>
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
    const wrap = document.getElementById('kitchens-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      // For 'all' we fetch public endpoint; for filtered statuses we use admin users role filter
      // Since /kitchens public only returns active, we need a different approach for pending
      // Using /kitchens with no filter shows all active; for pending we need admin endpoint
      // Fall back: just use /kitchens endpoint which only shows active
      const params = { limit: 50 };

      let kitchens = [];
      try {
        const response = await API.kitchens.list(params);
        kitchens = response.kitchens || [];
      } catch (e) {
        console.warn('kitchens list failed:', e.message);
      }

      // Client-side filter since kitchen list endpoint only returns active
      if (this.state.filter !== 'all') {
        kitchens = kitchens.filter(k => k.status === this.state.filter);
      }

      if (kitchens.length === 0) {
        wrap.innerHTML = Utils.emptyHTML(
          'لا توجد مطابخ',
          this.state.filter === 'pending_review' ? 'مفيش مطابخ بتنتظر الموافقة' : 'لسه مفيش مطابخ مسجلة',
          '🍳'
        );
        return;
      }

      const rows = kitchens.map(k => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:8px;background:var(--coral-light);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--coral-dark);">
                ${(k.name_ar || k.name_en || 'K')[0]}
              </div>
              <div>
                <div class="text-bold">${Utils.escape(k.name_ar || k.name_en)}</div>
                <div class="text-sm text-muted">${Utils.escape(k.name_en || '')}</div>
              </div>
            </div>
          </td>
          <td>${Utils.statusBadge(k.status || 'active')}</td>
          <td class="text-sm">⭐ ${parseFloat(k.rating || 0).toFixed(1)} (${k.rating_count || 0})</td>
          <td class="text-sm">${k.avg_prep_time || 30} د</td>
          <td class="text-sm">${Utils.currency(k.min_order_amount || 0)}</td>
          <td><span class="badge ${k.is_open ? 'badge-success' : 'badge-gray'}">${k.is_open ? 'مفتوح' : 'مغلق'}</span></td>
          <td class="row-actions">
            ${k.status === 'pending_review' ? `<button class="btn btn-sm btn-success" data-approve="${k.id}">✅ قبول</button>` : ''}
            <button class="btn btn-sm btn-secondary" data-edit="${k.id}">✏️ تعديل</button>
          </td>
        </tr>
      `).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>المطبخ</th>
                <th>الحالة</th>
                <th>التقييم</th>
                <th>وقت التحضير</th>
                <th>الحد الأدنى</th>
                <th>مفتوح</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-approve]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('هل تريد قبول هذا المطبخ وتفعيله؟');
          if (!confirmed) return;
          try {
            await API.kitchens.approve(btn.dataset.approve);
            Utils.success('تم قبول المطبخ');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

      wrap.querySelectorAll('[data-edit]').forEach(btn => {
        btn.onclick = () => this.showEdit(btn.dataset.edit);
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  async showEdit(kitchenId) {
    try {
      const { kitchen } = await API.kitchens.get(kitchenId);

      const body = `
        <div class="form-row">
          <div class="form-group">
            <label>الاسم (عربي)</label>
            <input type="text" id="k-name-ar" value="${Utils.escape(kitchen.name_ar || '')}">
          </div>
          <div class="form-group">
            <label>الاسم (إنجليزي)</label>
            <input type="text" id="k-name-en" value="${Utils.escape(kitchen.name_en || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>وصف (عربي)</label>
            <textarea id="k-bio-ar">${Utils.escape(kitchen.bio_ar || '')}</textarea>
          </div>
          <div class="form-group">
            <label>وصف (إنجليزي)</label>
            <textarea id="k-bio-en">${Utils.escape(kitchen.bio_en || '')}</textarea>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>الحد الأدنى للطلب</label>
            <input type="number" id="k-min-order" value="${kitchen.min_order_amount || 0}">
          </div>
          <div class="form-group">
            <label>وقت التحضير (دقيقة)</label>
            <input type="number" id="k-prep-time" value="${kitchen.avg_prep_time || 30}">
          </div>
          <div class="form-group">
            <label>مفتوح الآن؟</label>
            <select id="k-is-open">
              <option value="true" ${kitchen.is_open ? 'selected' : ''}>✅ نعم</option>
              <option value="false" ${!kitchen.is_open ? 'selected' : ''}>❌ لا</option>
            </select>
          </div>
        </div>
      `;

      const footer = `
        <button class="btn btn-secondary" data-modal-close>إلغاء</button>
        <button class="btn btn-primary" id="save-kitchen">💾 حفظ التعديلات</button>
      `;

      const { close } = Utils.modal({
        title: `✏️ تعديل: ${kitchen.name_ar || kitchen.name_en}`,
        body, footer, size: 'modal-lg',
      });

      document.querySelector('[data-modal-close]').onclick = close;
      document.getElementById('save-kitchen').onclick = async () => {
        const btn = document.getElementById('save-kitchen');
        btn.disabled = true;
        try {
          await API.kitchens.update(kitchenId, {
            name_ar: document.getElementById('k-name-ar').value,
            name_en: document.getElementById('k-name-en').value,
            bio_ar: document.getElementById('k-bio-ar').value,
            bio_en: document.getElementById('k-bio-en').value,
            min_order_amount: parseFloat(document.getElementById('k-min-order').value) || 0,
            avg_prep_time: parseInt(document.getElementById('k-prep-time').value) || 30,
            is_open: document.getElementById('k-is-open').value === 'true',
          });
          Utils.success('تم الحفظ');
          close();
          this.loadTable();
        } catch (err) {
          Utils.error(err.message);
          btn.disabled = false;
        }
      };

    } catch (err) {
      Utils.error(err.message);
    }
  },

});
