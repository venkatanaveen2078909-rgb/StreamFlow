import express from 'express';
import cors from 'cors';
import { pool, initDb } from './db';

const app = express();
app.use(cors());
app.use(express.json());

// Endpoints for Brokers
app.get('/api/brokers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM brokers ORDER BY id ASC');
    // Map to camelCase for frontend
    const brokers = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      isAlive: row.is_alive,
      role: row.role,
      term: row.term,
      votes: row.votes,
      electionTimeout: row.election_timeout,
      heartbeatPulsing: row.heartbeat_pulsing,
      activePartitions: row.active_partitions,
      diskUsedMB: row.disk_used_mb,
      writeRateMB: row.write_rate_mb,
      cpuLoad: row.cpu_load,
    }));
    res.json(brokers);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch brokers' });
  }
});

app.post('/api/brokers/:id/toggle', async (req, res) => {
  try {
    const brokerId = parseInt(req.params.id, 10);
    // Simple toggle logic (does not implement full Raft here, but simulates the basic toggle)
    const result = await pool.query('SELECT is_alive, role FROM brokers WHERE id = $1', [brokerId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Broker not found' });
    
    const isAlive = result.rows[0].is_alive;
    const newAlive = !isAlive;
    const newRole = newAlive ? 'Follower' : result.rows[0].role;
    
    await pool.query('UPDATE brokers SET is_alive = $1, role = $2 WHERE id = $3', [newAlive, newRole, brokerId]);
    res.json({ success: true, newAlive });
  } catch (e) {
    res.status(500).json({ error: 'Failed to toggle broker' });
  }
});

// Endpoints for Topics and Partitions
app.get('/api/topics', async (req, res) => {
  try {
    const topicsRes = await pool.query('SELECT * FROM topics ORDER BY id ASC');
    const partitionsRes = await pool.query('SELECT * FROM partitions ORDER BY topic_id, partition_idx ASC');
    
    const topics = topicsRes.rows.map(tRow => {
      const parts = partitionsRes.rows.filter(p => p.topic_id === tRow.id).map(p => ({
        id: p.partition_idx,
        leaderId: p.leader_id,
        replicas: p.replicas,
        isr: p.isr,
        startOffset: p.start_offset,
        endOffset: p.end_offset,
        highWatermark: p.high_watermark
      }));
      
      return {
        name: tRow.name,
        replicationFactor: tRow.replication_factor,
        retention: tRow.retention,
        isCustom: tRow.is_custom,
        partitions: parts
      };
    });
    
    res.json(topics);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

app.post('/api/topics', async (req, res) => {
  try {
    const { name, partitionsCount, replicationFactor } = req.body;
    
    await pool.query('BEGIN');
    const topicRes = await pool.query(
      'INSERT INTO topics (name, replication_factor, retention, is_custom) VALUES ($1, $2, $3, true) RETURNING id',
      [name, replicationFactor, '168 hours (7 days)']
    );
    const topicId = topicRes.rows[0].id;
    
    // Pick a leader (simple logic: first alive leader or just 1)
    const leaderRes = await pool.query("SELECT id FROM brokers WHERE is_alive = true AND role = 'Leader' LIMIT 1");
    const leaderId = leaderRes.rowCount > 0 ? leaderRes.rows[0].id : 1;
    
    const replicas = replicationFactor === 3 ? [1, 2, 3] : [leaderId];
    
    for (let i = 0; i < partitionsCount; i++) {
      await pool.query(
        'INSERT INTO partitions (topic_id, partition_idx, leader_id, replicas, isr, start_offset, end_offset, high_watermark) VALUES ($1, $2, $3, $4, $5, 0, 0, 0)',
        [topicId, i, leaderId, replicas, replicas]
      );
    }
    
    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

// Endpoints for Messages
app.get('/api/messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM messages ORDER BY id ASC');
    const messages = result.rows.map(row => ({
      offset: row.msg_offset,
      timestamp: row.timestamp,
      key: row.msg_key,
      payload: row.payload,
      payloadSize: row.payload_size,
      checksum: row.checksum,
      compression: row.compression,
    }));
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { topicName, key, payload, compression } = req.body;
    const timeStr = new Date().toLocaleTimeString([], { hour12: false });
    const size = payload.length;
    const checksumHash = Math.abs(key.split('').reduce((a: number, b: string) => (a << 5) - a + b.charCodeAt(0), 0))
      .toString(16)
      .substring(0, 6)
      .toUpperCase();
      
    // Determine next offset
    const offsetRes = await pool.query(
      'SELECT COALESCE(MAX(msg_offset), -1) + 1 AS next_offset FROM messages WHERE topic_name = $1 AND partition_idx = 0',
      [topicName]
    );
    const nextOffset = offsetRes.rows[0].next_offset;
    
    await pool.query('BEGIN');
    
    await pool.query(
      'INSERT INTO messages (topic_name, partition_idx, msg_offset, timestamp, msg_key, payload, payload_size, checksum, compression) VALUES ($1, 0, $2, $3, $4, $5, $6, $7, $8)',
      [topicName, nextOffset, timeStr, key, payload, size, checksumHash, compression]
    );
    
    // Update partition end_offset
    await pool.query(
      'UPDATE partitions p SET end_offset = end_offset + 1, high_watermark = high_watermark + 1 FROM topics t WHERE p.topic_id = t.id AND t.name = $1 AND p.partition_idx = 0',
      [topicName]
    );
    
    await pool.query('COMMIT');
    res.json({ success: true, offset: nextOffset });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to publish message' });
  }
});

const PORT = process.env.PORT || 3001;

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database on startup', err);
});
