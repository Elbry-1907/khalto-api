# 🍽️ Khalto API — Backend v2.0

> Home-Cooked Food Delivery Platform — Node.js + PostgreSQL

---

## ⚡ Quick Start

```bash
# 1. Clone & install
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start with Docker (recommended)
npm run docker:up

# API: http://localhost:3000
# Docs: http://localhost:3000/api/docs
# pgAdmin: http://localhost:5050
```

---

## 🏗️ Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework | Express.js 4 |
| Database | PostgreSQL 15 + PostGIS |
| ORM | Knex.js |
| Cache / Queue | Redis + Bull |
| Real-time | Socket.IO |
| Push | Firebase Admin SDK |
| SMS | Twilio |
| Email | SendGrid |
| Storage | AWS S3 / Cloudflare R2 |
| Container | Docker + docker-compose |
| Docs | Swagger / OpenAPI 3 |

---

## 📁 Structure

```
src/
├── index.js              ← Entry point
├── db/
│   └── index.js          ← Knex connection
├── middleware/
│   ├── auth.js           ← JWT + role guards
│   ├── errors.js         ← Error handler
│   └── security.js       ← Helmet, rate limits, CORS
├── routes/               ← 16 route modules
│   ├── auth.js           ← Registration + OTP + social + biometric
│   ├── users.js          ← Profile + addresses
│   ├── kitchens.js       ← Kitchen CRUD + discovery
│   ├── menu.js           ← Categories + items
│   ├── orders.js         ← Full order lifecycle
│   ├── couriers.js       ← Courier management
│   ├── payments.js       ← Tap + Paymob + webhooks
│   ├── settlements.js    ← Chef & courier payouts
│   ├── coupons.js        ← Coupons + gifts
│   ├── notifications.js  ← Templates + broadcast
│   ├── support.js        ← Tickets + disputes
│   ├── admin.js          ← Dashboard + operations
│   ├── countries.js      ← Geo config
│   ├── uploads.js        ← S3 file upload
│   ├── ads.js            ← Social media pixels + campaigns
│   └── commission.js     ← Commission engine
├── services/
│   ├── push.service.js   ← Firebase FCM
│   ├── email.service.js  ← SendGrid templates
│   ├── sms.service.js    ← Twilio (SA + EG)
│   ├── upload.service.js ← Multer + S3
│   └── pixels.service.js ← Meta/Snap/TikTok/Google CAPI
├── sockets/
│   └── index.js          ← Real-time events
├── utils/
│   ├── logger.js         ← Winston
│   └── swagger.js        ← API docs
└── validators/
    └── index.js          ← Joi schemas
```

---

## 🔑 API Endpoints

### Auth `/api/v1/auth`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | تسجيل مستخدم جديد |
| POST | `/login` | دخول بكلمة مرور |
| POST | `/otp/send` | إرسال OTP |
| POST | `/otp/verify` | تحقق من OTP → JWT |
| POST | `/social` | دخول بـ Google/Apple/Facebook |
| POST | `/biometric/enable` | تفعيل البصمة |
| POST | `/biometric/verify` | دخول بالبصمة |
| POST | `/refresh` | تجديد JWT |
| POST | `/fcm-token` | تسجيل FCM token |
| GET  | `/me` | بيانات المستخدم الحالي |
| GET  | `/status` | حالة الحساب (شيف/مندوب) |
| POST | `/logout` | تسجيل خروج |

### Orders `/api/v1/orders`
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | إنشاء طلب جديد |
| GET | `/` | طلبات المستخدم |
| GET | `/:id` | تفاصيل طلب |
| PATCH | `/:id/status` | تحديث حالة الطلب |
| POST | `/:id/rate` | تقييم الطلب |
| GET | `/admin/all` | كل الطلبات (admin) |

### Kitchens `/api/v1/kitchens`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | قائمة المطابخ (discovery) |
| POST | `/` | إنشاء مطبخ |
| GET | `/:id` | تفاصيل مطبخ |
| PATCH | `/:id` | تحديث مطبخ |
| PATCH | `/:id/availability` | فتح/إغلاق |

### Notifications `/api/v1/notifications`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | قائمة القوالب |
| POST | `/templates` | قالب جديد |
| PUT | `/templates/:key` | تحديث قالب |
| POST | `/send` | إرسال لمستخدمين |
| POST | `/broadcast` | إرسال لشريحة |
| GET | `/stats` | إحصائيات |

### Commission `/api/v1/commission`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/config` | إعدادات العمولة |
| PUT | `/config` | تحديث الإعدادات |
| GET | `/rules` | قواعد العمولة |
| POST | `/rules` | قاعدة جديدة |
| POST | `/calculate/chef` | حساب دفعة الشيف |
| POST | `/calculate/courier` | حساب دفعة المندوب |
| POST | `/calculate/order` | حساب كامل للطلب |

### Ads `/api/v1/ads`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/config/:platform` | إعدادات Pixel |
| POST | `/pixel/event` | إرسال حدث server-side |
| POST | `/pixel/test` | اختبار حدث |
| GET/POST | `/campaigns` | إدارة الحملات |
| GET/POST | `/audiences` | Custom Audiences |

---

## 🔌 Socket.IO Events

```js
// Courier location (emitted by courier app)
socket.emit('courier:location', { order_id, lat, lng });

// Order status (received by customer)
socket.on('order:status', (data) => {});

// New order alert (received by chef)
socket.on('chef:new_order', (data) => {});

// New job (received by courier)
socket.on('courier:new_job', (data) => {});
```

---

## 💡 Auto-fired Pixel Events

```js
const pixels = require('./services/pixels.service');

// Called automatically from routes:
pixels.onPurchase({ orderId, userId, total, currency, items });
pixels.onCustomerSignup({ userId });
pixels.onChefSignup({ userId });
pixels.onCourierSignup({ userId });
pixels.onAddToCart({ userId, itemId, price });
pixels.onInitiateCheckout({ userId, total });
```

---

## 🐳 Docker

```bash
# Start all services
npm run docker:up

# Services:
# - API:      http://localhost:3000
# - PostgreSQL: localhost:5432
# - Redis:    localhost:6379
# - pgAdmin:  http://localhost:5050 (with --profile tools)
```

---

## 🌍 Markets
🇸🇦 Saudi Arabia (SAR, +966) · 🇪🇬 Egypt (EGP, +20)

---

*Khalto API v2.0 · Built for scale*
