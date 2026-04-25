/* ═══════════════════════════════════════════════════════════
   Documents Management Mixin
   Shared between admin-couriers and admin-kitchens
   
   Usage:
   - Object.assign(Page, DocumentsMixin)
   - Call this.renderDocumentsTab() in detail content render
   - Call this.loadDocuments() when tab is activated
   - State: this.state.documentsData (loaded data)
   ═══════════════════════════════════════════════════════════ */

window.DocumentsMixin = {

  // ── Get entity info from state ───────────────────────
  _getEntityInfo() {
    if (this.state.selectedCourier) {
      return {
        type: 'courier',
        id: this.state.selectedCourier.id,
        api: 'Courier',
      };
    }
    if (this.state.selectedKitchen) {
      return {
        type: 'kitchen',
        id: this.state.selectedKitchen.id,
        api: 'Kitchen',
      };
    }
    return null;
  },

  // ── RENDER ───────────────────────────────────────────
  renderDocumentsTab() {
    return `<div id="docs-content">${Utils.loadingHTML()}</div>`;
  },

  async loadDocuments() {
    const entity = this._getEntityInfo();
    if (!entity) return;

    const wrap = document.getElementById('docs-content');
    if (!wrap) return;
    wrap.innerHTML = Utils.loadingHTML();

    try {
      const fn = entity.type === 'courier' 
        ? API.adminDocuments.listForCourier
        : API.adminDocuments.listForKitchen;
      const data = await fn(entity.id);
      this.state.documentsData = data;
      this.renderDocumentsContent();
    } catch (err) {
      wrap.innerHTML = Utils.errorHTML(err.message);
    }
  },

  renderDocumentsContent() {
    const data = this.state.documentsData;
    const entity = this._getEntityInfo();
    if (!data || !entity) return;

    const wrap = document.getElementById('docs-content');
    if (!wrap) return;

    const summary = data.summary;
    const types = data.types || [];
    const docs = data.documents || [];

    // Build a map of uploaded docs by type
    const uploadedByType = {};
    docs.forEach(d => { uploadedByType[d.doc_type] = d; });

    wrap.innerHTML = `
      ${this.renderDocumentsSummary(summary)}
      <div class="docs-grid">
        ${types.map(t => this.renderDocumentCard(t, uploadedByType[t.doc_type], entity)).join('')}
      </div>
    `;

    this.attachDocumentsHandlers();
    this.injectDocumentsStyles();
  },

  renderDocumentsSummary(summary) {
    const ready = summary.all_required_approved;
    const pct = summary.required_count > 0
      ? Math.round((summary.approved_required_count / summary.required_count) * 100)
      : 0;

    return `
      <div class="docs-summary ${ready ? 'docs-ready' : 'docs-not-ready'}">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div style="font-size:14px; font-weight:700;">
              ${ready ? '✅ المستندات الإجبارية مكتملة ومعتمدة' : '⚠️ مستندات إجبارية ناقصة'}
            </div>
            <div class="text-sm text-muted" style="margin-top:4px;">
              ${summary.approved_required_count} من ${summary.required_count} مستند معتمد
              ${summary.missing_required.length > 0 ? `· ينقص: ${summary.missing_required.map(m => m.name_ar).join('، ')}` : ''}
            </div>
          </div>
          <div class="docs-progress">
            <div class="docs-progress-bar" style="width:${pct}%;"></div>
            <span class="docs-progress-text">${pct}%</span>
          </div>
        </div>
      </div>
    `;
  },

  renderDocumentCard(type, doc, entity) {
    const required = type.is_required;
    const status = doc?.status || 'missing';
    const statusLabel = {
      missing:  required ? '❌ غير مرفوع' : '⚪ اختياري',
      pending:  '⏳ في انتظار المراجعة',
      approved: '✅ معتمد',
      rejected: '🚫 مرفوض',
    }[status] || status;

    const statusClass = `doc-status-${status}`;

    // File preview
    let preview = '';
    if (doc?.file_url) {
      const isImage = doc.mime_type?.startsWith('image/');
      preview = isImage
        ? `<a href="${Utils.escape(doc.file_url)}" target="_blank">
             <img src="${Utils.escape(doc.file_url)}" alt="${Utils.escape(type.name_ar)}" class="doc-preview-img">
           </a>`
        : `<a href="${Utils.escape(doc.file_url)}" target="_blank" class="doc-pdf-link">
             📄 عرض الملف (${this._formatFileSize(doc.file_size_bytes)})
           </a>`;
    } else {
      preview = `<div class="doc-no-file">${required ? '🚫' : '⚪'}</div>`;
    }

    // Action buttons
    const actions = [];
    if (doc) {
      if (status === 'pending') {
        actions.push(`<button class="btn btn-sm btn-success" data-doc-approve="${doc.id}">✅ اعتماد</button>`);
        actions.push(`<button class="btn btn-sm btn-danger" data-doc-reject="${doc.id}">❌ رفض</button>`);
      }
      if (status === 'rejected') {
        actions.push(`<button class="btn btn-sm btn-success" data-doc-approve="${doc.id}">↩️ إعادة اعتماد</button>`);
      }
      actions.push(`<button class="btn btn-sm btn-secondary" data-doc-replace="${type.doc_type}">🔄 استبدال</button>`);
      actions.push(`<button class="btn btn-sm btn-danger" data-doc-delete="${doc.id}">🗑 حذف</button>`);
    } else {
      actions.push(`<button class="btn btn-sm btn-primary" data-doc-upload="${type.doc_type}">📤 رفع الملف</button>`);
    }

    return `
      <div class="doc-card ${statusClass}">
        <div class="doc-header">
          <div>
            <div style="font-weight:700; font-size:14px;">
              ${type.has_expiry ? '📅' : '📄'} ${Utils.escape(type.name_ar)}
              ${required ? '<span class="doc-required-mark">إجباري</span>' : '<span class="doc-optional-mark">اختياري</span>'}
            </div>
            ${type.description_ar ? `<div class="text-sm text-muted">${Utils.escape(type.description_ar)}</div>` : ''}
          </div>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        
        <div class="doc-preview">${preview}</div>
        
        ${doc?.original_name ? `<div class="text-sm text-muted" style="margin-top:6px;">📎 ${Utils.escape(doc.original_name)}</div>` : ''}
        ${doc?.expires_at ? `<div class="text-sm text-muted">⏰ ينتهي: ${new Date(doc.expires_at).toLocaleDateString('ar-SA')}</div>` : ''}
        ${doc?.uploaded_at ? `<div class="text-sm text-muted">📤 رُفع: ${Utils.timeAgo(doc.uploaded_at)}</div>` : ''}
        ${doc?.reviewed_by_name ? `<div class="text-sm text-muted">👁 راجع: ${Utils.escape(doc.reviewed_by_name)}</div>` : ''}
        ${doc?.rejection_reason ? `<div style="background:#FED7D7; padding:6px 8px; border-radius:4px; font-size:12px; margin-top:6px; color:#9B2C2C;">سبب الرفض: ${Utils.escape(doc.rejection_reason)}</div>` : ''}
        
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;">
          ${actions.join('')}
        </div>
      </div>
    `;
  },

  // ── HANDLERS ─────────────────────────────────────────
  attachDocumentsHandlers() {
    const entity = this._getEntityInfo();
    if (!entity) return;

    document.querySelectorAll('[data-doc-upload]').forEach(btn => {
      btn.onclick = () => this._uploadDocument(entity, btn.dataset.docUpload);
    });
    document.querySelectorAll('[data-doc-replace]').forEach(btn => {
      btn.onclick = () => this._uploadDocument(entity, btn.dataset.docReplace);
    });
    document.querySelectorAll('[data-doc-approve]').forEach(btn => {
      btn.onclick = () => this._approveDocument(entity, btn.dataset.docApprove);
    });
    document.querySelectorAll('[data-doc-reject]').forEach(btn => {
      btn.onclick = () => this._rejectDocument(entity, btn.dataset.docReject);
    });
    document.querySelectorAll('[data-doc-delete]').forEach(btn => {
      btn.onclick = () => this._deleteDocument(entity, btn.dataset.docDelete);
    });
  },

  // ── ACTIONS ──────────────────────────────────────────
  async _uploadDocument(entity, docType) {
    // Find the type definition for label
    const typeDefn = (this.state.documentsData?.types || []).find(t => t.doc_type === docType);
    const typeName = typeDefn?.name_ar || docType;

    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async () => {
      const file = input.files[0];
      input.remove();
      if (!file) return;

      // Size check (5MB)
      if (file.size > 5 * 1024 * 1024) {
        Utils.error('حجم الملف كبير جداً (الحد الأقصى 5MB)');
        return;
      }

      // Show uploading state
      Utils.success('جاري رفع المستند...');

      try {
        const fn = entity.type === 'courier'
          ? API.adminDocuments.uploadCourier
          : API.adminDocuments.uploadKitchen;
        await fn(entity.id, file, docType);
        Utils.success(`تم رفع "${typeName}" بنجاح`);
        this.loadDocuments();
      } catch (err) {
        Utils.error(err.message || 'فشل الرفع');
      }
    };

    input.click();
  },

  async _approveDocument(entity, docId) {
    if (!confirm('هل تريد اعتماد هذا المستند؟')) return;
    try {
      const fn = entity.type === 'courier'
        ? API.adminDocuments.approveCourierDoc
        : API.adminDocuments.approveKitchenDoc;
      await fn(docId);
      Utils.success('تم الاعتماد');
      this.loadDocuments();
    } catch (err) { Utils.error(err.message); }
  },

  async _rejectDocument(entity, docId) {
    const reason = await this._promptDocReason('سبب رفض المستند');
    if (!reason) return;
    try {
      const fn = entity.type === 'courier'
        ? API.adminDocuments.rejectCourierDoc
        : API.adminDocuments.rejectKitchenDoc;
      await fn(docId, reason);
      Utils.success('تم الرفض');
      this.loadDocuments();
    } catch (err) { Utils.error(err.message); }
  },

  async _deleteDocument(entity, docId) {
    if (!confirm('هل تريد حذف هذا المستند نهائياً؟')) return;
    try {
      const fn = entity.type === 'courier'
        ? API.adminDocuments.deleteCourierDoc
        : API.adminDocuments.deleteKitchenDoc;
      await fn(docId);
      Utils.success('تم الحذف');
      this.loadDocuments();
    } catch (err) { Utils.error(err.message); }
  },

  // ── HELPERS ──────────────────────────────────────────
  _formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },

  async _promptDocReason(title) {
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
              <textarea id="doc-reason-input" rows="3" autofocus></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="doc-reason-cancel">إلغاء</button>
            <button class="btn btn-primary" id="doc-reason-ok">تأكيد</button>
          </div>
        </div>
      `;
      document.getElementById('modal-container').appendChild(wrap);
      document.getElementById('doc-reason-input').focus();
      const cleanup = () => wrap.remove();
      document.getElementById('doc-reason-cancel').onclick = () => { cleanup(); resolve(null); };
      document.getElementById('doc-reason-ok').onclick = () => {
        const val = document.getElementById('doc-reason-input').value.trim();
        if (val.length < 5) { Utils.error('السبب قصير جداً'); return; }
        cleanup(); resolve(val);
      };
    });
  },

  // ── STYLES ───────────────────────────────────────────
  injectDocumentsStyles() {
    if (document.getElementById('docs-mixin-styles')) return;
    const s = document.createElement('style');
    s.id = 'docs-mixin-styles';
    s.textContent = `
      .docs-summary {
        padding: 14px;
        border-radius: 8px;
        margin-bottom: 14px;
      }
      .docs-summary.docs-ready {
        background: #D1FAE5;
        border: 1px solid #34D399;
      }
      .docs-summary.docs-not-ready {
        background: #FEF3C7;
        border: 1px solid #F59E0B;
      }
      .docs-progress {
        position: relative;
        width: 120px;
        height: 24px;
        background: rgba(0,0,0,0.08);
        border-radius: 12px;
        overflow: hidden;
      }
      .docs-progress-bar {
        height: 100%;
        background: #10B981;
        transition: width 0.3s;
      }
      .docs-progress-text {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
      }

      .docs-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
      }
      .doc-card {
        border: 2px solid var(--border);
        border-radius: 10px;
        padding: 12px;
        background: var(--bg-white);
        transition: border-color 0.15s;
      }
      .doc-card.doc-status-approved { border-color: #34D399; }
      .doc-card.doc-status-pending  { border-color: #FBBF24; }
      .doc-card.doc-status-rejected { border-color: #F87171; }
      .doc-card.doc-status-missing  { border-color: var(--border); border-style: dashed; }

      .doc-header {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
      }
      .doc-required-mark {
        background: #FECACA;
        color: #991B1B;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        margin-right: 4px;
      }
      .doc-optional-mark {
        background: #E5E7EB;
        color: #4B5563;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        margin-right: 4px;
      }

      .doc-preview {
        margin: 8px 0;
        min-height: 100px;
        background: var(--bg);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .doc-preview-img {
        max-width: 100%;
        max-height: 200px;
        object-fit: contain;
        cursor: pointer;
        transition: transform 0.15s;
      }
      .doc-preview-img:hover { transform: scale(1.02); }
      .doc-pdf-link {
        padding: 30px;
        text-align: center;
        text-decoration: none;
        color: var(--coral);
        font-weight: 600;
      }
      .doc-no-file {
        font-size: 36px;
        opacity: 0.4;
        padding: 30px;
      }

      .badge.doc-status-missing  { background: #E5E7EB; color: #4B5563; }
      .badge.doc-status-pending  { background: #FEF3C7; color: #92400E; }
      .badge.doc-status-approved { background: #D1FAE5; color: #065F46; }
      .badge.doc-status-rejected { background: #FECACA; color: #991B1B; }
    `;
    document.head.appendChild(s);
  },

};
