process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
/**
 * Khalto — Database Migration Runner
 * شغّله مرة واحدة بعد أول deploy
 *
 * Usage:
 *   node src/db/migrate.js
 *   railway run node src/db/migrate.js
 */

require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
const fs         = require('fs');
const path       = require('path');

const migrations = [
  '../../schema.sql',                             // Base schema
  'migrations/002_fcm_tokens.sql',
  'migrations/003_auth_tables.sql',
  'migrations/004_ads_tables.sql',
  'migrations/005_notifications_commission.sql',
  'migrations/006_security_privacy.sql',
  'migrations/007_chat.sql',
  'migrations/008_loyalty_referral.sql',
  'migrations/009_pricing_analytics_food_safety.sql',
];

async function migrate() {
const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.set('sslmode', 'no-verify');

const client = new Client({
  connectionString: dbUrl.toString(),
  ssl: { rejectUnauthorized: false }
      
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(200) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      const filename = path.basename(migration);

      // Check if already applied
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [filename]
      );

      if (rows.length > 0) {
        console.log(`  ⏭️  Skipping: ${filename} (already applied)`);
        continue;
      }

      // Read and run migration
      const filepath = path.join(__dirname, migration);
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
        // Continue with next migration instead of stopping
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


