/* ═══════════════════════════════════════════════════════════
   Khalto Dashboard — Auth
   ═══════════════════════════════════════════════════════════ */

const Auth = {

  // Current user state
  user: null,
  token: null,

  // ── Initialize from localStorage ──────────────────────
  init() {
    this.token = localStorage.getItem('khalto_token');
    try {
      this.user = JSON.parse(localStorage.getItem('khalto_user') || 'null');
    } catch {
      this.user = null;
    }
  },

  // ── Check if authenticated ────────────────────────────
  isAuthenticated() {
    return !!this.token && !!this.user;
  },

  // ── Check role ────────────────────────────────────────
  isSuperAdmin() {
    return this.user?.role === 'super_admin';
  },

  hasRole(...roles) {
    return roles.includes(this.user?.role);
  },

  // ── Login ─────────────────────────────────────────────
  async login(phone, password) {
    const response = await API.auth.login(phone, password);

    if (!response.token || !response.user) {
      throw new Error('استجابة غير صحيحة من الخادم');
    }

    // Check role - only admin/ops/finance/etc can login to dashboard
    const allowedRoles = ['super_admin', 'operations', 'finance', 'customer_service', 'marketing'];
    if (!allowedRoles.includes(response.user.role)) {
      throw new Error('هذا الحساب ليس لديه صلاحيات دخول لوحة التحكم');
    }

    this.token = response.token;
    this.user = response.user;
    localStorage.setItem('khalto_token', this.token);
    localStorage.setItem('khalto_user', JSON.stringify(this.user));

    return this.user;
  },

  // ── Logout ────────────────────────────────────────────
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('khalto_token');
    localStorage.removeItem('khalto_user');
    window.location.reload();
  },

  // ── Show login view ───────────────────────────────────
  showLogin() {
    document.getElementById('login-view').style.display = 'flex';
    document.getElementById('app-view').style.display = 'none';

    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    btn.onclick = async () => {
      const phone = document.getElementById('login-phone').value.trim();
      const password = document.getElementById('login-password').value;

      if (!phone || !password) {
        errorEl.textContent = 'الرجاء إدخال رقم الهاتف وكلمة المرور';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'جاري تسجيل الدخول...';

      try {
        await this.login(phone, password);
        Utils.success('تم تسجيل الدخول بنجاح');
        this.showApp();
      } catch (err) {
        errorEl.textContent = err.message || 'فشل تسجيل الدخول';
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'تسجيل الدخول';
      }
    };

    // Allow Enter key
    document.getElementById('login-password').onkeydown = (e) => {
      if (e.key === 'Enter') btn.click();
    };
  },

  // ── Show main app ─────────────────────────────────────
  showApp() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'flex';

    // Update user info in sidebar
    const name = this.user?.full_name || 'Admin';
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-role').textContent = Utils.roleLabel(this.user?.role);
    document.getElementById('user-avatar').textContent = name[0]?.toUpperCase() || 'A';

    // Logout button
    document.getElementById('logout-btn').onclick = () => this.logout();

    // Initialize router
    Router.init();
  },

};

window.Auth = Auth;
