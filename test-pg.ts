import { Pool } from 'pg';

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'postgres',
  port: 5432,
});

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Connected to PostgreSQL successfully:', res.rows[0]);
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err);
  } finally {
    await pool.end();
  }
}

testConnection();
