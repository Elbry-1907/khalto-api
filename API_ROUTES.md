# Khalto API — Routes Reference v1.0

Base URL: `https://api.khalto.app/api/v1`

Auth header: `Authorization: Bearer <token>`

---

## Auth
| Method | Endpoint             | Access  | Description             |
|--------|----------------------|---------|-------------------------|
| POST   | /auth/register       | Public  | Register new user       |
| POST   | /auth/login          | Public  | Login with password     |
| POST   | /auth/otp/send       | Public  | Send OTP to phone       |
| POST   | /auth/otp/verify     | Public  | Verify OTP → token      |
| GET    | /auth/me             | Auth    | Get current user        |
| POST   | /auth/refresh        | Auth    | Refresh token           |

---

## Users
| Method | Endpoint                  | Access   | Description           |
|--------|---------------------------|----------|-----------------------|
| GET    | /users/me                 | Auth     | Profile               |
| PATCH  | /users/me                 | Auth     | Update profile        |
| GET    | /users/me/addresses       | Customer | List addresses        |
| POST   | /users/me/addresses       | Customer | Add address           |
| PATCH  | /users/me/addresses/:id   | Customer | Update address        |
| DELETE | /users/me/addresses/:id   | Customer | Delete address        |
| GET    | /users/me/wallet          | Auth     | Wallet balance & txns |

---

## Kitchens
| Method | Endpoint                  | Access     | Description            |
|--------|---------------------------|------------|------------------------|
| GET    | /kitchens                 | Public     | Browse (filter/search) |
| GET    | /kitchens/:id             | Public     | Kitchen detail         |
| POST   | /kitchens                 | Chef       | Create kitchen         |
| PATCH  | /kitchens/:id             | Chef/Admin | Update kitchen         |
| POST   | /kitchens/:id/approve     | Operations | Approve kitchen        |
| POST   | /kitchens/:id/suspend     | Operations | Suspend kitchen        |
| GET    | /kitchens/:id/stats       | Chef/Admin | Kitchen stats          |
| POST   | /kitchens/:id/schedule    | Chef       | Set schedule           |
| POST   | /kitchens/:id/documents   | Chef       | Upload documents       |

---

## Menu
| Method | Endpoint                       | Access     | Description          |
|--------|--------------------------------|------------|----------------------|
| GET    | /menu/kitchens/:kitchen_id     | Public     | Full menu            |
| POST   | /menu/categories               | Chef       | Create category      |
| PATCH  | /menu/categories/:id           | Chef       | Update category      |
| DELETE | /menu/categories/:id           | Chef       | Delete category      |
| POST   | /menu/items                    | Chef       | Create menu item     |
| PATCH  | /menu/items/:id                | Chef       | Update menu item     |
| DELETE | /menu/items/:id                | Chef       | Delete menu item     |
| PATCH  | /menu/items/:id/availability   | Chef       | Toggle availability  |

---

## Orders
| Method | Endpoint                  | Access      | Description             |
|--------|---------------------------|-------------|-------------------------|
| POST   | /orders                   | Customer    | Place order             |
| GET    | /orders                   | Auth        | List orders             |
| GET    | /orders/:id               | Auth        | Order detail            |
| PATCH  | /orders/:id/status        | Auth        | Update status           |
| POST   | /orders/:id/rate          | Customer    | Rate order              |
| POST   | /orders/:id/cancel        | Auth        | Cancel order            |
| GET    | /orders/:id/tracking      | Auth        | Live tracking data      |

---

## Couriers
| Method | Endpoint                       | Access     | Description           |
|--------|--------------------------------|------------|-----------------------|
| POST   | /couriers                      | Courier    | Register as courier   |
| PATCH  | /couriers/me                   | Courier    | Update profile        |
| PATCH  | /couriers/me/availability      | Courier    | Go online/offline     |
| POST   | /couriers/me/location          | Courier    | Update location       |
| GET    | /couriers/me/jobs              | Courier    | Available & active    |
| POST   | /couriers/me/jobs/:id/accept   | Courier    | Accept job            |
| PATCH  | /couriers/me/jobs/:id/status   | Courier    | Update job status     |
| GET    | /couriers/me/earnings          | Courier    | Earnings summary      |
| POST   | /couriers/:id/approve          | Operations | Approve courier       |

---

## Payments
| Method | Endpoint                   | Access    | Description            |
|--------|----------------------------|-----------|------------------------|
| POST   | /payments/initiate         | Customer  | Initiate payment       |
| POST   | /payments/webhook/tap      | Public    | Tap.company webhook    |
| POST   | /payments/webhook/paymob   | Public    | Paymob webhook         |
| POST   | /payments/:id/refund       | Admin/CS  | Issue refund           |
| GET    | /payments/order/:order_id  | Auth      | Payment for order      |

---

## Settlements
| Method | Endpoint                    | Access   | Description             |
|--------|-----------------------------|----------|-------------------------|
| GET    | /settlements                | Finance  | List settlements        |
| GET    | /settlements/:id            | Finance  | Settlement detail       |
| POST   | /settlements/:id/approve    | Finance  | Approve settlement      |
| POST   | /settlements/run            | Finance  | Run payout batch        |
| GET    | /settlements/me             | Chef/Courier | My settlements      |

---

## Coupons
| Method | Endpoint                   | Access     | Description          |
|--------|----------------------------|------------|----------------------|
| POST   | /coupons                   | Marketing  | Create coupon        |
| GET    | /coupons                   | Admin      | List coupons         |
| PATCH  | /coupons/:id               | Marketing  | Update coupon        |
| POST   | /coupons/validate          | Customer   | Validate coupon code |
| POST   | /coupons/gifts             | Customer   | Send gift card       |
| POST   | /coupons/gifts/redeem      | Customer   | Redeem gift card     |

---

## Notifications
| Method | Endpoint                           | Access    | Description             |
|--------|------------------------------------|-----------|-------------------------|
| GET    | /notifications                     | Auth      | My notifications        |
| PATCH  | /notifications/:id/read            | Auth      | Mark as read            |
| POST   | /notifications/mark-all-read       | Auth      | Mark all read           |
| GET    | /notifications/templates           | Admin     | List templates          |
| PATCH  | /notifications/templates/:key      | Marketing | Update template         |
| POST   | /notifications/send                | Marketing | Send broadcast          |

---

## Support
| Method | Endpoint                       | Access   | Description          |
|--------|--------------------------------|----------|----------------------|
| POST   | /support/tickets               | Auth     | Create ticket        |
| GET    | /support/tickets               | Auth     | List tickets         |
| GET    | /support/tickets/:id           | Auth     | Ticket detail        |
| POST   | /support/tickets/:id/messages  | Auth     | Add message          |
| PATCH  | /support/tickets/:id/status    | CS/Admin | Update ticket status |
| POST   | /support/tickets/:id/compensate| CS/Admin | Issue compensation   |

---

## Countries & Geography
| Method | Endpoint              | Access | Description         |
|--------|-----------------------|--------|---------------------|
| GET    | /countries            | Public | List active countries|
| GET    | /countries/:code/cities | Public | Cities in country  |
| GET    | /countries/:code/zones  | Public | Delivery zones     |

---

## Admin
| Method | Endpoint                    | Access      | Description          |
|--------|-----------------------------|-------------|----------------------|
| GET    | /admin/dashboard            | Admin       | KPI overview         |
| GET    | /admin/orders               | Operations  | All orders           |
| GET    | /admin/kitchens             | Operations  | All kitchens         |
| GET    | /admin/couriers             | Operations  | All couriers         |
| GET    | /admin/users                | SuperAdmin  | All users            |
| GET    | /admin/reports/financial    | Finance     | Financial report     |
| GET    | /admin/reports/operations   | Operations  | Operations report    |
| GET    | /admin/audit-logs           | SuperAdmin  | Audit trail          |

---

## WebSocket Events (Socket.IO)

### Client → Server
| Event                 | Payload                         | Description          |
|-----------------------|---------------------------------|----------------------|
| `order:join`          | `{ order_id }`                  | Join order room      |
| `courier:location`    | `{ order_id, lat, lng }`        | Update location      |
| `kitchen:toggle`      | `{ is_open }`                   | Toggle open/closed   |
| `courier:availability`| `{ availability }`              | Go online/offline    |

### Server → Client
| Event              | Payload                              | Description          |
|--------------------|--------------------------------------|----------------------|
| `order:status`     | `{ order_id, status }`               | Status changed       |
| `courier:location` | `{ lat, lng, ts }`                   | Courier moved        |
| `order:new`        | `{ order_id, ... }`                  | New order (chef)     |
| `job:available`    | `{ job_id, kitchen, payout, dist }`  | New job (courier)    |

## Ads & Social Media Pixels

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/ads/config` | كل إعدادات المنصات | Admin/Marketing |
| GET | `/api/v1/ads/config/:platform` | إعدادات منصة واحدة | Admin/Marketing |
| PUT | `/api/v1/ads/config/:platform` | تحديث إعدادات منصة | Admin/Marketing |
| GET | `/api/v1/ads/stats` | إحصائيات الأحداث والحملات | Admin/Marketing |
| GET | `/api/v1/ads/campaigns` | قائمة الحملات | Admin/Marketing |
| POST | `/api/v1/ads/campaigns` | حملة إعلانية جديدة | Admin/Marketing |
| PATCH | `/api/v1/ads/campaigns/:id` | تحديث حملة | Admin/Marketing |
| DELETE | `/api/v1/ads/campaigns/:id` | حذف حملة | Super Admin |
| GET | `/api/v1/ads/audiences` | Custom Audiences | Admin/Marketing |
| POST | `/api/v1/ads/audiences` | جمهور جديد | Admin/Marketing |
| POST | `/api/v1/ads/pixel/event` | إرسال حدث server-side | Admin/Marketing |
| POST | `/api/v1/ads/pixel/test` | اختبار حدث | Admin/Marketing |

### Platforms: `facebook` | `instagram` | `snapchat` | `tiktok` | `twitter` | `google`

### Auto-fired Events (pixels.service.js)
| Event | Trigger |
|-------|---------|
| `Purchase` | Tap/Paymob webhook → payment CAPTURED |
| `CompleteRegistration` | OTP verify → new customer |
| `ChefSignup` | New chef registered |
| `CourierSignup` | New courier registered |
| `AddToCart` | Customer adds item |
| `InitiateCheckout` | Customer starts checkout |
| `KitchenView` | Customer opens kitchen |
| `CouponApplied` | Coupon validated |
