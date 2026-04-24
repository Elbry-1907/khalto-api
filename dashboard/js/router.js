/* ═══════════════════════════════════════════════════════════
   Khalto Dashboard — Router
   ═══════════════════════════════════════════════════════════ */

const Router = {

  currentPage: null,
  pages: {},

  // ── Register a page ──────────────────────────────────
  // Each page module calls Router.register('name', {...})
  register(name, pageDef) {
    this.pages[name] = pageDef;
  },

  // ── Initialize nav ────────────────────────────────────
  init() {
    // Wire up nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        this.navigate(item.dataset.page);
      };
    });

    // Refresh button
    document.getElementById('refresh-btn').onclick = () => {
      if (this.currentPage) this.navigate(this.currentPage, true);
    };

    // Initial navigation
    const initial = window.location.hash.slice(1) || 'dashboard';
    this.navigate(initial);
  },

  // ── Navigate to a page ────────────────────────────────
  async navigate(pageName, force = false) {
    const page = this.pages[pageName];
    if (!page) {
      console.error(`Page not found: ${pageName}`);
      this.navigate('dashboard');
      return;
    }

    if (this.currentPage === pageName && !force) return;
    this.currentPage = pageName;

    // Update URL
    window.location.hash = pageName;

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Update page title
    const titles = {
      dashboard: 'لوحة التحكم',
      orders: 'الطلبات',
      kitchens: 'المطابخ',
      couriers: 'المندوبين',
      customers: 'العملاء',
      settlements: 'التسويات',
      commission: 'العمولات',
      coupons: 'الكوبونات',
      notifications: 'إرسال إشعار',
      branding: 'البراندينج',
      countries: 'الدول والمدن',
      team: 'الفريق والصلاحيات',
    };
    document.getElementById('page-title').textContent = titles[pageName] || pageName;

    // Show loading state
    const content = document.getElementById('page-content');
    content.innerHTML = Utils.loadingHTML();

    // Scroll to top
    content.scrollTop = 0;

    // Render page
    try {
      await page.render(content);
    } catch (err) {
      console.error(`Error rendering ${pageName}:`, err);
      content.innerHTML = Utils.errorHTML(err.message);
    }
  },

};

window.Router = Router;
