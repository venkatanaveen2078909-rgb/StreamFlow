import React, { useState, useEffect, useRef } from 'react';
import { BrokerSim, TopicSim, MessageSim, AckLevel, CompressionType, MetricsSnapshot } from './types';
import ClusterVisualizer from './components/ClusterVisualizer';
import TopicManager from './components/TopicManager';
import ProducerConsumerPlayground from './components/ProducerConsumerPlayground';
import MetricsDashboard from './components/MetricsDashboard';
import CliConsole from './components/CliConsole';
import CodeExplorer from './components/CodeExplorer';
import { Server, Database, Terminal, Activity, Code, Layers, Zap, Info, ShieldCheck, Heart } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'cluster' | 'topics' | 'stream' | 'metrics' | 'cli' | 'code'>('cluster');
  const [brokers, setBrokers] = useState<BrokerSim[]>([]);
  const [topics, setTopics] = useState<TopicSim[]>([]);
  const [messages, setMessages] = useState<MessageSim[]>([]);
  const [selectedTopicName, setSelectedTopicName] = useState('orders');

  // Interactive Consumer Logs state
  const [consumerLogs, setConsumerLogs] = useState<string[]>([
    '[*SYS] Initializing StreamFlow distributed coordination engine.',
    '[*SYS] Re-balancing Consumer Group analytics_data_processors range asignments.',
    '[REBALANCE] Consumer instance Client-1 connected & allocated partition orders-0, orders-1.',
    '[REBALANCE] Consumer instance Client-2 connected & allocated partition orders-2.'
  ]);
  const [isSubscribedPoll, setIsSubscribedPoll] = useState(false);
  const [consumerCount, setConsumerCount] = useState(2);
  const [assignorStrategy, setAssignorStrategy] = useState<'Range' | 'Round Robin'>('Range');

  // Metrics states
  const [metrics, setMetrics] = useState<MetricsSnapshot>({
    throughputIn: 1.48,
    throughputOut: 0.95,
    qps: 124,
    p50LatencyMs: 2.1,
    p95LatencyMs: 4.8,
    p99LatencyMs: 11.4,
    activeConnections: 64,
  });

  const [metricsHistory, setMetricsHistory] = useState([
    { time: '14:50', inRate: 1.2, outRate: 0.8, latency: 4.2 },
    { time: '14:51', inRate: 1.5, outRate: 0.9, latency: 4.8 },
    { time: '14:52', inRate: 1.4, outRate: 1.0, latency: 4.1 },
    { time: '14:53', inRate: 1.7, outRate: 1.2, latency: 5.1 },
    { time: '14:54', inRate: 1.3, outRate: 0.9, latency: 4.5 },
    { time: '14:55', inRate: 1.48, outRate: 0.95, latency: 4.8 },
  ]);

  const [totalConsumed, setTotalConsumed] = useState(3);
  const [isCompactedGlobal, setIsCompactedGlobal] = useState(false);

  // Background ticks for active polling from real backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [brokersRes, topicsRes, msgsRes] = await Promise.all([
          fetch('/api/brokers'),
          fetch('/api/topics'),
          fetch('/api/messages')
        ]);
        if (brokersRes.ok) setBrokers(await brokersRes.json());
        if (topicsRes.ok) setTopics(await topicsRes.json());
        if (msgsRes.ok) setMessages(await msgsRes.json());
      } catch (err) {
        console.error('Failed to fetch state from backend', err);
      }
    };

    fetchData(); // Initial fetch
    const timer = setInterval(() => {
      fetchData();
      
      // Keep pulsing logic
      setBrokers(prev => prev.map(b => (b.isAlive ? { ...b, heartbeatPulsing: !b.heartbeatPulsing } : b)));

      // Consumer Polling logs simulation tick
      if (isSubscribedPoll) {
        setTotalConsumed((prev) => {
          const nextVal = prev + 1;
          const liveLeader = brokers.find((b) => b.isAlive && b.role === 'Leader');

          if (liveLeader) {
            setConsumerLogs((logs) => [
              `[PULL_RECORD] [analytics_data_processors] Partition ${selectedTopicName}-0 offset ${nextVal} consumed. Key Verification Checksum matches.`,
              ...logs.slice(0, 30),
            ]);
          }
          return nextVal;
        });
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [isSubscribedPoll, selectedTopicName, brokers.length]);

  // Raft failover crash trigger backend call
  const handleTogglePower = async (brokerId: number) => {
    try {
      await fetch(`/api/brokers/${brokerId}/toggle`, { method: 'POST' });
      // The background interval will sync the new state. We could also optimism update.
    } catch (e) {
      console.error('Failed to toggle power', e);
    }
  };

  const handleManualElection = () => {
    const aliveBrokers = brokers.filter((b) => b.isAlive);
    if (aliveBrokers.length === 0) return;

    const currentLeader = brokers.find((b) => b.isAlive && b.role === 'Leader');
    const newTerm = Math.max(...brokers.map((b) => b.term)) + 1;
    const nextLeader = aliveBrokers[Math.floor(Math.random() * aliveBrokers.length)];

    setBrokers((prev) =>
      prev.map((b) => {
        if (b.id === nextLeader.id) {
          return { ...b, role: 'Leader', term: newTerm, votes: 2 };
        }
        return { ...b, role: 'Follower', term: newTerm, votes: 0 };
      })
    );

    setConsumerLogs((logs) => [
      `[*CON] Explicit user consensus request triggered. Promoted Term ${newTerm}. Node-${nextLeader.id} is now LEADER.`,
      ...logs,
    ]);
  };

  // Publisher integration callback to backend
  const handlePublishMessage = async (
    topicName: string,
    key: string,
    payload: string,
    acks: AckLevel,
    compression: CompressionType
  ) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicName, key, payload, compression })
      });
      if (res.ok) {
        setConsumerLogs((logs) => [
          `[PRODUCE_SEND] Published to partition ${topicName}-0. Key: "${key}" (Acks: ${acks}, compression: ${compression})`,
          ...logs,
        ]);
        // Fast refresh locally
        const msgsRes = await fetch('/api/messages');
        if (msgsRes.ok) setMessages(await msgsRes.json());
      }
    } catch (e) {
      console.error('Failed to publish', e);
    }
  };

  // Custom Topic Creation handlers to backend
  const handleCreateTopic = async (name: string, partitionsCount: number, replicationFactor: number) => {
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, partitionsCount, replicationFactor })
      });
      if (res.ok) {
        setSelectedTopicName(name);
        setConsumerLogs((logs) => [
          `[*SYS] Created Topic partition schemas "${name}" with ${partitionsCount} logical log segments.`,
          ...logs,
        ]);
        const tRes = await fetch('/api/topics');
        if (tRes.ok) setTopics(await tRes.json());
      }
    } catch (e) {
      console.error('Failed to create topic', e);
    }
  };

  const handleDeleteTopic = (name: string) => {
    setTopics((prev) => prev.filter((t) => t.name !== name));
    if (selectedTopicName === name) {
      setSelectedTopicName('orders');
    }
    setConsumerLogs((logs) => [`[*SYS] Deleted custom topic registry "${name}" from broker allocations.`, ...logs]);
  };

  // In-App Log Compaction simulation
  const handleTriggerCompaction = (topicName: string) => {
    // Log compaction keeps only the absolute latest message matching the unique key
    setIsCompactedGlobal(true);
    setConsumerLogs((logs) => [
      `[*SYS] [LOG_COMPACTER] Triggering active thread consolidation on partition ${topicName}-0. Reading keys...`,
    ]);

    setTimeout(() => {
      setMessages((prev) => {
        // Collect latest offsets pointers by duplicate key
        const latestKeyMap: Record<string, MessageSim> = {};
        prev.forEach((msg) => {
          latestKeyMap[msg.key] = msg;
        });

        const compactedList = Object.values(latestKeyMap).sort((a, b) => a.offset - b.offset);

        setConsumerLogs((logs) => [
          `[*SYS] [LOG_COMPACTER] Segment consolidated successfully! Eliminated duplicates.`,
          `[*SYS] [LOG_COMPACTER] Size reduced from ${prev.length} records to ${compactedList.length} unique keys base lines. Checksum intact.`,
          ...logs,
        ]);

        return compactedList;
      });
    }, 1000);
  };

  // Adding/removing consumers rebalance simulations
  const handleAddConsumer = () => {
    if (consumerCount >= 6) return; // limit cluster sizes bounds
    const nextCount = consumerCount + 1;
    setConsumerCount(nextCount);
    triggerGroupRebalance(nextCount, assignorStrategy);
  };

  const handleRemoveConsumer = () => {
    if (consumerCount <= 1) return;
    const nextCount = consumerCount - 1;
    setConsumerCount(nextCount);
    triggerGroupRebalance(nextCount, assignorStrategy);
  };

  const handleToggleAssignor = () => {
    const nextAssignor = assignorStrategy === 'Range' ? 'Round Robin' : 'Range';
    setAssignorStrategy(nextAssignor);
    triggerGroupRebalance(consumerCount, nextAssignor);
  };

  const triggerGroupRebalance = (cCount: number, strategy: 'Range' | 'Round Robin') => {
    setConsumerLogs((logs) => [
      `[REBALANCE] Consumer member counts shifted to ${cCount}. Suspending polls...`,
      `[REBALANCE] Triggering partition re-allocations inside cluster via "${strategy} Assignor" algorithms.`,
      ...Array.from({ length: cCount }).map((_, idx) => {
        // Interlaced partition ids allocations text logs
        const allocatedPartitions = strategy === 'Range'
          ? `orders-[${idx * 2}, ${idx * 2 + 1}]`
          : `orders-[${idx % 3}]`;

        return `[REBALANCE] Member client-idx-${idx + 10} initialized and allocated to fetch logs: ${allocatedPartitions}.`;
      }),
      `[REBALANCE] Sync offsets completed. Resuming steady-state consumer loops.`,
      ...logs,
    ]);
  };

  return (
    <div className="bg-[#0B0D11] min-h-screen text-gray-200 font-sans flex flex-col selection:bg-indigo-600/30">
      {/* CLOUD CORE HEADER BRAND BANNER */}
      <header className="bg-[#12151B] border-b border-[#222833] py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 font-black text-white text-md rounded-lg shadow-md shadow-indigo-950/40 font-mono tracking-tighter hover:rotate-2 transition-transform select-none">
            SF
          </div>
          <div>
            <h1 className="text-md sm:text-lg font-extrabold text-gray-100 flex items-center gap-2 tracking-tight">
              StreamFlow Systems Cockpit
              <span className="text-[10px] bg-indigo-950 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-700/50">C++20 Distributed Pipeline</span>
            </h1>
            <p className="text-xs text-gray-400 font-medium">Production-Grade Event Streaming Control Plane &amp; Hardware Simulator</p>
          </div>
        </div>

        {/* Global Cluster Stats summary */}
        <div className="flex gap-4 sm:gap-6 font-mono text-[11px] bg-[#0E1116] border border-[#222833] rounded-lg px-4 py-2 text-gray-400 self-start md:self-auto">
          <div>
            <span className="text-gray-500 uppercase block text-[8px] mb-0.5">Brokers Health</span>
            <span className="font-extrabold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {brokers.filter((b) => b.isAlive).length} / 3 UP
            </span>
          </div>
          <div>
            <span className="text-gray-500 uppercase block text-[8px] mb-0.5">Active Topic Count</span>
            <span className="font-extrabold text-gray-200">{topics.length} topics</span>
          </div>
          <div>
            <span className="text-gray-500 uppercase block text-[8px] mb-0.5">EST. CLUSTER QPS</span>
            <span className="font-extrabold text-indigo-400 animate-pulse">{metrics.qps} msgs/s</span>
          </div>
        </div>
      </header>

      {/* HORIZONTAL DATADOG-STYLE NAVIGATION TABS */}
      <nav className="bg-[#101319] border-b border-[#1C202B]/80 px-6 py-2 flex items-center gap-1 overflow-x-auto scroller-hidden">
        <button
          onClick={() => setActiveTab('cluster')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'cluster'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Server className="w-3.5 h-3.5" /> 1. Cluster Consensus
        </button>
        <button
          onClick={() => setActiveTab('topics')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'topics'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Database className="w-3.5 h-3.5" /> 2. Log Segment Engine
        </button>
        <button
          onClick={() => setActiveTab('stream')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'stream'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" /> 3. Pub/Sub Sandbox
        </button>
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'metrics'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> 4. Perf Telemetrics
        </button>
        <button
          onClick={() => setActiveTab('cli')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'cli'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" /> 5. Terminal CLI
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 ${
            activeTab === 'code'
              ? 'bg-[#1F2531] text-indigo-300 border-b border-indigo-500 font-bold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#151921]'
          }`}
        >
          <Code className="w-3.5 h-3.5" /> 6. C++20 Codebase Explorer
        </button>
      </nav>

      {/* MASTER TABBED WORKSPACE CONTENT WRAPPER */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {activeTab === 'cluster' && (
          <ClusterVisualizer
            brokers={brokers}
            onTogglePower={handleTogglePower}
            onTriggerElection={handleManualElection}
          />
        )}

        {activeTab === 'topics' && (
          <TopicManager
            topics={topics}
            selectedTopicName={selectedTopicName}
            onSelectTopic={setSelectedTopicName}
            onCreateTopic={handleCreateTopic}
            onDeleteTopic={handleDeleteTopic}
            logs={messages}
            onTriggerCompaction={handleTriggerCompaction}
            isCompactedGlobal={isCompactedGlobal}
          />
        )}

        {activeTab === 'stream' && (
          <ProducerConsumerPlayground
            topics={topics}
            selectedTopicName={selectedTopicName}
            onPublishToBroker={handlePublishMessage}
            consumerLogs={consumerLogs}
            isSubscribedPoll={isSubscribedPoll}
            onTogglePolling={() => setIsSubscribedPoll(!isSubscribedPoll)}
            onAddConsumer={handleAddConsumer}
            onRemoveConsumer={handleRemoveConsumer}
            consumerCount={consumerCount}
            assignorStrategy={assignorStrategy}
            onToggleAssignor={handleToggleAssignor}
            totalMessagesInTopic={messages.length}
            totalMessagesConsumed={totalConsumed}
          />
        )}

        {activeTab === 'metrics' && (
          <MetricsDashboard
            metrics={metrics}
            history={metricsHistory}
          />
        )}

        {activeTab === 'cli' && (
          <CliConsole
            onAddTopicFromCli={(topicName) => handleCreateTopic(topicName, 3, 3)}
            onClearStatsFromCli={() => setMessages([])}
          />
        )}

        {activeTab === 'code' && (
          <CodeExplorer />
        )}
      </main>

      {/* FOOTER CLUSTER REPLICATION FEED */}
      <footer className="bg-[#0E1116] border-t border-[#222833] py-3.5 px-6 font-mono text-[10px] text-gray-500 flex flex-col md:flex-row md:items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 selection:bg-transparent">
          <Heart className="w-3 h-3 text-red-500 fill-current animate-beat" />
          <span>StreamFlow Node-Leader Heartbeat alive. Sync period 50ms &bull; CRC-32 enabled.</span>
        </div>
        <div>
          <span>Developer environment: Clang-15 x86_64 compiler / Ubuntu 22.04 LTS workspace</span>
        </div>
      </footer>
    </div>
  );
}
