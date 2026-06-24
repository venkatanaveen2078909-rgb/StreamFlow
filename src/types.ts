export type CompressionType = 'none' | 'snappy' | 'gzip' | 'zstd';
export type AckLevel = '0' | '1' | 'all';
export type RaftRole = 'Leader' | 'Follower' | 'Candidate';

export interface BrokerSim {
  id: number;
  name: string;
  isAlive: boolean;
  role: RaftRole;
  term: number;
  votes: number;
  electionTimeout: number; // ms remaining
  heartbeatPulsing: boolean;
  activePartitions: number;
  diskUsedMB: number;
  writeRateMB: number;
  cpuLoad: number;
}

export interface PartitionSim {
  id: number;
  leaderId: number;
  replicas: number[];
  isr: number[];
  startOffset: number;
  endOffset: number;
  highWatermark: number;
}

export interface TopicSim {
  name: string;
  partitions: PartitionSim[];
  replicationFactor: number;
  retention: string;
  isCustom?: boolean;
}

export interface MessageSim {
  offset: number;
  timestamp: string;
  key: string;
  payload: string;
  payloadSize: number;
  checksum: string;
  isCorrupt?: boolean;
  compression: CompressionType;
}

export interface LogSegmentSim {
  name: string;
  baseOffset: number;
  messages: MessageSim[];
  isCompacted?: boolean;
}

export interface ConsumerSim {
  id: string;
  assignedPartitions: number[];
}

export interface ConsumerGroupSim {
  id: string;
  subscribedTopic: string;
  assignorStrategy: 'Range' | 'Round Robin';
  consumers: ConsumerSim[];
  committedOffsets: Record<number, number>; // partitionId -> offset
}

export interface MetricsSnapshot {
  throughputIn: number; // MB/s
  throughputOut: number; // MB/s
  qps: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeConnections: number;
}
