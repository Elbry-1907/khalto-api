/* ═══════════════════════════════════════════════════════════
   User Management Mixin
   Shared methods for admin-couriers and admin-kitchens
   to manage the underlying user account.
   
   Usage in a page:
   - Object.assign(MyPage, UserMgmtMixin) before Router.register
   - Then in detail modal call:
       this.renderUserActions(userId, userName)
       this.attachUserActionHandlers()
   ═══════════════════════════════════════════════════════════ */

window.UserMgmtMixin = {

  /**
   * Renders action buttons for the user account
   * Returns HTML string with buttons.
   */
  renderUserActions(userId, userName) {
    return `
      <div class="um-actions" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn btn-sm btn-secondary" data-um-edit="${userId}" data-um-name="${Utils.escape(userName || '')}">
          ✏️ تعديل بيانات المستخدم
        </button>
        <button class="btn btn-sm btn-secondary" data-um-reset="${userId}" data-um-name="${Utils.escape(userName || '')}">
          🔑 إعادة تعيين كلمة المرور
        </button>
        <button class="btn btn-sm btn-warning" data-um-block="${userId}" data-um-name="${Utils.escape(userName || '')}">
          🚫 حظر المستخدم
        </button>
      </div>
    `;
  },

  /**
   * Renders unblock button if user is blocked
   */
  renderUnblockButton(userId, userName) {
    return `
      <button class="btn btn-sm btn-success" data-um-unblock="${userId}" data-um-name="${Utils.escape(userName || '')}">
        ▶️ رفع الحظر
      </button>
    `;
  },

  /**
   * Attach click handlers — call after renderUserActions inserted into DOM
   */
  attachUserActionHandlers() {
    document.querySelectorAll('[data-um-edit]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.umEditUser(btn.dataset.umEdit, btn.dataset.umName);
      };
    });
    document.querySelectorAll('[data-um-reset]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.umResetPassword(btn.dataset.umReset, btn.dataset.umName);
      };
    });
    document.querySelectorAll('[data-um-block]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.umBlockUser(btn.dataset.umBlock, btn.dataset.umName);
      };
    });
    document.querySelectorAll('[data-um-unblock]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.umUnblockUser(btn.dataset.umUnblock, btn.dataset.umName);
      };
    });
  },

  // ── EDIT USER ────────────────────────────────────────
  async umEditUser(userId, userName) {
    let user;
    try {
      const res = await API.adminUsers.get(userId);
      user = res.user;
    } catch (err) {
      Utils.error(err.message);
      return;
    }

    // Save current modal so we can restore after edit
    const currentModalHTML = document.getElementById('modal-container').innerHTML;

    Utils.modal({
      title: '✏️ تعديل بيانات المستخدم',
      size: 'modal-md',
      body: `
        <div class="form-group">
          <label>الاسم الكامل</label>
          <input type="text" id="um-edit-name" value="${Utils.escape(user.full_name || '')}">
        </div>
        <div class="form-group">
          <label>الهاتف</label>
          <input type="tel" id="um-edit-phone" value="${Utils.escape(user.phone || '')}">
        </div>
        <div class="form-group">
          <label>البريد الإلكتروني</label>
          <input type="email" id="um-edit-email" value="${Utils.escape(user.email || '')}">
        </div>
        <div class="form-group">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="um-edit-verified" ${user.is_verified ? 'checked' : ''}>
            <span>الحساب موثّق</span>
          </label>
        </div>
      `,
      footer: `
        <button class="btn btn-secondary" id="um-edit-cancel">إلغاء</button>
        <button class="btn btn-primary" id="um-edit-save">حفظ</button>
      `,
    });

    document.getElementById('um-edit-cancel').onclick = () => {
      document.getElementById('modal-container').innerHTML = currentModalHTML;
      this.attachUserActionHandlers();
      // Re-attach the parent modal's handlers
      if (this.attachDetailHandlers) this.attachDetailHandlers();
    };

    document.getElementById('um-edit-save').onclick = async () => {
      const data = {
        full_name:   document.getElementById('um-edit-name').value.trim(),
        phone:       document.getElementById('um-edit-phone').value.trim(),
        email:       document.getElementById('um-edit-email').value.trim() || null,
        is_verified: document.getElementById('um-edit-verified').checked,
      };
      try {
        await API.adminUsers.update(userId, data);
        Utils.success('تم حفظ بيانات المستخدم');
        document.getElementById('modal-container').innerHTML = '';
        // Reload the parent page if it has a load method
        if (this.loadCouriers) this.loadCouriers();
        if (this.loadKitchens) this.loadKitchens();
      } catch (err) {
        Utils.error(err.message);
      }
    };
  },

  // ── RESET PASSWORD ───────────────────────────────────
  async umResetPassword(userId, userName) {
    if (!confirm(`هل تريد إعادة تعيين كلمة المرور للمستخدم "${userName}"؟\n\nسيتم توليد كلمة مرور جديدة وعرضها لك مرة واحدة فقط.`)) return;

    try {
      const res = await API.adminUsers.resetPassword(userId);
      this.umShowPasswordModal(res.new_password, userName);
    } catch (err) {
      Utils.error(err.message);
    }
  },

  umShowPasswordModal(password, userName) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay';
    wrap.style.zIndex = '10000';
    wrap.innerHTML = `
      <div class="modal modal-md" onclick="event.stopPropagation()">
        <div class="modal-header"><div class="modal-title">🔑 كلمة المرور الجديدة</div></div>
        <div class="modal-body">
          <p style="margin-bottom:14px;">تم إعادة تعيين كلمة المرور للمستخدم <strong>${Utils.escape(userName)}</strong>.</p>
          <div style="background:#FEF3C7; padding:14px; border-radius:8px; margin-bottom:12px;">
            <div style="font-size:12px; color:#92400E; margin-bottom:6px;">⚠️ كلمة المرور لن تظهر مرة أخرى — احفظها الآن</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="text" id="um-new-pw" value="${Utils.escape(password)}" readonly
                style="flex:1; padding:10px; font-family:monospace; font-size:16px; font-weight:700; direction:ltr; text-align:left; background:white; border:1px solid #FCD34D;">
              <button class="btn btn-sm btn-primary" id="um-copy-pw">📋 نسخ</button>
            </div>
          </div>
          <p class="text-sm text-muted">يرجى نقل كلمة المرور للمستخدم بطريقة آمنة (رسالة شخصية، اتصال).</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="um-close-pw">حفظت كلمة المرور — إغلاق</button>
        </div>
      </div>
    `;
    document.getElementById('modal-container').appendChild(wrap);

    document.getElementById('um-copy-pw').onclick = () => {
      const inp = document.getElementById('um-new-pw');
      inp.select();
      try {
        navigator.clipboard.writeText(password);
        Utils.success('تم النسخ');
      } catch {
        document.execCommand('copy');
        Utils.success('تم النسخ');
      }
    };

    document.getElementById('um-close-pw').onclick = () => wrap.remove();
  },

  // ── BLOCK USER ───────────────────────────────────────
  async umBlockUser(userId, userName) {
    const reason = await this.umPromptReason(`سبب حظر ${userName}`);
    if (!reason) return;

    if (!confirm(`تأكيد حظر "${userName}"؟\n\nالمستخدم لن يتمكن من تسجيل الدخول أو استخدام التطبيق.`)) return;

    try {
      await API.adminUsers.block(userId, reason);
      Utils.success('تم حظر المستخدم');
      // Reload if possible
      if (this.loadCouriers) this.loadCouriers();
      if (this.loadKitchens) this.loadKitchens();
      // Close detail modal
      const mc = document.getElementById('modal-container');
      if (mc) mc.innerHTML = '';
    } catch (err) {
      Utils.error(err.message);
    }
  },

  // ── UNBLOCK USER ─────────────────────────────────────
  async umUnblockUser(userId, userName) {
    if (!confirm(`رفع الحظر عن "${userName}"؟`)) return;

    try {
      await API.adminUsers.unblock(userId);
      Utils.success('تم رفع الحظر');
      if (this.loadCouriers) this.loadCouriers();
      if (this.loadKitchens) this.loadKitchens();
      const mc = document.getElementById('modal-container');
      if (mc) mc.innerHTML = '';
    } catch (err) {
      Utils.error(err.message);
    }
  },

  // ── HELPER PROMPT ────────────────────────────────────
  async umPromptReason(title) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-overlay';
      wrap.style.zIndex = '10000';
      wrap.innerHTML = `
        <div class="modal modal-md" onclick="event.stopPropagation()">
          <div class="modal-header"><div class="modal-title">${Utils.escape(title)}</div></div>
          <div class="modal-body">
            <div class="form-group">
              <label>السبب (5 أحرف على الأقل)</label>
              <textarea id="um-reason-input" rows="3" autofocus></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="um-reason-cancel">إلغاء</button>
            <button class="btn btn-primary" id="um-reason-ok">تأكيد</button>
          </div>
        </div>
      `;
      document.getElementById('modal-container').appendChild(wrap);
      const input = document.getElementById('um-reason-input');
      if (input) input.focus();
      const cleanup = () => wrap.remove();
      document.getElementById('um-reason-cancel').onclick = () => { cleanup(); resolve(null); };
      document.getElementById('um-reason-ok').onclick = () => {
        const val = input.value.trim();
        if (val.length < 5) { Utils.error('السبب قصير جداً'); return; }
        cleanup(); resolve(val);
      };
    });
  },

};
