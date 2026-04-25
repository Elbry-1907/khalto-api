# ═══════════════════════════════════════════════════════════
# سكريبت تطبيق User Mgmt Mixin على صفحات Couriers و Kitchens
# يعدّل الملفين تلقائياً بدلاً من التعديل اليدوي
# ═══════════════════════════════════════════════════════════

cd "D:\OneDrive - Saudi Jawahir\Projects AI\Khaltoo\khalto-api"

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "بدء تطبيق User Mgmt Mixin على الصفحتين..." -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════`n" -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════
# 1. admin-couriers.js
# ═══════════════════════════════════════════════════════════
Write-Host "📝 تعديل admin-couriers.js..." -ForegroundColor Yellow

$file = "dashboard\pages\admin-couriers.js"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Patch 1: استبدال زرار "إجراءات" في renderInfoTab() بنسخة محسّنة
$oldActions = @"
      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-edit-courier="`${c.id}">✏️ تعديل البيانات</button>
        <button class="btn btn-secondary" data-edit-percentage="`${c.id}">💰 تعديل النسبة</button>
        `${c.status === 'active' ? ``
          <button class="btn btn-secondary" data-set-availability="online" data-courier="`${c.id}">🟢 إجبار online</button>
          <button class="btn btn-secondary" data-set-availability="offline" data-courier="`${c.id}">⚪ إجبار offline</button>
        `` : ''}
      </div>
"@

$newActions = @"
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
        <div class="ac-info-title" style="margin-bottom:10px;">⚙️ إجراءات المندوب</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" data-edit-courier="`${c.id}">✏️ تعديل بيانات المندوب</button>
          <button class="btn btn-sm btn-secondary" data-edit-percentage="`${c.id}">💰 تعديل النسبة</button>
          `${c.status === 'active' ? ``
            <button class="btn btn-sm btn-secondary" data-set-availability="online" data-courier="`${c.id}">🟢 إجبار online</button>
            <button class="btn btn-sm btn-secondary" data-set-availability="offline" data-courier="`${c.id}">⚪ إجبار offline</button>
          `` : ''}
        </div>
      </div>

      <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <div class="ac-info-title" style="margin-bottom:10px;">👤 إدارة حساب المستخدم</div>
        `${c.blocked_at ? ``
          <div style="background:#FED7D7; padding:10px; border-radius:6px; margin-bottom:10px; font-size:13px;">
            <strong>🚫 المستخدم محظور</strong>
            `${c.blocked_reason ? ``<br><span class="text-sm">السبب: `${Utils.escape(c.blocked_reason)}</span>`` : ''}
          </div>
          `${this.renderUnblockButton(c.user_id, c.user_name)}
        `` : this.renderUserActions(c.user_id, c.user_name)}
      </div>
"@

if ($content.Contains($oldActions)) {
    $content = $content.Replace($oldActions, $newActions)
    Write-Host "  ✅ تم استبدال زرار الإجراءات في renderInfoTab" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  لم يتم العثور على البلوك القديم - ربما سبق تعديله" -ForegroundColor Yellow
}

# Patch 2: إضافة attachUserActionHandlers في attachDetailHandlers
$oldAttach = @"
    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
"@

$newAttach = @"
    // User management handlers (mixin)
    if (this.attachUserActionHandlers) this.attachUserActionHandlers();

    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
"@

if ($content.Contains($oldAttach)) {
    $content = $content.Replace($oldAttach, $newAttach)
    Write-Host "  ✅ تم إضافة attachUserActionHandlers" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  لم يتم العثور على المكان - ربما سبق تعديله" -ForegroundColor Yellow
}

# Patch 3: إضافة Object.assign في النهاية بعد Router.register
$oldEnd = @"
});
"@

$newEnd = @"
});

// Apply user management mixin
if (window.UserMgmtMixin && Router.routes && Router.routes['admin-couriers']) {
  Object.assign(Router.routes['admin-couriers'], window.UserMgmtMixin);
}
"@

# نتأكد إن mixin مش متطبق بالفعل
if (-not $content.Contains("Apply user management mixin")) {
    # نطبق فقط على آخر }); وليس كل }); 
    $lastIndex = $content.LastIndexOf("});")
    if ($lastIndex -gt 0) {
        $beforePart = $content.Substring(0, $lastIndex)
        $afterPart = $content.Substring($lastIndex + 3)
        $content = $beforePart + "});`r`n`r`n// Apply user management mixin`r`nif (window.UserMgmtMixin && Router.routes && Router.routes['admin-couriers']) {`r`n  Object.assign(Router.routes['admin-couriers'], window.UserMgmtMixin);`r`n}" + $afterPart
        Write-Host "  ✅ تم إضافة mixin application" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️  mixin مطبق بالفعل" -ForegroundColor Yellow
}

# اكتب
[System.IO.File]::WriteAllText($file, $content, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "  💾 تم الحفظ`n" -ForegroundColor Green


# ═══════════════════════════════════════════════════════════
# 2. admin-kitchens.js
# ═══════════════════════════════════════════════════════════
Write-Host "📝 تعديل admin-kitchens.js..." -ForegroundColor Yellow

$file = "dashboard\pages\admin-kitchens.js"
$content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Patch 1: استبدال زرار "إجراءات" في renderInfoTab()
$oldActionsK = @"
      <div style="margin-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-secondary" data-edit-kitchen="`${k.id}">✏️ تعديل البيانات</button>
        <button class="btn btn-secondary" data-edit-commission="`${k.id}">💰 تعديل العمولة</button>
      </div>
"@

$newActionsK = @"
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
        <div class="ak-info-title" style="margin-bottom:10px;">⚙️ إجراءات المطبخ</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary" data-edit-kitchen="`${k.id}">✏️ تعديل بيانات المطبخ</button>
          <button class="btn btn-sm btn-secondary" data-edit-commission="`${k.id}">💰 تعديل العمولة</button>
        </div>
      </div>

      <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
        <div class="ak-info-title" style="margin-bottom:10px;">👤 إدارة حساب المستخدم</div>
        `${k.blocked_at ? ``
          <div style="background:#FED7D7; padding:10px; border-radius:6px; margin-bottom:10px; font-size:13px;">
            <strong>🚫 المستخدم محظور</strong>
            `${k.blocked_reason ? ``<br><span class="text-sm">السبب: `${Utils.escape(k.blocked_reason)}</span>`` : ''}
          </div>
          `${this.renderUnblockButton(k.user_id, k.owner_name)}
        `` : this.renderUserActions(k.user_id, k.owner_name)}
      </div>
"@

if ($content.Contains($oldActionsK)) {
    $content = $content.Replace($oldActionsK, $newActionsK)
    Write-Host "  ✅ تم استبدال زرار الإجراءات" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  لم يتم العثور على البلوك القديم" -ForegroundColor Yellow
}

# Patch 2: إضافة attachUserActionHandlers
$oldAttachK = @"
    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
"@

$newAttachK = @"
    // User management handlers (mixin)
    if (this.attachUserActionHandlers) this.attachUserActionHandlers();

    const closeBtn = document.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();
  },

  closeModal() {
"@

if ($content.Contains($oldAttachK)) {
    $content = $content.Replace($oldAttachK, $newAttachK)
    Write-Host "  ✅ تم إضافة attachUserActionHandlers" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  لم يتم العثور على المكان" -ForegroundColor Yellow
}

# Patch 3: mixin application
if (-not $content.Contains("Apply user management mixin")) {
    $lastIndex = $content.LastIndexOf("});")
    if ($lastIndex -gt 0) {
        $beforePart = $content.Substring(0, $lastIndex)
        $afterPart = $content.Substring($lastIndex + 3)
        $content = $beforePart + "});`r`n`r`n// Apply user management mixin`r`nif (window.UserMgmtMixin && Router.routes && Router.routes['admin-kitchens']) {`r`n  Object.assign(Router.routes['admin-kitchens'], window.UserMgmtMixin);`r`n}" + $afterPart
        Write-Host "  ✅ تم إضافة mixin application" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️  mixin مطبق بالفعل" -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($file, $content, (New-Object System.Text.UTF8Encoding($true)))
Write-Host "  💾 تم الحفظ`n" -ForegroundColor Green


# ═══════════════════════════════════════════════════════════
# الخلاصة
# ═══════════════════════════════════════════════════════════
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ تم تطبيق التعديلات على الملفين!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "الخطوات التالية:" -ForegroundColor White
Write-Host "  1. تأكد إن user-mgmt-mixin.js موجود في dashboard\js\" -ForegroundColor Gray
Write-Host "  2. تأكد إن api.js فيه adminUsers block" -ForegroundColor Gray
Write-Host "  3. تأكد إن index.html فيه <script src='js/user-mgmt-mixin.js'>" -ForegroundColor Gray
Write-Host "  4. ادفع التغييرات بـ git" -ForegroundColor Gray
