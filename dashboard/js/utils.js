/* ═══════════════════════════════════════════════════════════
   Khalto Dashboard — Utilities
   ═══════════════════════════════════════════════════════════ */

const Utils = {

  // ── Formatting ────────────────────────────────────────

  // Currency symbol lookup — covers all supported markets
  CURRENCY_SYMBOLS: {
    SAR: 'ر.س',  EGP: 'ج.م',  AED: 'د.إ',
    KWD: 'د.ك',  BHD: 'د.ب',  OMR: 'ر.ع',
    QAR: 'ر.ق',  JOD: 'د.أ',  USD: '$',
  },

  /**
   * Format a money amount with the proper currency symbol.
   * @param {number|string} amount   - The numeric amount
   * @param {string|object} codeOrRow - Currency code OR a row with currency_symbol
   */
  currency(amount, codeOrRow = 'SAR') {
    const num = parseFloat(amount) || 0;
    let symbol;
    if (codeOrRow && typeof codeOrRow === 'object') {
      symbol = codeOrRow.currency_symbol
            || this.CURRENCY_SYMBOLS[codeOrRow.currency_code]
            || codeOrRow.currency_code
            || this.CURRENCY_SYMBOLS.SAR;
    } else {
      symbol = this.CURRENCY_SYMBOLS[codeOrRow] || codeOrRow || this.CURRENCY_SYMBOLS.SAR;
    }
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
  },

  number(value) {
    return (parseFloat(value) || 0).toLocaleString('en-US');
  },

  date(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  datetime(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    return d.toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  timeAgo(isoDate) {
    if (!isoDate) return '—';
    const secs = Math.floor((Date.now() - new Date(isoDate)) / 1000);
    if (secs < 60)       return 'الآن';
    if (secs < 3600)     return `منذ ${Math.floor(secs / 60)} دقيقة`;
    if (secs < 86400)    return `منذ ${Math.floor(secs / 3600)} ساعة`;
    if (secs < 2592000)  return `منذ ${Math.floor(secs / 86400)} يوم`;
    return this.date(isoDate);
  },

  // ── Status & Role translation ─────────────────────────

  statusLabel(status) {
    const labels = {
      pending_payment: 'بانتظار الدفع',
      paid: 'مدفوع',
      awaiting_acceptance: 'بانتظار القبول',
      accepted: 'مقبول',
      preparing: 'قيد التحضير',
      ready_for_pickup: 'جاهز للاستلام',
      courier_assigned: 'تم تعيين مندوب',
      picked_up: 'تم الاستلام',
      delivered: 'تم التوصيل',
      cancelled: 'ملغي',
      refunded: 'مسترد',
      active: 'نشط',
      pending_review: 'بانتظار المراجعة',
      suspended: 'موقوف',
      pending: 'معلّق',
      approved: 'معتمد',
      failed: 'فشل',
      online: 'متصل',
      offline: 'غير متصل',
      delivering: 'يوصّل',
    };
    return labels[status] || status;
  },

  statusBadgeClass(status) {
    const map = {
      delivered: 'badge-success', active: 'badge-success', approved: 'badge-success',
      accepted: 'badge-success', paid: 'badge-success', online: 'badge-success',
      pending_payment: 'badge-warning', awaiting_acceptance: 'badge-warning',
      pending_review: 'badge-warning', pending: 'badge-warning',
      preparing: 'badge-info', ready_for_pickup: 'badge-info', courier_assigned: 'badge-info',
      picked_up: 'badge-info', delivering: 'badge-info',
      cancelled: 'badge-danger', refunded: 'badge-danger', suspended: 'badge-danger', failed: 'badge-danger',
      offline: 'badge-gray',
    };
    return map[status] || 'badge-gray';
  },

  statusBadge(status) {
    return `<span class="badge ${this.statusBadgeClass(status)}">${this.statusLabel(status)}</span>`;
  },

  roleLabel(role) {
    return {
      super_admin: 'مدير عام',
      operations: 'عمليات',
      finance: 'مالية',
      customer_service: 'خدمة عملاء',
      marketing: 'تسويق',
      chef: 'شيف',
      courier: 'مندوب',
      customer: 'عميل',
    }[role] || role;
  },

  // ── Toasts ────────────────────────────────────────────

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = { success: '✅', error: '❌', info: 'ℹ️' }[type] || '';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.2s reverse';
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  },

  success(msg) { this.toast(msg, 'success'); },
  error(msg)   { this.toast(msg, 'error'); },

  // ── Modal ─────────────────────────────────────────────

  modal({ title, body, footer, size = '', onClose }) {
    const container = document.getElementById('modal-container');
    container.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <div class="modal ${size}">
          <div class="modal-header">
            <div class="modal-title">${title}</div>
            <button class="modal-close" data-modal-close>✕</button>
          </div>
          <div class="modal-body">${body}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>
    `;

    const close = () => {
      container.innerHTML = '';
      if (onClose) onClose();
    };

    container.querySelector('[data-modal-close]').onclick = close;
    container.querySelector('[data-modal-backdrop]').onclick = (e) => {
      if (e.target.dataset.modalBackdrop !== undefined) close();
    };

    return { close, container };
  },

  confirm(message, { title = 'تأكيد', danger = false } = {}) {
    return new Promise((resolve) => {
      const { close } = this.modal({
        title,
        body: `<p style="font-size:14px;line-height:1.7;">${message}</p>`,
        footer: `
          <button class="btn btn-secondary" data-cancel>إلغاء</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>تأكيد</button>
        `,
      });

      document.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
      document.querySelector('[data-confirm]').onclick = () => { close(); resolve(true); };
    });
  },

  // ── Loading & Empty states ────────────────────────────

  loadingHTML() {
    return `<div class="loading-state"><div class="spinner"></div><p>جاري التحميل...</p></div>`;
  },

  emptyHTML(title = 'لا توجد بيانات', desc = '', icon = '📭') {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">${title}</div>
        ${desc ? `<div class="empty-desc">${desc}</div>` : ''}
      </div>
    `;
  },

  errorHTML(error) {
    return `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">حدث خطأ</div>
        <div class="empty-desc">${error || 'تعذّر تحميل البيانات'}</div>
      </div>
    `;
  },

  // ── Pagination HTML ───────────────────────────────────

  paginationHTML(currentPage, totalPages, onPage) {
    if (totalPages <= 1) return '';
    currentPage = parseInt(currentPage) || 1;
    let html = '<div class="pagination">';
    html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">←</button>`;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) {
      html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">→</button>`;
    html += '</div>';

    setTimeout(() => {
      document.querySelectorAll('.pagination button').forEach(btn => {
        btn.onclick = () => {
          const p = parseInt(btn.dataset.page);
          if (p && p !== currentPage) onPage(p);
        };
      });
    }, 0);

    return html;
  },

  // ── DOM helpers ───────────────────────────────────────

  escape(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
  },

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

};

window.Utils = Utils;
