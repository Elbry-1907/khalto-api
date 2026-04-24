# Khalto Dashboard — Modular Rebuild

Complete admin dashboard for Khalto platform. Rebuilt from monolithic 154KB single-file into clean modular architecture.

## 📁 Structure

```
dashboard/
├── index.html           # Shell HTML (login + app layout)
├── css/
│   ├── base.css         # Layout, colors, typography
│   └── components.css   # Buttons, cards, tables, forms, modals
├── js/
│   ├── utils.js         # Formatting, toasts, modals, helpers
│   ├── api.js           # Centralized API client (all endpoints)
│   ├── auth.js          # Login, logout, session
│   ├── router.js        # Page switching
│   └── app.js           # Entry point
└── pages/
    ├── dashboard.js     # KPIs + 7-day chart + quick actions
    ├── orders.js        # List, filter, details, status transitions
    ├── kitchens.js      # List, approve, edit
    ├── couriers.js      # List, approve
    ├── customers.js     # List, search, block/unblock
    ├── settlements.js   # List, run batches, approve
    ├── commission.js    # Rules CRUD + chef calculator
    ├── coupons.js       # List, create (with valid_from), toggle
    ├── notifications.js # Broadcast form + stats
    ├── branding.js      # Form + live preview
    ├── countries.js     # Cards + add/edit/toggle + seed defaults
    └── team.js          # List all roles + add + permissions matrix
```

**18 files · ~4000 lines · vanilla JS · no build step**

---

## 🎨 Brand

- **Coral:** `#E8603C` (primary)
- **Navy:** `#1a1a2e` (secondary)
- **Font:** Cairo (Arabic) + Inter (Latin)
- **Direction:** RTL (Arabic)

---

## 🚀 Deploy to DigitalOcean

### 1. Backup the old dashboard

```powershell
cd D:\OneDrive*\Projects*\Khaltoo\khalto-api

# Rename old monolithic file (don't delete — keep as backup)
Rename-Item dashboard\index.html dashboard\index.old.html
```

### 2. Extract the ZIP into `dashboard/`

Extract `khalto-dashboard.zip` into your repo's `dashboard/` folder. Final structure:

```
khalto-api/
├── dashboard/
│   ├── index.html       ← NEW
│   ├── index.old.html   (backup, ignore)
│   ├── css/
│   ├── js/
│   └── pages/
├── src/
└── ...
```

### 3. Update backend to serve subfolder

The old setup served a single file. The new dashboard needs to serve multiple files (CSS, JS). Add this to `src/index.js` if it's not already there:

```javascript
// After middleware setup, before routes
const path = require('path');
app.use('/khalto-api-dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
```

If you had something like `res.sendFile('dashboard/index.html')` route — **remove it**. The `express.static` call above handles everything.

### 4. Push to GitHub

```powershell
git add dashboard/
git commit -m "feat: rebuild dashboard as modular multi-file structure"
git push
```

DigitalOcean auto-deploy will kick in within ~1 minute.

### 5. Test

Open `https://khaltoapp-wotek.ondigitalocean.app/khalto-api-dashboard`

Login credentials:
- Phone: `+966500000001`
- Password: `Admin@khalto123`

---

## ✅ What Works Out of the Box

All pages connect to the real backend and handle:
- ✅ Login with role validation (rejects non-admin accounts)
- ✅ Session persistence via `localStorage`
- ✅ Auto-logout on 401 (expired token)
- ✅ Arabic + RTL throughout
- ✅ Loading, empty, and error states
- ✅ Modals with backdrop click to close
- ✅ Toast notifications (success/error/info)
- ✅ Client-side pagination
- ✅ Live preview (branding page)
- ✅ Status badges with Arabic labels
- ✅ Order status transitions with validation (only valid next statuses shown)
- ✅ Refresh button re-fetches current page
- ✅ Hash-based routing (shareable URLs like `#orders`)

---

## 🐛 Known Backend Limitations

These aren't dashboard bugs — they reflect what the backend currently supports:

1. **Kitchens filter by status:** The public `/kitchens` endpoint only returns `status=active`. Filter "بانتظار الموافقة" won't show pending kitchens until you add an admin endpoint like `GET /admin/kitchens?status=pending_review`.

2. **Couriers admin list:** Works fine — uses `GET /couriers` with admin auth.

3. **Customers search:** Does client-side filtering on the current page. For proper search across all pages, backend needs `?search=` param on `/admin/users`.

4. **Commission calculator:** Only supports chef calc right now. Courier calc is in the API but not wired into UI.

---

## 🔧 To Extend

### Add a new page

1. Create `pages/mypage.js`:
   ```javascript
   Router.register('mypage', {
     async render(container) {
       container.innerHTML = `<div class="card">...</div>`;
     },
   });
   ```

2. Add script tag to `index.html`:
   ```html
   <script src="pages/mypage.js"></script>
   ```

3. Add nav item in `index.html` sidebar:
   ```html
   <a class="nav-item" data-page="mypage">
     <span class="nav-icon">🎯</span><span>صفحتي</span>
   </a>
   ```

4. Add page title in `router.js` `titles` map.

### Add a new API endpoint

In `js/api.js`, add under the relevant resource:

```javascript
mything: {
  list(params) { return API.get('/mything', params); },
  create(body) { return API.post('/mything', body); },
},
```

---

## 📋 Changes From Previous Version

| Before | After |
|--------|-------|
| Single 154KB HTML file | 18 modular files |
| 3000+ lines in one file | Largest file is ~650 lines |
| Fix one → break another | Each page is isolated |
| Inline CSS/JS | Proper separation |
| No routing | Hash-based routing with state |
| Manual refresh required | Refresh button re-renders |
| No session check | Auto-logout on 401 |

---

## 🎯 Soft Launch Checklist

Before inviting first 10 users:

- [ ] Deploy this dashboard (steps above)
- [ ] Test login works
- [ ] Run "إضافة SA + EG" on Countries page
- [ ] Set commission rules
- [ ] Test order flow end-to-end via mobile apps
- [ ] Verify notifications work (send a test broadcast)
- [ ] Check branding displays correctly on mobile apps
