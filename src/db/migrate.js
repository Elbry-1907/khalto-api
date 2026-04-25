process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');

const migrations = [
  path.join(__dirname, '../../schema.sql'),
  path.join(__dirname, 'migrations/002_fcm_tokens.sql'),
  path.join(__dirname, 'migrations/003_auth_tables.sql'),
  path.join(__dirname, 'migrations/004_ads_tables.sql'),
  path.join(__dirname, 'migrations/005_notifications_commission.sql'),
  path.join(__dirname, 'migrations/006_security_privacy.sql'),
  path.join(__dirname, 'migrations/007_chat.sql'),
  path.join(__dirname, 'migrations/008_loyalty_referral.sql'),
  path.join(__dirname, 'migrations/009_pricing_analytics_food_safety.sql'),
  path.join(__dirname, 'migrations/010_branding.sql'),
  path.join(__dirname, 'migrations/011_advanced_features.sql'),
  path.join(__dirname, 'migrations/012_countries_full.sql'),
  path.join(__dirname, 'migrations/013_service_providers.sql'),
  path.join(__dirname, 'migrations/014_fix_countries_schema.sql'),
];

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(200) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    for (const filepath of migrations) {
      const filename = path.basename(filepath);

      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [filename]
      );

      if (rows.length > 0) {
        console.log(`  ⏭️  Skipping: ${filename} (already applied)`);
        continue;
      }

      if (!fs.existsSync(filepath)) {
        console.log(`  ⚠️  File not found: ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(filepath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`  ✅ Applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed: ${filename}`);
        console.error(`     Error: ${err.message}`);
        // Continue with next migration
      }
    }

    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
