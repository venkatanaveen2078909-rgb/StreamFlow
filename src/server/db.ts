import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

// If PGUSER, PGPASSWORD, PGHOST, PGDATABASE, PGPORT are set in env, Pool will use them automatically.
// Make sure you have created the database specified in your environment variables.
export const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'streamflow',
  password: process.env.PGPASSWORD || 'postgres',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

const defaultPool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  port: parseInt(process.env.PGPORT || '5432', 10),
});

export async function initDb() {
  // 1. Ensure the streamflow database exists
  const targetDbName = process.env.PGDATABASE || 'streamflow';
  const defaultClient = await defaultPool.connect();
  try {
    const res = await defaultClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDbName]);
    if (res.rowCount === 0) {
      await defaultClient.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(`Created database ${targetDbName}`);
    }
  } catch (e) {
    console.error('Failed checking/creating database', e);
  } finally {
    defaultClient.release();
    await defaultPool.end();
  }

  // 2. Connect to the target database and initialize schema
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Brokers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS brokers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        is_alive BOOLEAN DEFAULT true,
        role VARCHAR(50) DEFAULT 'Follower',
        term INTEGER DEFAULT 0,
        votes INTEGER DEFAULT 0,
        election_timeout INTEGER DEFAULT 150,
        heartbeat_pulsing BOOLEAN DEFAULT false,
        active_partitions INTEGER DEFAULT 0,
        disk_used_mb REAL DEFAULT 0.0,
        write_rate_mb REAL DEFAULT 0.0,
        cpu_load INTEGER DEFAULT 0
      );
    `);

    // Topics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        replication_factor INTEGER NOT NULL,
        retention VARCHAR(255) NOT NULL,
        is_custom BOOLEAN DEFAULT false
      );
    `);

    // Partitions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS partitions (
        id SERIAL PRIMARY KEY,
        topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
        partition_idx INTEGER NOT NULL,
        leader_id INTEGER REFERENCES brokers(id) ON DELETE SET NULL,
        replicas INTEGER[] NOT NULL,
        isr INTEGER[] NOT NULL,
        start_offset INTEGER DEFAULT 0,
        end_offset INTEGER DEFAULT 0,
        high_watermark INTEGER DEFAULT 0,
        UNIQUE (topic_id, partition_idx)
      );
    `);

    // Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        topic_name VARCHAR(255) NOT NULL,
        partition_idx INTEGER NOT NULL,
        msg_offset INTEGER NOT NULL,
        timestamp VARCHAR(255) NOT NULL,
        msg_key VARCHAR(255) NOT NULL,
        payload TEXT NOT NULL,
        payload_size INTEGER NOT NULL,
        checksum VARCHAR(255) NOT NULL,
        is_corrupt BOOLEAN DEFAULT false,
        compression VARCHAR(50) NOT NULL,
        UNIQUE (topic_name, partition_idx, msg_offset)
      );
    `);

    // Consumer Groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS consumer_groups (
        id VARCHAR(255) PRIMARY KEY,
        subscribed_topic VARCHAR(255) NOT NULL,
        assignor_strategy VARCHAR(50) NOT NULL
      );
    `);

    // Initialize default brokers if none exist
    const { rowCount } = await client.query('SELECT 1 FROM brokers LIMIT 1');
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO brokers (id, name, is_alive, role, term, votes, election_timeout, active_partitions, disk_used_mb, cpu_load) VALUES
        (1, 'streamflow-broker-1', true, 'Leader', 2, 2, 200, 4, 4.85, 28),
        (2, 'streamflow-broker-2', true, 'Follower', 2, 0, 250, 4, 4.85, 14),
        (3, 'streamflow-broker-3', true, 'Follower', 2, 0, 180, 4, 4.85, 11);
      `);
    }

    // Initialize default topics if none exist
    const topicRes = await client.query('SELECT 1 FROM topics LIMIT 1');
    if (topicRes.rowCount === 0) {
      // Create 'orders' topic
      const res1 = await client.query(`
        INSERT INTO topics (name, replication_factor, retention) 
        VALUES ('orders', 3, '168 hours (7 days)') RETURNING id;
      `);
      const tId1 = res1.rows[0].id;
      
      await client.query(`
        INSERT INTO partitions (topic_id, partition_idx, leader_id, replicas, isr, start_offset, end_offset, high_watermark) VALUES
        ($1, 0, 1, ARRAY[1, 2, 3], ARRAY[1, 2, 3], 0, 3, 2),
        ($1, 1, 1, ARRAY[1, 2, 3], ARRAY[1, 2, 3], 0, 1, 1),
        ($1, 2, 1, ARRAY[1, 2, 3], ARRAY[1, 2, 3], 0, 0, 0);
      `, [tId1]);

      // Create 'transactions' topic
      const res2 = await client.query(`
        INSERT INTO topics (name, replication_factor, retention) 
        VALUES ('transactions', 3, '72 hours (3 days)') RETURNING id;
      `);
      const tId2 = res2.rows[0].id;
      await client.query(`
        INSERT INTO partitions (topic_id, partition_idx, leader_id, replicas, isr, start_offset, end_offset, high_watermark) VALUES
        ($1, 0, 1, ARRAY[1, 2, 3], ARRAY[1, 2, 3], 0, 2, 2),
        ($1, 1, 1, ARRAY[1, 2, 3], ARRAY[1, 2, 3], 0, 1, 1);
      `, [tId2]);

      // Create 'clickstream_logs' topic
      const res3 = await client.query(`
        INSERT INTO topics (name, replication_factor, retention) 
        VALUES ('clickstream_logs', 1, '24 hours (1 day)') RETURNING id;
      `);
      const tId3 = res3.rows[0].id;
      await client.query(`
        INSERT INTO partitions (topic_id, partition_idx, leader_id, replicas, isr, start_offset, end_offset, high_watermark) VALUES
        ($1, 0, 2, ARRAY[2], ARRAY[2], 0, 1, 1);
      `, [tId3]);

      // Initial messages for 'orders'
      await client.query(`
        INSERT INTO messages (topic_name, partition_idx, msg_offset, timestamp, msg_key, payload, payload_size, checksum, compression) VALUES
        ('orders', 0, 0, '14:55:02.102', 'user_id_4821', '{\n  "event": "OrderCreated",\n  "purchase_value": 49.99,\n  "currency": "USD"\n}', 64, '9A2D1F', 'none'),
        ('orders', 0, 1, '14:55:12.441', 'user_id_3211', '{\n  "event": "OrderCreated",\n  "purchase_value": 119.50,\n  "currency": "USD"\n}', 65, '8F4A12', 'none'),
        ('orders', 0, 2, '14:56:01.890', 'user_id_4821', '{\n  "event": "OrderDeleted",\n  "purchase_value": 49.99,\n  "currency": "USD"\n}', 64, 'AB1D7F', 'none');
      `);
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database', e);
    throw e;
  } finally {
    client.release();
  }
}
