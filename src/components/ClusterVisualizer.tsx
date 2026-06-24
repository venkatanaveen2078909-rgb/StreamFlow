import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrokerSim, RaftRole } from '../types';
import { Power, Cpu, Database, Server, RefreshCw, Key, ShieldCheck, Heart } from 'lucide-react';

interface ClusterProps {
  brokers: BrokerSim[];
  onTogglePower: (id: number) => void;
  onTriggerElection: () => void;
}

export default function ClusterVisualizer({ brokers, onTogglePower, onTriggerElection }: ClusterProps) {
  const leaderNode = brokers.find((b) => b.isAlive && b.role === 'Leader');

  return (
    <div className="bg-[#11141A] rounded-xl p-6 border border-[#222833] shadow-lg shadow-black/80" id="cluster-visualizer">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222833] pb-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-400" />
            Consensus &amp; Broker Cluster
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Visualizing the physical Raft Consensus state-machine. Toggle power to witness failover and partition re-assignments.
          </p>
        </div>
        <button
          onClick={onTriggerElection}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/50 text-indigo-200 rounded-lg transition-all active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
          Trigger Election Check
        </button>
      </div>

      {/* Heartbeat network simulation lines */}
      <div className="relative flex flex-col xl:flex-row items-center justify-around gap-12 py-6 mb-4">
        {/* SVG background grid lines to show heartbeats */}
        <div className="absolute inset-0 pointer-events-none hidden xl:block z-0">
          <svg className="w-full h-full" style={{ minHeight: '120px' }}>
            {brokers.map((broker) => {
              if (!leaderNode || leaderNode.id === broker.id || !broker.isAlive) return null;
              // Heartbeat wires from leader node
              const startX = leaderNode.id === 1 ? '16%' : leaderNode.id === 2 ? '50%' : '83%';
              const endX = broker.id === 1 ? '16%' : broker.id === 2 ? '50%' : '83%';
              return (
                <g key={`hb-wire-${broker.id}`}>
                  <line
                    x1={startX}
                    y1="50%"
                    x2={endX}
                    y2="50%"
                    stroke="#4f46e5"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="animate-pulse"
                    opacity="0.30"
                  />
                  <circle r="4" fill="#6366f1" className="animate-[ping_2s_infinite]">
                    <animateMotion
                      path={`M ${startX} 50 L ${endX} 50`}
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>

        {brokers.map((broker) => {
          const isLeader = broker.isAlive && broker.role === 'Leader';
          const isFollower = broker.isAlive && broker.role === 'Follower';
          const isCandidate = broker.isAlive && broker.role === 'Candidate';

          // Visual role card border styling
          let borderStyle = 'border-[#222833]';
          let roleBadgeStyle = 'bg-gray-900 text-gray-400 border-gray-700';
          if (!broker.isAlive) {
            borderStyle = 'border-red-900/30 opacity-70 bg-red-950/5';
            roleBadgeStyle = 'bg-red-950/50 text-red-400 border-red-800/30';
          } else if (isLeader) {
            borderStyle = 'border-emerald-500/50 shadow-lg shadow-emerald-950/20';
            roleBadgeStyle = 'bg-emerald-950 text-emerald-400 border-emerald-500/70 animate-pulse';
          } else if (isCandidate) {
            borderStyle = 'border-amber-500/50';
            roleBadgeStyle = 'bg-amber-950 text-amber-400 border-amber-500/70';
          } else if (isFollower) {
            borderStyle = 'border-indigo-500/30';
            roleBadgeStyle = 'bg-indigo-950/60 text-indigo-300 border-indigo-900/40';
          }

          return (
            <motion.div
              layoutKey={`broker-card-${broker.id}`}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              key={broker.id}
              className={`relative flex-1 w-full max-w-sm bg-[#161A22] rounded-xl p-5 border ${borderStyle} z-10 transition-colors`}
            >
              {/* Leader crown status icon */}
              {isLeader && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 shadow-md">
                  <ShieldCheck className="w-3 h-3" />
                  PARTITION COORDINATOR (RAFT LEADER)
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${broker.isAlive ? 'bg-[#1D2430] text-gray-300' : 'bg-red-950/20 text-red-500'}`}>
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold font-mono text-gray-100 flex items-center gap-2">
                      {broker.name}
                      <span className={`w-1.5 h-1.5 rounded-full ${broker.isAlive ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
                    </h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {broker.id} &bull; Endpoint: 909{broker.id + 1}</p>
                  </div>
                </div>

                <button
                  onClick={() => onTogglePower(broker.id)}
                  title={broker.isAlive ? "Crash Node (Simulate failure)" : "Power Up (Trigger state recovery)"}
                  className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
                    broker.isAlive
                      ? 'bg-red-950/20 border-red-900/30 hover:bg-red-900/30 text-red-400'
                      : 'bg-emerald-950/30 border-emerald-900/30 hover:bg-emerald-900/30 text-emerald-400'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Raft metrics display */}
              <div className="flex items-center justify-between border-y border-[#222833] py-2.5 my-3.5 bg-[#12151C] px-3 rounded-lg font-mono text-xs">
                <div>
                  <span className="text-gray-500 uppercase block text-[9px] mb-0.5">Raft Term</span>
                  <span className="font-bold text-gray-300">{broker.isAlive ? `Term ${broker.term}` : 'Offline'}</span>
                </div>
                <div>
                  <span className="text-gray-500 uppercase block text-[9px] mb-0.5">State Role</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${roleBadgeStyle}`}>
                    {broker.isAlive ? broker.role : 'CRASHED'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 uppercase block text-[9px] mb-0.5">Elect Votes</span>
                  <span className="font-bold text-gray-300">
                    {broker.isAlive ? `${broker.votes} / 3` : '0'}
                  </span>
                </div>
              </div>

              {/* Physical System Metrics */}
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-gray-500" /> CPU Load
                  </span>
                  <span className="text-gray-300">{broker.isAlive ? `${broker.cpuLoad}%` : '0%'}</span>
                </div>
                <div className="w-full h-1 bg-[#1A1F26] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${broker.cpuLoad > 85 ? 'bg-red-500' : 'bg-indigo-400'}`}
                    style={{ width: `${broker.isAlive ? broker.cpuLoad : 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-mono mt-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-gray-500" /> Disk Logs Space
                  </span>
                  <span className="text-gray-300">{broker.isAlive ? `${broker.diskUsedMB.toFixed(2)} MB` : 'Offline'}</span>
                </div>
                <div className="w-full h-1 bg-[#1A1F26] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${broker.isAlive ? Math.min(100, (broker.diskUsedMB / 250) * 100) : 0}%` }}
                  />
                </div>

                {broker.isAlive && broker.writeRateMB > 0 && (
                  <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400 animate-pulse mt-2 bg-emerald-950/20 p-1.5 rounded-md border border-emerald-900/30">
                    <span className="flex items-center gap-1 font-bold">
                      <Heart className="w-3 h-3 text-emerald-400 animate-bounce" fill="currentColor" /> Live Broker Sync IO
                    </span>
                    <span>+{broker.writeRateMB.toFixed(2)} MB/s</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
