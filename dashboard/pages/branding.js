/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Page: Branding
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

Router.register('branding', {

  async render(container) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">ðŸŽ¨ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ÙŠÙ†Ø¬</div>
          </div>
          <div id="branding-form">${Utils.loadingHTML()}</div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">ðŸ‘ï¸ Ù…Ø¹Ø§ÙŠÙ†Ø© Ø­ÙŠØ©</div>
          </div>
          <div id="branding-preview">${Utils.loadingHTML()}</div>
        </div>
      </div>
    `;

    await this.load();
  },

  async load() {
    try {
      const { branding } = await API.branding.get();

      document.getElementById('branding-form').innerHTML = `
        <div class="form-group">
          <label>Ø§Ø³Ù… Ø§Ù„Ù…Ù†ØµØ© (Ø¹Ø±Ø¨ÙŠ)</label>
          <input type="text" id="b-name-ar" value="${Utils.escape(branding.platform_name_ar || 'Ø®Ø§Ù„ØªÙˆ')}">
        </div>
        <div class="form-group mt-2">
          <label>Ø§Ø³Ù… Ø§Ù„Ù…Ù†ØµØ© (Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠ)</label>
          <input type="text" id="b-name-en" value="${Utils.escape(branding.platform_name || 'Khalto')}">
        </div>
        <div class="form-row mt-2">
          <div class="form-group">
            <label>Ø§Ù„Ø´Ø¹Ø§Ø± (Ø¹Ø±Ø¨ÙŠ)</label>
            <input type="text" id="b-tag-ar" value="${Utils.escape(branding.platform_tagline_ar || '')}">
          </div>
          <div class="form-group">
            <label>Ø§Ù„Ø´Ø¹Ø§Ø± (Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠ)</label>
            <input type="text" id="b-tag-en" value="${Utils.escape(branding.platform_tagline || '')}">
          </div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group">
            <label>Ø§Ù„Ù„ÙˆÙ† Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ</label>
            <input type="color" id="b-primary" value="${branding.primary_color || '#E8603C'}" style="height:44px;">
          </div>
          <div class="form-group">
            <label>Ø§Ù„Ù„ÙˆÙ† Ø§Ù„Ø«Ø§Ù†ÙˆÙŠ</label>
            <input type="color" id="b-secondary" value="${branding.secondary_color || '#1a1a2e'}" style="height:44px;">
          </div>
        </div>
        <div class="form-row mt-2">
          <div class="form-group">
            <label>Ø§Ù„Ø¨Ø±ÙŠØ¯ Ù„Ù„Ø¯Ø¹Ù…</label>
            <input type="email" id="b-email" value="${Utils.escape(branding.support_email || '')}">
          </div>
          <div class="form-group">
            <label>Ù‡Ø§ØªÙ Ø§Ù„Ø¯Ø¹Ù…</label>
            <input type="tel" id="b-phone" value="${Utils.escape(branding.support_phone || '')}">
          </div>
        </div>
        <div class="form-row mt-4">
          <button class="btn btn-primary" id="save-branding">ðŸ’¾ Ø­ÙØ¸</button>
          <button class="btn btn-secondary" id="reset-branding">ðŸ”„ Ø¥Ø¹Ø§Ø¯Ø© Ù„Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠ</button>
        </div>
      `;

      this.updatePreview(branding);

      // Wire up inputs for live preview
      ['b-name-ar', 'b-name-en', 'b-tag-ar', 'b-tag-en', 'b-primary', 'b-secondary'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => this.updatePreview(this.readForm());
      });

      document.getElementById('save-branding').onclick = () => this.save();
      document.getElementById('reset-branding').onclick = () => this.reset();

    } catch (err) {
      document.getElementById('branding-form').innerHTML = Utils.errorHTML(err.message);
    }
  },

  readForm() {
    return {
      platform_name: document.getElementById('b-name-en').value,
      platform_name_ar: document.getElementById('b-name-ar').value,
      platform_tagline: document.getElementById('b-tag-en').value,
      platform_tagline_ar: document.getElementById('b-tag-ar').value,
      primary_color: document.getElementById('b-primary').value,
      secondary_color: document.getElementById('b-secondary').value,
      support_email: document.getElementById('b-email').value,
      support_phone: document.getElementById('b-phone').value,
    };
  },

  updatePreview(b) {
    const el = document.getElementById('branding-preview');
    if (!el) return;
    el.innerHTML = `
      <div style="background: ${b.secondary_color}; padding: 40px 20px; border-radius: var(--radius-lg); text-align: center; color: white;">
        <div style="width:96px; height:96px; background:${b.logo_url ? 'transparent' : b.primary_color}; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:700; overflow:hidden;">
          ${b.logo_url 
            ? `<img src="${b.logo_url}" alt="logo" style="width:100%;height:100%;object-fit:contain;" onerror="this.outerHTML='<span>'+(b.platform_name_ar || 'خ')[0]+'</span>'">`
            : `<span>${(b.platform_name_ar || b.platform_name || 'K')[0]}</span>`
          }
        </div>
        <h2 style="font-size:28px; margin-bottom:6px;">${Utils.escape(b.platform_name_ar || 'Ø®Ø§Ù„ØªÙˆ')}</h2>
        <p style="opacity:0.8; margin-bottom:20px;">${Utils.escape(b.platform_tagline_ar || 'ØªÙˆØµÙŠÙ„ Ø§Ù„Ø£ÙƒÙ„ Ø§Ù„Ø¨ÙŠØªÙŠ')}</p>
        <button style="background:${b.primary_color}; color:white; border:none; padding:12px 30px; border-radius:var(--radius); font-weight:600; cursor:pointer;">
          Ø§Ø·Ù„Ø¨ Ø§Ù„Ø¢Ù†
        </button>
      </div>
    `;
  },

  async save() {
    const btn = document.getElementById('save-branding');
    btn.disabled = true;
    try {
      await API.branding.update(this.readForm());
      Utils.success('ØªÙ… Ø­ÙØ¸ Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ÙŠÙ†Ø¬');
    } catch (err) {
      Utils.error(err.message);
    } finally {
      btn.disabled = false;
    }
  },

  async reset() {
    const confirmed = await Utils.confirm('Ù‡Ù„ ØªØ±ÙŠØ¯ Ø¥Ø¹Ø§Ø¯Ø© Ø¶Ø¨Ø· Ø§Ù„Ø¨Ø±Ø§Ù†Ø¯ÙŠÙ†Ø¬ Ù„Ù„Ù‚ÙŠÙ… Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©ØŸ', { danger: true });
    if (!confirmed) return;
    try {
      await API.branding.reset({});
      Utils.success('ØªÙ… Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¶Ø¨Ø·');
      this.load();
    } catch (err) { Utils.error(err.message); }
  },

});
