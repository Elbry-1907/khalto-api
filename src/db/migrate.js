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
  path.join(__dirname, 'migrations/015_fix_orders_audit.sql'),
  path.join(__dirname, 'migrations/016_force_fix.sql'),
  path.join(__dirname, 'migrations/017_admin_kitchens.sql'),
  path.join(__dirname, 'migrations/018_admin_couriers.sql'),
  path.join(__dirname, 'migrations/019_fix_users.sql'),
  path.join(__dirname, 'migrations/020_user_mgmt_documents.sql'),
  path.join(__dirname, 'migrations/021_country_defaults.sql'),
  path.join(__dirname, 'migrations/022_force_country_defaults.sql'),
  path.join(__dirname, 'migrations/023_documents_system.sql'),
  path.join(__dirname, 'migrations/024_currency_fix.sql'),
    path.join(__dirname, 'migrations/026_assign_default_cities.sql'),
];

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('âœ… Connected to database\n');

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
        console.log(`  â­ï¸  Skipping: ${filename} (already applied)`);
        continue;
      }

      if (!fs.existsSync(filepath)) {
        console.log(`  âš ï¸  File not found: ${filename}`);
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
        console.log(`  âœ… Applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  âŒ Failed: ${filename}`);
        console.error(`     Error: ${err.message}`);
        // Continue with next migration
      }
    }

    console.log('\nðŸŽ‰ Migration complete!');
  } catch (err) {
    console.error('âŒ Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
