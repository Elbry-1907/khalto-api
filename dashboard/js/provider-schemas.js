/* ═══════════════════════════════════════════════════════════
   Provider Field Schemas
   Defines what credentials each provider needs
   ═══════════════════════════════════════════════════════════ */

const ProviderSchemas = {

  // ── SMS Providers ──────────────────────────────────────
  'sms.twilio': {
    icon: 'TW', color: '#F22F46',
    fields: [
      { key: 'account_sid', label: 'Account SID', type: 'password', placeholder: 'ACxxxxxxxx', required: true },
      { key: 'auth_token', label: 'Auth Token', type: 'password', placeholder: 'xxxxxxxx', required: true },
      { key: 'from_number', label: 'الرقم المرسِل', type: 'text', placeholder: '+1234567890', required: true },
    ],
  },
  'sms.unifonic': {
    icon: 'UF', color: '#00A651',
    fields: [
      { key: 'app_id', label: 'App ID', type: 'password', placeholder: 'App ID', required: true },
      { key: 'sender_id', label: 'Sender ID', type: 'text', placeholder: 'Khalto', required: true },
    ],
  },
  'sms.vonage': {
    icon: 'VN', color: '#6013A0',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'API Key', required: true },
      { key: 'api_secret', label: 'API Secret', type: 'password', placeholder: 'API Secret', required: true },
      { key: 'sender_id', label: 'Sender ID', type: 'text', placeholder: 'Khalto', required: true },
    ],
  },
  'sms.msg91': {
    icon: 'M91', color: '#FF6B35',
    fields: [
      { key: 'auth_key', label: 'Auth Key', type: 'password', placeholder: 'Auth Key', required: true },
      { key: 'sender_id', label: 'Sender ID', type: 'text', placeholder: 'KHALTO', required: true },
    ],
  },

  // ── WhatsApp Providers ─────────────────────────────────
  'whatsapp.twilio': {
    icon: 'TW', color: '#F22F46',
    note: 'تأكد من تفعيل WhatsApp في لوحة Twilio',
    fields: [
      { key: 'account_sid', label: 'Account SID', type: 'password', placeholder: 'AC...', required: true },
      { key: 'auth_token', label: 'Auth Token', type: 'password', placeholder: '...', required: true },
      { key: 'from_number', label: 'WhatsApp From', type: 'text', placeholder: 'whatsapp:+14155238886', required: true },
    ],
  },
  'whatsapp.meta': {
    icon: 'Meta', color: '#0866FF',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'password', placeholder: 'Phone Number ID', required: true },
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'EAAxxxx', required: true },
      { key: 'business_account_id', label: 'Business Account ID', type: 'text', placeholder: 'Business Account ID' },
    ],
  },
  'whatsapp.360dialog': {
    icon: '360', color: '#25D366',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'API Key', required: true },
      { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: 'Channel ID' },
    ],
  },

  // ── Email Providers ────────────────────────────────────
  'email.sendgrid': {
    icon: 'SG', color: '#1A82E2',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'SG.xxxxxxxx', required: true },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@khalto.app', required: true },
      { key: 'from_name', label: 'From Name', type: 'text', placeholder: 'Khalto' },
    ],
  },
  'email.mailgun': {
    icon: 'MG', color: '#CC2F3A',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'key-xxxxx', required: true },
      { key: 'domain', label: 'Domain', type: 'text', placeholder: 'mg.khalto.app', required: true },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@khalto.app', required: true },
      { key: 'region', label: 'Region', type: 'select', options: [{v:'us',l:'US'},{v:'eu',l:'EU'}], required: true },
    ],
  },
  'email.ses': {
    icon: 'SES', color: '#FF9900',
    note: 'يحتاج تثبيت AWS SDK في الخادم',
    fields: [
      { key: 'access_key', label: 'Access Key ID', type: 'password', placeholder: 'AKIAXXXX', required: true },
      { key: 'secret_key', label: 'Secret Access Key', type: 'password', placeholder: '...', required: true },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'me-south-1', required: true },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@khalto.app', required: true },
    ],
  },
  'email.resend': {
    icon: 'Re', color: '#000000',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 're_xxxxxxxx', required: true },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@khalto.app', required: true },
      { key: 'from_name', label: 'From Name', type: 'text', placeholder: 'Khalto' },
    ],
  },
  'email.smtp': {
    icon: 'SMTP', color: '#4A4A4A',
    fields: [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'smtp.gmail.com', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '587', required: true },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'user@gmail.com', required: true },
      { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••', required: true },
      { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'noreply@khalto.app', required: true },
      { key: 'encryption', label: 'Encryption', type: 'select', options: [{v:'tls',l:'TLS'},{v:'ssl',l:'SSL'},{v:'none',l:'None'}] },
    ],
  },

  // ── Payment Gateways ───────────────────────────────────
  'payment.tap': {
    icon: 'Tap', color: '#1a1a2e',
    showWebhook: 'tap',
    fields: [
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_live_xxxx أو sk_test_xxxx', required: true },
      { key: 'public_key', label: 'Public Key', type: 'password', placeholder: 'pk_live_xxxx', required: true },
    ],
  },
  'payment.paymob': {
    icon: 'Pay', color: '#6c5ce7',
    showWebhook: 'paymob',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'API Key', required: true },
      { key: 'integration_id', label: 'Integration ID', type: 'text', placeholder: 'Integration ID', required: true },
      { key: 'hmac_secret', label: 'HMAC Secret', type: 'password', placeholder: 'HMAC Secret', required: true },
      { key: 'iframe_id', label: 'iFrame ID', type: 'text', placeholder: 'iFrame ID' },
    ],
  },
  'payment.moyasar': {
    icon: 'MY', color: '#00A86B',
    fields: [
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_live_xxxx', required: true },
      { key: 'public_key', label: 'Publishable Key', type: 'text', placeholder: 'pk_live_xxxx' },
    ],
  },
  'payment.hyperpay': {
    icon: 'HP', color: '#E31837',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'Access Token', required: true },
      { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'Entity ID', required: true },
    ],
  },
  'payment.stripe': {
    icon: 'St', color: '#635BFF',
    fields: [
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_live_xxxx أو sk_test_xxxx', required: true },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password', placeholder: 'whsec_xxxxxxxx' },
    ],
  },
  'payment.cash': {
    icon: '💵', color: '#27AE60',
    note: 'بدون إعداد - تفعيل مباشر',
    fields: [],
  },
};

window.ProviderSchemas = ProviderSchemas;
