/* ═══════════════════════════════════════════════════════════
   Khalto Dashboard — API Client
   ═══════════════════════════════════════════════════════════ */

const API = {

  baseURL: 'https://khaltoapp-wotek.ondigitalocean.app/api/v1',

  // ── Core fetch with auth ──────────────────────────────
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const token = localStorage.getItem('khalto_token');

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
      });

      // Handle 401 - token expired/invalid
      if (response.status === 401) {
        localStorage.removeItem('khalto_token');
        localStorage.removeItem('khalto_user');
        if (!endpoint.includes('/auth/')) {
          window.location.reload();
        }
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        throw new Error('تعذّر الاتصال بالخادم');
      }
      throw err;
    }
  },

  get(endpoint, params) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request(`${endpoint}${query}`);
  },

  post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  },

  put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  },

  patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // ═══════════════════════════════════════════════════════
  // Auth
  // ═══════════════════════════════════════════════════════

  auth: {
    login(phone, password) {
      return API.post('/auth/login', { phone, password });
    },
    me() {
      return API.get('/users/me');
    },
  },

  // ═══════════════════════════════════════════════════════
  // Dashboard
  // ═══════════════════════════════════════════════════════

  dashboard: {
    stats() {
      return API.get('/admin/dashboard');
    },
  },

  // ═══════════════════════════════════════════════════════
  // Admin
  // ═══════════════════════════════════════════════════════

  admin: {
    listOrders(params)  { return API.get('/admin/orders', params); },
    listUsers(params)   { return API.get('/admin/users', params); },
    auditLogs(params)   { return API.get('/admin/audit-logs', params); },
    createUser(body)    { return API.post('/admin/users/create', body); },
    deleteUser(id)      { return API.delete(`/admin/users/${id}`); },
    setRole(id, role)   { return API.patch(`/admin/users/${id}/role`, { role }); },
    blockUser(id)       { return API.post(`/admin/users/${id}/block`); },
    unblockUser(id)     { return API.post(`/admin/users/${id}/unblock`); },
    financialReport(p)  { return API.get('/admin/reports/financial', p); },
    opsReport(p)        { return API.get('/admin/reports/operations', p); },
  },

  // ═══════════════════════════════════════════════════════
  // Orders
  // ═══════════════════════════════════════════════════════

  orders: {
    get(id)             { return API.get(`/orders/${id}`); },
    updateStatus(id, status, note) {
      return API.patch(`/orders/${id}/status`, { status, note });
    },
  },

  // ═══════════════════════════════════════════════════════
  // Kitchens
  // ═══════════════════════════════════════════════════════

  kitchens: {
    list(params)        { return API.get('/kitchens', params); },
    get(id)             { return API.get(`/kitchens/${id}`); },
    update(id, body)    { return API.patch(`/kitchens/${id}`, body); },
    approve(id)         { return API.post(`/kitchens/${id}/approve`); },
  },

  // ═══════════════════════════════════════════════════════
  // Couriers
  // ═══════════════════════════════════════════════════════

  couriers: {
    list(params)        { return API.get('/couriers', params); },
    approve(id)         { return API.post(`/couriers/${id}/approve`); },
  },

  // ═══════════════════════════════════════════════════════
  // Countries
  // ═══════════════════════════════════════════════════════

  countries: {
    list(params)        { return API.get('/countries', params); },
    get(id)             { return API.get(`/countries/${id}`); },
    create(body)        { return API.post('/countries', body); },
    update(id, body)    { return API.put(`/countries/${id}`, body); },
    toggle(id)          { return API.put(`/countries/${id}/toggle`); },
    cities(id)          { return API.get(`/countries/${id}/cities`); },
    addCity(id, body)   { return API.post(`/countries/${id}/cities`, body); },
    seedDefaults()      { return API.post('/countries/seed/defaults'); },
  },

  // ═══════════════════════════════════════════════════════
  // Cities (NEW)
  // ═══════════════════════════════════════════════════════
  cities: {
    listAll(params)     { return API.get('/countries/cities/all', params); },
    listByCountry(id)   { return API.get(`/countries/${id}/cities`); },
    create(countryId, body) { return API.post(`/countries/${countryId}/cities`, body); },
    update(id, body)    { return API.put(`/countries/cities/${id}`, body); },
    toggle(id)          { return API.put(`/countries/cities/${id}/toggle`); },
    delete(id)          { return API.delete(`/countries/cities/${id}`); },
  },

  // ═══════════════════════════════════════════════════════
  // Settlements
  // ═══════════════════════════════════════════════════════

  settlements: {
    list(params)        { return API.get('/settlements', params); },
    get(id)             { return API.get(`/settlements/${id}`); },
    approve(id)         { return API.post(`/settlements/${id}/approve`); },
    run(body)           { return API.post('/settlements/run', body); },
  },

  // ═══════════════════════════════════════════════════════
  // Commission
  // ═══════════════════════════════════════════════════════

  commission: {
    config(params)      { return API.get('/commission/config', params); },
    updateConfig(body)  { return API.put('/commission/config', body); },
    listRules()         { return API.get('/commission/rules'); },
    addRule(body)       { return API.post('/commission/rules', body); },
    updateRule(id, body){ return API.patch(`/commission/rules/${id}`, body); },
    deleteRule(id)      { return API.delete(`/commission/rules/${id}`); },
    calcChef(body)      { return API.post('/commission/calculate/chef', body); },
    calcCourier(body)   { return API.post('/commission/calculate/courier', body); },
    stats(params)       { return API.get('/commission/stats', params); },
  },

  // ═══════════════════════════════════════════════════════
  // Coupons
  // ═══════════════════════════════════════════════════════

  coupons: {
    list()              { return API.get('/coupons'); },
    create(body)        { return API.post('/coupons', body); },
    update(id, body)    { return API.patch(`/coupons/${id}`, body); },
  },

  // ═══════════════════════════════════════════════════════
  // Notifications
  // ═══════════════════════════════════════════════════════

  notifications: {
    stats()             { return API.get('/notifications/stats'); },
    listTemplates()     { return API.get('/notifications/templates'); },
    createTemplate(body){ return API.post('/notifications/templates', body); },
    updateTemplate(key, body) { return API.put(`/notifications/templates/${key}`, body); },
    send(body)          { return API.post('/notifications/send', body); },
    broadcast(body)     { return API.post('/notifications/broadcast', body); },
    log(params)         { return API.get('/notifications/log', params); },
  },

  // ═══════════════════════════════════════════════════════
  // Branding
  // ═══════════════════════════════════════════════════════

  branding: {
    get(params)         { return API.get('/branding', params); },
    update(body)        { return API.put('/branding', body); },
    reset(body)         { return API.post('/branding/reset', body); },
    history()           { return API.get('/branding/history'); },
  },
  providers: {
    list()                  { return API.get('/providers'); },
    get(id)                 { return API.get(`/providers/${id}`); },
    update(id, config)      { return API.put(`/providers/${id}`, { config }); },
    test(id, payload)       { return API.post(`/providers/${id}/test`, payload); },
    activate(id)            { return API.post(`/providers/${id}/activate`); },
    deactivate(id)          { return API.post(`/providers/${id}/deactivate`); },
    webhooks()              { return API.get('/providers/webhooks'); },
    countryMapping()        { return API.get('/providers/country-mapping'); },
    setCountryMapping(body) { return API.put('/providers/country-mapping', body); },
    testLogs(providerId)    { return API.get(`/providers/test-logs/${providerId}`); },
  },


  providers: {
    list()                  { return API.get('/providers'); },
    get(id)                 { return API.get(`/providers/${id}`); },
    update(id, config)      { return API.put(`/providers/${id}`, { config }); },
    test(id, payload)       { return API.post(`/providers/${id}/test`, payload); },
    activate(id)            { return API.post(`/providers/${id}/activate`); },
    deactivate(id)          { return API.post(`/providers/${id}/deactivate`); },
    webhooks()              { return API.get('/providers/webhooks'); },
    countryMapping()        { return API.get('/providers/country-mapping'); },
    setCountryMapping(body) { return API.put('/providers/country-mapping', body); },
    testLogs(providerId)    { return API.get(`/providers/test-logs/${providerId}`); },
  },
    adminKitchens: {
    list(params)              { return API.get('/admin/kitchens', params); },
    stats()                   { return API.get('/admin/kitchens/stats'); },
    get(id)                   { return API.get(`/admin/kitchens/${id}`); },
    orders(id, params)        { return API.get(`/admin/kitchens/${id}/orders`, params); },
    kitchenStats(id, params)  { return API.get(`/admin/kitchens/${id}/stats`, params); },
    statusLog(id)             { return API.get(`/admin/kitchens/${id}/status-log`); },
    create(body)              { return API.post('/admin/kitchens', body); },
    update(id, body)          { return API.put(`/admin/kitchens/${id}`, body); },
    approve(id)               { return API.post(`/admin/kitchens/${id}/approve`); },
    reject(id, reason)        { return API.post(`/admin/kitchens/${id}/reject`, { reason }); },
    suspend(id, reason)       { return API.post(`/admin/kitchens/${id}/suspend`, { reason }); },
    unsuspend(id)             { return API.post(`/admin/kitchens/${id}/unsuspend`); },
    toggle(id)                { return API.put(`/admin/kitchens/${id}/toggle`); },
    setCommission(id, pct)    { return API.put(`/admin/kitchens/${id}/commission`, { commission_pct: pct }); },
  },
adminCouriers: {
    list(params)              { return API.get('/admin/couriers', params); },
    stats()                   { return API.get('/admin/couriers/stats'); },
    online(params)            { return API.get('/admin/couriers/online', params); },
    get(id)                   { return API.get(`/admin/couriers/${id}`); },
    deliveries(id, params)    { return API.get(`/admin/couriers/${id}/deliveries`, params); },
    earnings(id, params)      { return API.get(`/admin/couriers/${id}/earnings`, params); },
    statusLog(id)             { return API.get(`/admin/couriers/${id}/status-log`); },
    create(body)              { return API.post('/admin/couriers', body); },
    update(id, body)          { return API.put(`/admin/couriers/${id}`, body); },
    approve(id)               { return API.post(`/admin/couriers/${id}/approve`); },
    reject(id, reason)        { return API.post(`/admin/couriers/${id}/reject`, { reason }); },
    suspend(id, reason)       { return API.post(`/admin/couriers/${id}/suspend`, { reason }); },
    unsuspend(id)             { return API.post(`/admin/couriers/${id}/unsuspend`); },
    setPercentage(id, pct)    { return API.put(`/admin/couriers/${id}/percentage`, { delivery_percentage: pct }); },
    setAvailability(id, avail){ return API.put(`/admin/couriers/${id}/availability`, { availability: avail }); },
  },

  adminDocuments: {
    types(entityType)              { return API.get('/admin/documents/types', { entity_type: entityType }); },
    listForCourier(courierId)      { return API.get('/admin/documents/courier/' + courierId); },
    listForKitchen(kitchenId)      { return API.get('/admin/documents/kitchen/' + kitchenId); },
    checkCourier(courierId)        { return API.get('/admin/documents/courier/' + courierId + '/check'); },
    checkKitchen(kitchenId)        { return API.get('/admin/documents/kitchen/' + kitchenId + '/check'); },

    async uploadCourier(courierId, file, docType, expiresAt) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      if (expiresAt) fd.append('expires_at', expiresAt);
      const r = await fetch('/api/v1/admin/documents/courier/' + courierId + '/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('khalto_token') },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    async uploadKitchen(kitchenId, file, docType, expiresAt) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('doc_type', docType);
      if (expiresAt) fd.append('expires_at', expiresAt);
      const r = await fetch('/api/v1/admin/documents/kitchen/' + kitchenId + '/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('khalto_token') },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },

    approveCourierDoc(docId)       { return API.post('/admin/documents/courier/doc/' + docId + '/approve'); },
    approveKitchenDoc(docId)       { return API.post('/admin/documents/kitchen/doc/' + docId + '/approve'); },
    rejectCourierDoc(docId, reason){ return API.post('/admin/documents/courier/doc/' + docId + '/reject', { reason }); },
    rejectKitchenDoc(docId, reason){ return API.post('/admin/documents/kitchen/doc/' + docId + '/reject', { reason }); },
    deleteCourierDoc(docId)        { return API.delete('/admin/documents/courier/doc/' + docId); },
    deleteKitchenDoc(docId)        { return API.delete('/admin/documents/kitchen/doc/' + docId); },
  },
  adminUsers: {
    list(params)            { return API.get('/admin/users-v2', params); },
    get(id)                 { return API.get(`/admin/users-v2/${id}`); },
    actionLog(id)           { return API.get(`/admin/users-v2/${id}/action-log`); },
    create(body)            { return API.post('/admin/users-v2/create', body); },
    update(id, body)        { return API.put(`/admin/users-v2/${id}`, body); },
    resetPassword(id)       { return API.post(`/admin/users-v2/${id}/reset-password`); },
    block(id, reason)       { return API.post(`/admin/users-v2/${id}/block`, { reason }); },
    unblock(id)             { return API.post(`/admin/users-v2/${id}/unblock`); },
    delete(id)              { return API.delete(`/admin/users-v2/${id}`); },
  },
};

window.API = API;
