/* ═══════════════════════════════════════════════════════════
   Page: Notifications (Broadcast)
   ═══════════════════════════════════════════════════════════ */

Router.register('notifications', {

  async render(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔔 إرسال إشعار جماعي</div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>الجمهور المستهدف</label>
            <select id="n-audience">
              <option value="all_customers">جميع العملاء</option>
              <option value="active_customers">العملاء النشطين (آخر 30 يوم)</option>
              <option value="inactive_7d">العملاء غير النشطين (أسبوع)</option>
              <option value="all_chefs">جميع الشيفات</option>
              <option value="all_couriers">جميع المندوبين</option>
              <option value="top_customers">أفضل العملاء (5+ طلبات)</option>
              <option value="cart_abandoners">تركوا السلة</option>
            </select>
          </div>
          <div class="form-group">
            <label>القنوات</label>
            <div style="display:flex;gap:10px;padding-top:8px;">
              <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="ch-push" checked> Push</label>
              <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="ch-inapp" checked> In-App</label>
              <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="ch-sms"> SMS</label>
              <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="ch-email"> Email</label>
            </div>
          </div>
        </div>

        <div class="form-row mt-4">
          <div class="form-group">
            <label>العنوان (عربي) *</label>
            <input type="text" id="n-title-ar" placeholder="عرض خاص اليوم!">
          </div>
          <div class="form-group">
            <label>العنوان (إنجليزي)</label>
            <input type="text" id="n-title-en" placeholder="Special offer today!">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>نص الإشعار (عربي) *</label>
            <textarea id="n-body-ar" placeholder="اطلب الآن واحصل على خصم 20%..."></textarea>
          </div>
          <div class="form-group">
            <label>نص الإشعار (إنجليزي)</label>
            <textarea id="n-body-en" placeholder="Order now and get 20% off..."></textarea>
          </div>
        </div>

        <div class="mt-4">
          <button class="btn btn-primary" id="send-notif-btn">📤 إرسال الإشعار</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 إحصائيات اليوم</div>
        </div>
        <div id="notif-stats">${Utils.loadingHTML()}</div>
      </div>
    `;

    document.getElementById('send-notif-btn').onclick = () => this.send();

    await this.loadStats();
  },

  async loadStats() {
    const wrap = document.getElementById('notif-stats');
    if (!wrap) return;

    try {
      const { today } = await API.notifications.stats();

      wrap.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon blue">📤</div>
            <div class="kpi-content">
              <div class="kpi-label">مُرسلة اليوم</div>
              <div class="kpi-value">${Utils.number(today?.sent || 0)}</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon green">👁️</div>
            <div class="kpi-content">
              <div class="kpi-label">مقروءة اليوم</div>
              <div class="kpi-value">${Utils.number(today?.read || 0)}</div>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon amber">📊</div>
            <div class="kpi-content">
              <div class="kpi-label">معدل الفتح</div>
              <div class="kpi-value">${today?.open_rate || '0%'}</div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  async send() {
    const titleAr = document.getElementById('n-title-ar').value.trim();
    const bodyAr = document.getElementById('n-body-ar').value.trim();

    if (!titleAr || !bodyAr) {
      Utils.error('العنوان والنص بالعربي مطلوبين');
      return;
    }

    const channels = [];
    if (document.getElementById('ch-push').checked) channels.push('push');
    if (document.getElementById('ch-inapp').checked) channels.push('in_app');
    if (document.getElementById('ch-sms').checked) channels.push('sms');
    if (document.getElementById('ch-email').checked) channels.push('email');

    if (channels.length === 0) {
      Utils.error('اختار قناة واحدة على الأقل');
      return;
    }

    const confirmed = await Utils.confirm(
      `هل تريد إرسال هذا الإشعار؟ سيتم إرساله لجميع المستخدمين في الشريحة المحددة.`,
    );
    if (!confirmed) return;

    const btn = document.getElementById('send-notif-btn');
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال...';

    try {
      const result = await API.notifications.broadcast({
        audience_type: document.getElementById('n-audience').value,
        title_ar: titleAr,
        title_en: document.getElementById('n-title-en').value.trim() || titleAr,
        body_ar: bodyAr,
        body_en: document.getElementById('n-body-en').value.trim() || bodyAr,
        channels,
      });

      Utils.success(`تم الإرسال لـ ${result.audience_size || 0} مستخدم`);

      // Clear form
      document.getElementById('n-title-ar').value = '';
      document.getElementById('n-title-en').value = '';
      document.getElementById('n-body-ar').value = '';
      document.getElementById('n-body-en').value = '';

      this.loadStats();
    } catch (err) {
      Utils.error(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 إرسال الإشعار';
    }
  },

});
