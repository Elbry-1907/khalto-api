/* ═══════════════════════════════════════════════════════════
   Khalto Dashboard — App Entry Point
   ═══════════════════════════════════════════════════════════ */

(function init() {
  Auth.init();

  if (Auth.isAuthenticated()) {
    Auth.showApp();
  } else {
    Auth.showLogin();
  }
})();
