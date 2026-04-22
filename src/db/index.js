const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL ? {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  } : {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'khalto',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl:      false,
  },
  pool: {
    min:            parseInt(process.env.DB_POOL_MIN || '2'),
    max:            parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: 30000,
  },
  acquireConnectionTimeout: 10000,
});

db.raw('SELECT 1')
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

module.exports = db;

