/* ═══════════════════════════════════════════════════════════
   Page: Team & Permissions
   ═══════════════════════════════════════════════════════════ */

Router.register('team', {

  async render(container) {
    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <div id="team-stats"></div>
        <button class="btn btn-primary" id="add-member-btn">+ إضافة عضو</button>
      </div>

      <div id="team-list">${Utils.loadingHTML()}</div>

      <div class="card mt-4">
        <div class="card-header">
          <div class="card-title">🔐 مصفوفة الصلاحيات</div>
        </div>
        ${this.permissionsMatrix()}
      </div>
    `;

    document.getElementById('add-member-btn').onclick = () => this.showAdd();

    await this.load();
  },

  async load() {
    const wrap = document.getElementById('team-list');
    const stats = document.getElementById('team-stats');
    if (!wrap) return;

    try {
      // Fetch all admin roles in parallel
      const roles = ['super_admin', 'operations', 'finance', 'customer_service', 'marketing'];
      const results = await Promise.all(
        roles.map(r => API.admin.listUsers({ role: r, limit: 100 }).catch(() => ({ users: [] })))
      );

      const allMembers = results.flatMap(r => r.users || []);

      stats.innerHTML = `<div class="text-muted">${allMembers.length} عضو</div>`;

      if (allMembers.length === 0) {
        wrap.innerHTML = Utils.emptyHTML('لا يوجد أعضاء', 'اضغط "إضافة عضو" لإضافة أول عضو', '👥');
        return;
      }

      const rows = allMembers.map(u => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--coral);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;">
                ${(u.full_name || 'U')[0]}
              </div>
              <div>
                <div class="text-bold">${Utils.escape(u.full_name || '—')}</div>
                <div class="text-sm text-muted">${Utils.escape(u.phone || '')}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-coral">${Utils.roleLabel(u.role)}</span></td>
          <td class="text-sm">${Utils.escape(u.email || '—')}</td>
          <td><span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">${u.is_active ? 'نشط' : 'موقوف'}</span></td>
          <td class="text-sm text-muted">${Utils.date(u.created_at)}</td>
          <td class="row-actions">
            ${u.is_active
              ? `<button class="btn btn-sm btn-danger" data-block="${u.id}">⏸️</button>`
              : `<button class="btn btn-sm btn-success" data-unblock="${u.id}">▶️</button>`}
            <button class="btn btn-sm btn-danger" data-delete="${u.id}">🗑️</button>
          </td>
        </tr>
      `).join('');

      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>العضو</th>
                <th>الدور</th>
                <th>البريد</th>
                <th>الحالة</th>
                <th>تاريخ الإضافة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;

      wrap.querySelectorAll('[data-block]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('إيقاف هذا العضو؟', { danger: true });
          if (!confirmed) return;
          try {
            await API.admin.blockUser(btn.dataset.block);
            Utils.success('تم الإيقاف');
            this.load();
          } catch (err) { Utils.error(err.message); }
        };
      });

      wrap.querySelectorAll('[data-unblock]').forEach(btn => {
        btn.onclick = async () => {
          try {
            await API.admin.unblockUser(btn.dataset.unblock);
            Utils.success('تم التفعيل');
            this.load();
          } catch (err) { Utils.error(err.message); }
        };
      });

      wrap.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = async () => {
          const confirmed = await Utils.confirm('حذف هذا العضو نهائياً؟', { danger: true });
          if (!confirmed) return;
          try {
            await API.admin.deleteUser(btn.dataset.delete);
            Utils.success('تم الحذف');
            this.load();
          } catch (err) { Utils.error(err.message); }
        };
      });

    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  showAdd() {
    const body = `
      <div class="form-group">
        <label>الاسم الكامل *</label>
        <input type="text" id="t-name" placeholder="محمد أحمد">
      </div>
      <div class="form-row mt-2">
        <div class="form-group">
          <label>رقم الهاتف *</label>
          <input type="tel" id="t-phone" placeholder="+966500000000">
        </div>
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" id="t-email" placeholder="name@khalto.app">
        </div>
      </div>
      <div class="form-group mt-2">
        <label>كلمة المرور *</label>
        <input type="password" id="t-password" placeholder="كلمة مرور قوية">
      </div>
      <div class="form-group mt-2">
        <label>الدور والصلاحيات *</label>
        <select id="t-role">
          <option value="super_admin">👑 Super Admin — كامل الصلاحيات</option>
          <option value="operations" selected>⚙️ Operations — المطابخ والمندوبين</option>
          <option value="finance">💰 Finance — التسويات والمالية</option>
          <option value="customer_service">🎧 خدمة العملاء — الدعم والشكاوى</option>
          <option value="marketing">📢 Marketing — الكوبونات والإشعارات</option>
        </select>
      </div>
    `;

    const footer = `
      <button class="btn btn-secondary" data-modal-close>إلغاء</button>
      <button class="btn btn-primary" id="save-member">✅ إضافة العضو</button>
    `;

    const { close } = Utils.modal({ title: '👥 إضافة عضو فريق', body, footer });

    document.querySelector('[data-modal-close]').onclick = close;
    document.getElementById('save-member').onclick = async () => {
      const btn = document.getElementById('save-member');

      const full_name = document.getElementById('t-name').value.trim();
      const phone = document.getElementById('t-phone').value.trim();
      const password = document.getElementById('t-password').value;
      const role = document.getElementById('t-role').value;

      if (!full_name || !phone || !password) {
        Utils.error('الحقول المطلوبة ناقصة');
        return;
      }

      btn.disabled = true;
      try {
        await API.admin.createUser({
          full_name, phone, password, role,
          email: document.getElementById('t-email').value.trim() || null,
        });
        Utils.success('تم إضافة العضو');
        close();
        this.load();
      } catch (err) {
        Utils.error(err.message);
        btn.disabled = false;
      }
    };
  },

  permissionsMatrix() {
    const permissions = [
      ['🍳 قبول/رفض المطابخ', ['✅','✅','❌','❌','❌']],
      ['🛵 تفعيل المندوبين', ['✅','✅','❌','❌','❌']],
      ['📋 تعديل حالة الطلبات', ['✅','✅','❌','✅','❌']],
      ['💰 اعتماد التسويات', ['✅','❌','✅','❌','❌']],
      ['🎁 إنشاء الكوبونات', ['✅','❌','❌','❌','✅']],
      ['🔔 إرسال الإشعارات', ['✅','✅','❌','❌','✅']],
      ['🌍 إعدادات الدول', ['✅','❌','❌','❌','❌']],
      ['👥 إدارة الفريق', ['✅','❌','❌','❌','❌']],
      ['💳 بوابات الدفع', ['✅','❌','✅','❌','❌']],
    ];

    const rows = permissions.map(([name, perms]) => `
      <tr>
        <td style="font-weight:600;">${name}</td>
        ${perms.map(p => `<td class="text-center">${p}</td>`).join('')}
      </tr>
    `).join('');

    return `
      <div style="overflow-x:auto;">
        <table class="table">
          <thead>
            <tr>
              <th>الصلاحية</th>
              <th class="text-center">Super Admin</th>
              <th class="text-center">Operations</th>
              <th class="text-center">Finance</th>
              <th class="text-center">خدمة عملاء</th>
              <th class="text-center">Marketing</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

});
