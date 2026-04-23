process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const knex = require('knex');

const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: false }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'khalto',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl:      false,
    };

const db = knex({
  client: 'pg',
  connection,
  pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
  acquireConnectionTimeout: 60000,
});

module.exports = db;
