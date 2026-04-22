# 🔒 Khalto Security Checklist
## قائمة الحماية الشاملة للمنصة

---

## ✅ Backend Security

### Authentication & Authorization
- [x] JWT with short expiry (7 days) + Refresh tokens (30 days)
- [x] OTP-based login — no passwords by default
- [x] Bcrypt password hashing (12 rounds)
- [x] Role-based access control (RBAC) — 9 roles
- [x] JWT payload contains minimal data (id + role only)
- [x] Biometric authentication (Touch ID / Face ID) via backend
- [x] Social auth verification (Google/Apple/Facebook token verify)
- [x] Auto-logout on token expiry
- [ ] **TODO**: Refresh token rotation (revoke old on use)
- [ ] **TODO**: Device fingerprinting

### Input Validation & Sanitization
- [x] Joi validation on all endpoints
- [x] MongoDB operator injection prevention
- [x] XSS sanitization middleware
- [x] SQL injection pattern detection
- [x] Path traversal blocking
- [x] HTTP Parameter Pollution (HPP) prevention
- [x] Request size limits (10MB max)
- [x] File type validation for uploads

### Rate Limiting & DDoS
- [x] Global API rate limit: 300 req/15min
- [x] Auth endpoints: 10 req/15min
- [x] OTP by phone: 5 req/hour
- [x] Payment endpoints: 20 req/min
- [x] Upload endpoints: 10 req/5min
- [x] Auto-block IPs after 20 failed attempts
- [ ] **TODO**: Redis-based distributed rate limiting
- [ ] **TODO**: Cloudflare WAF integration

### Headers & Network
- [x] Helmet.js security headers
- [x] HSTS with preload (1 year)
- [x] Content Security Policy
- [x] CORS with strict origin whitelist
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Request ID tracking

### CSRF
- [x] CSRF token generation for web admin panel
- [x] CSRF verification on all mutating requests
- [x] Mobile apps exempt (use JWT instead)

### Data Security
- [x] AES-256-GCM encryption for PII at rest
- [x] Sensitive field masking in logs
- [x] Webhook signature verification (Tap + Paymob)
- [x] S3 bucket: private + CloudFront signed URLs
- [x] HTTPS only (no HTTP in production)
- [ ] **TODO**: Database connection encryption (SSL)
- [ ] **TODO**: Secrets management (AWS Secrets Manager)

---

## ✅ Payment Security

### PCI Compliance
- [x] Card data never touches our servers (handled by Tap/Paymob)
- [x] Tap.company is PCI DSS Level 1 certified
- [x] Paymob is PCI DSS compliant
- [x] Webhook HMAC signature verification
- [x] Idempotency on payment creation
- [x] Payment amount verified server-side (not trusted from client)
- [ ] **TODO**: PCI SAQ-A form completion

### Financial Data
- [x] IBAN encrypted at rest (AES-256-GCM)
- [x] Settlement calculations server-side only
- [x] Dual-approval for settlement payouts > SAR 10,000
- [x] Full audit log for all financial events

---

## ✅ Mobile App Security

### Flutter
- [x] Flutter Secure Storage (AES-256 Android / Keychain iOS)
- [x] JWT stored in secure storage (not SharedPreferences)
- [x] Code obfuscation (`--obfuscate` build flag)
- [x] Certificate pinning (SHA-256 fingerprints)
- [x] Network security config (Android) — HTTPS only
- [x] `allowBackup="false"` (Android)
- [x] Biometric authentication (local_auth package)
- [x] ProGuard rules for APK hardening
- [ ] **TODO**: Root/jailbreak detection (flutter_jailbreak_detection)
- [ ] **TODO**: Emulator detection
- [ ] **TODO**: Screenshot prevention for sensitive screens

### API Communication
- [x] All requests over HTTPS
- [x] Certificate pinning to api.khalto.app
- [x] JWT auto-refresh on 401
- [x] Request timeout (10s connect, 30s receive)
- [x] X-Mobile-App header identifies mobile clients

---

## ✅ Data Privacy (PDPL/GDPR)

### User Rights
- [x] Data export (Article 18 PDPL) — `/privacy/my-data`
- [x] Account deletion with anonymization — `/privacy/delete-account`
- [x] Consent management — `/privacy/consent`
- [x] Consent audit trail

### Data Minimization
- [x] Collect only necessary data
- [x] Mask PII in logs (phone shows as `+966****xx`)
- [x] Retention policy: audit logs 2yr, notifications 90d
- [x] Automated cleanup function (PostgreSQL)

### Compliance
- [ ] **TODO**: Privacy Policy page (Arabic + English)
- [ ] **TODO**: Terms of Service (Arabic + English)
- [ ] **TODO**: Cookie consent banner (web admin)
- [ ] **TODO**: Data Processing Agreement with vendors
- [ ] **TODO**: PDPL registration with SDAIA (Saudi Arabia)

---

## 🔴 Critical TODOs Before Production

| Priority | Task | Effort |
|----------|------|--------|
| 🔴 CRITICAL | SSL certificate for api.khalto.app | 1 hour |
| 🔴 CRITICAL | Update cert pinning fingerprints in mobile apps | 30 min |
| 🔴 CRITICAL | Set ENCRYPTION_KEY in .env (32 bytes hex) | 10 min |
| 🔴 CRITICAL | Set JWT_SECRET (32+ chars random) | 10 min |
| 🔴 CRITICAL | Restrict S3 bucket to private | 30 min |
| 🟡 HIGH | Add Cloudflare WAF in front of API | 2 hours |
| 🟡 HIGH | Redis-based rate limiting (for scaling) | 4 hours |
| 🟡 HIGH | Penetration testing | 2 weeks |
| 🟡 HIGH | PDPL registration with SDAIA | 1 week |
| 🟢 MEDIUM | Root/jailbreak detection in mobile | 2 hours |
| 🟢 MEDIUM | Screenshot prevention on payment screens | 1 hour |
| 🟢 MEDIUM | Bug bounty program | ongoing |

---

## 🔧 Environment Variables for Security

```bash
# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=<64 hex chars>

# JWT (generate with: openssl rand -base64 48)
JWT_SECRET=<48+ random chars>
JWT_REFRESH_SECRET=<48+ random chars>

# IP blocklist (comma-separated)
BLOCKED_IPS=

# Allowed origins (production)
ALLOWED_ORIGINS=https://admin.khalto.app,https://khalto.app

# Payment webhook secrets
TAP_SECRET_KEY=sk_live_xxx
PAYMOB_HMAC_SECRET=xxx
```

---

## 📊 Security Monitoring

Set up alerts for:
- 🚨 More than 10 failed logins per IP in 15 minutes
- 🚨 IP auto-blocked
- 🚨 Webhook signature mismatch
- 🚨 Certificate pinning failure (from mobile error logs)
- 🚨 SQL injection pattern detected
- 🚨 Unusual settlement amounts (> 2× average)

Recommended: **Sentry** for error tracking + **Datadog** for security monitoring

---

*Khalto Security Checklist v2.0*
