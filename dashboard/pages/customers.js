/* ═══════════════════════════════════════════════════════════
   Page: Customers
   ═══════════════════════════════════════════════════════════ */

Router.register('customers', {

  state: { page: 1, search: '' },

  async render(container) {
    container.innerHTML = `
      <div class="filters">
        <input type="text" id="cust-search" placeholder="🔍 ابحث بالاسم أو الهاتف..." value="${Utils.escape(this.state.search)}">
      </div>
      <div id="customers-table"></div>
    `;

    const searchInput = document.getElementById('cust-search');
    const debouncedSearch = Utils.debounce(() => {
      this.state.search = searchInput.value;
      this.state.page = 1;
      this.loadTable();
    }, 400);
    searchInput.oninput = debouncedSearch;

    await this.loadTable();
  },

  async loadTable() {
    const wrap = document.getElementById('customers-table');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const { users } = await API.admin.listUsers({
        role: 'customer',
        page: this.state.page,
        limit: 50,
      });

      let filtered = users || [];
      if (this.state.search) {
        const q = this.state.search.toLowerCase();
        filtered = filtered.filter(u =>
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.phone || '').includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      }

      if (filtered.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا يوجد عملاء', this.state.search ? 'جرّب بحث آخر' : 'لسه مفيش عملاء', '👤');
        return;
      }

      const rows = filtered.map(u => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--info-bg);color:var(--info);display:flex;align-items:center;justify-content:center;font-weight:700;">
                ${(u.full_name || 'U')[0]}
              </div>
              <div>
                <div class="text-bold">${Utils.escape(u.full_name || '—')}</div>
                <div class="text-sm text-muted">${Utils.escape(u.phone || '')}</div>
              </div>
            </div>
          </td>
          <td class="text-sm">${Utils.escape(u.email || '—')}</td>
          <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? 'نشط' : 'موقوف'}</span></td>
          <td class="text-sm text-muted">${Utils.date(u.created_at)}</td>
          <td class="row-actions">
            ${u.is_active
              ? `<button class="btn btn-sm btn-danger" data-block="${u.id}">⏸️ إيقاف</button>`
              : `<button class="btn btn-sm btn-success" data-unblock="${u.id}">✅ تفعيل</button>`}
          </td>
        </tr>
      `).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>البريد</th>
                <th>الحالة</th>
                <th>التسجيل</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-block]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('هل تريد إيقاف هذا العميل؟', { danger: true });
          if (!confirmed) return;
          try {
            await API.admin.blockUser(btn.dataset.block);
            Utils.success('تم الإيقاف');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

      wrap.querySelectorAll('[data-unblock]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await API.admin.unblockUser(btn.dataset.unblock);
            Utils.success('تم التفعيل');
            this.loadTable();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

});
