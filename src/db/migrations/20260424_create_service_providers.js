/**
 * Khalto — Service Providers Migration
 *
 * Tables:
 *   service_providers          — All available providers + their encrypted credentials
 *   country_provider_mapping   — Per-country active provider for each service
 *   provider_test_logs         — History of test sends for debugging
 */

exports.up = async function(knex) {
  // ── service_providers ─────────────────────────────────
  await knex.schema.createTable('service_providers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('service_type', 20).notNullable();      // sms | whatsapp | email | payment
    t.string('provider_key', 50).notNullable();      // twilio | unifonic | sendgrid | tap | ...
    t.string('display_name_ar', 100);
    t.string('display_name_en', 100);
    t.string('description_ar', 200);
    t.text('config_encrypted');                       // JSON of credentials, AES-encrypted
    t.boolean('is_configured').defaultTo(false);
    t.boolean('is_active').defaultTo(false);          // Globally enabled (vs configured)
    t.string('status', 20).defaultTo('not_configured'); // not_configured | configured | tested_ok | tested_failed
    t.timestamp('last_tested_at');
    t.text('last_test_result');
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.unique(['service_type', 'provider_key']);
    t.index(['service_type', 'is_active']);
  });

  // ── country_provider_mapping ─────────────────────────
  // Determines which provider is used for each (country, service) pair
  await knex.schema.createTable('country_provider_mapping', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('country_id').references('id').inTable('countries').onDelete('CASCADE');
    t.string('service_type', 20).notNullable();
    t.uuid('provider_id').references('id').inTable('service_providers').onDelete('CASCADE');
    t.boolean('cash_on_delivery').defaultTo(false); // For payment service only
    t.timestamps(true, true);

    t.unique(['country_id', 'service_type']);
    t.index(['country_id']);
  });

  // ── provider_test_logs ────────────────────────────────
  await knex.schema.createTable('provider_test_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('provider_id').references('id').inTable('service_providers').onDelete('CASCADE');
    t.string('test_type', 20);    // send | status | connection
    t.string('recipient', 100);
    t.boolean('success');
    t.text('response_message');
    t.uuid('tested_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index(['provider_id', 'created_at']);
  });

  // ── Seed default provider entries (just metadata, not credentials) ──
  const providers = [
    // SMS
    { service_type: 'sms', provider_key: 'twilio',   display_name_en: 'Twilio',   display_name_ar: 'Twilio',   description_ar: 'الأشهر عالميًا · يدعم WhatsApp' },
    { service_type: 'sms', provider_key: 'unifonic', display_name_en: 'Unifonic', display_name_ar: 'Unifonic', description_ar: 'السعودية والخليج · أسعار محلية' },
    { service_type: 'sms', provider_key: 'vonage',   display_name_en: 'Vonage',   display_name_ar: 'Vonage',   description_ar: 'عالمي · بديل Twilio' },
    { service_type: 'sms', provider_key: 'msg91',    display_name_en: 'MSG91',    display_name_ar: 'MSG91',    description_ar: 'اقتصادي · مناسب للحجم الكبير' },

    // WhatsApp
    { service_type: 'whatsapp', provider_key: 'twilio',    display_name_en: 'Twilio WhatsApp', display_name_ar: 'Twilio WhatsApp', description_ar: 'Sandbox للتطوير · Business للإنتاج' },
    { service_type: 'whatsapp', provider_key: 'meta',      display_name_en: 'Meta Business',   display_name_ar: 'Meta Business',   description_ar: 'مباشر من Meta · الأسرع والأرخص' },
    { service_type: 'whatsapp', provider_key: '360dialog', display_name_en: '360Dialog',       display_name_ar: '360Dialog',       description_ar: 'شريك Meta معتمد' },

    // Email
    { service_type: 'email', provider_key: 'sendgrid', display_name_en: 'SendGrid', display_name_ar: 'SendGrid', description_ar: 'الأشهر · مجاني حتى 100/يوم' },
    { service_type: 'email', provider_key: 'mailgun',  display_name_en: 'Mailgun',  display_name_ar: 'Mailgun',  description_ar: 'مرن · API قوي' },
    { service_type: 'email', provider_key: 'ses',      display_name_en: 'Amazon SES', display_name_ar: 'Amazon SES', description_ar: 'الأرخص · $0.10 / 1000 إيميل' },
    { service_type: 'email', provider_key: 'resend',   display_name_en: 'Resend',   display_name_ar: 'Resend',   description_ar: 'الأحدث · مجاني 3000/شهر' },
    { service_type: 'email', provider_key: 'smtp',     display_name_en: 'SMTP Custom', display_name_ar: 'SMTP مخصص', description_ar: 'Gmail / Outlook / أي SMTP' },

    // Payment
    { service_type: 'payment', provider_key: 'tap',      display_name_en: 'Tap Payments', display_name_ar: 'Tap Payments', description_ar: 'السعودية والخليج · KNET · مدى · Apple Pay' },
    { service_type: 'payment', provider_key: 'paymob',   display_name_en: 'Paymob',       display_name_ar: 'Paymob',       description_ar: 'مصر · Fawry · Wallet · Visa' },
    { service_type: 'payment', provider_key: 'moyasar',  display_name_en: 'Moyasar',      display_name_ar: 'Moyasar',      description_ar: 'سعودي محلي · مدى · STC Pay' },
    { service_type: 'payment', provider_key: 'hyperpay', display_name_en: 'HyperPay',     display_name_ar: 'HyperPay',     description_ar: 'خليج ومصر · Mada · Fawry' },
    { service_type: 'payment', provider_key: 'stripe',   display_name_en: 'Stripe',       display_name_ar: 'Stripe',       description_ar: 'عالمي · للتوسع الدولي' },
    { service_type: 'payment', provider_key: 'cash',     display_name_en: 'Cash on Delivery', display_name_ar: 'كاش عند التسليم', description_ar: 'بدون إعداد · تفعيل مباشر' },
  ];

  await knex('service_providers').insert(providers);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('provider_test_logs');
  await knex.schema.dropTableIfExists('country_provider_mapping');
  await knex.schema.dropTableIfExists('service_providers');
};
