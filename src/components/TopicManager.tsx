import React, { useState } from 'react';
import { TopicSim, PartitionSim, MessageSim } from '../types';
import { FolderPlus, Trash2, Key, Info, Activity, Database, CheckCircle, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';

interface TopicManagerProps {
  topics: TopicSim[];
  selectedTopicName: string;
  onSelectTopic: (name: string) => void;
  onCreateTopic: (name: string, partitionsCount: number, replicationFactor: number) => void;
  onDeleteTopic: (name: string) => void;
  logs: MessageSim[];
  onTriggerCompaction: (topicName: string) => void;
  isCompactedGlobal: boolean;
}

export default function TopicManager({
  topics,
  selectedTopicName,
  onSelectTopic,
  onCreateTopic,
  onDeleteTopic,
  logs,
  onTriggerCompaction,
  isCompactedGlobal,
}: TopicManagerProps) {
  // New topic state
  const [newTopicName, setNewTopicName] = useState('');
  const [partitionsCount, setPartitionsCount] = useState(3);
  const [repFactor, setRepFactor] = useState(3);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Selected partition offset states
  const [selectedPartitionId, setSelectedPartitionId] = useState<number>(0);
  const [viewingIndexMode, setViewingIndexMode] = useState(false);
  const [searchKeyFilter, setSearchKeyFilter] = useState('');

  const currentTopic = topics.find((t) => t.name === selectedTopicName) || topics[0];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    onCreateTopic(newTopicName.trim().toLowerCase(), partitionsCount, repFactor);
    setNewTopicName('');
    setShowCreateModal(false);
  };

  const filteredLogs = logs.filter((log) => {
    if (searchKeyFilter === '') return true;
    return log.key.toLowerCase().includes(searchKeyFilter.toLowerCase());
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="topic-manager-composite">
      {/* Topics List and Create Sidepane */}
      <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="flex items-center justify-between border-b border-[#222833] pb-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
            <Database className="w-4 h-4 text-indigo-400" /> Topic Registries
          </h2>
          <button
            onClick={() => setShowCreateModal(!showCreateModal)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-all active:scale-95"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Provision Topic
          </button>
        </div>

        {/* Create Topic Form Inline Modal */}
        {showCreateModal && (
          <form onSubmit={handleCreateSubmit} className="bg-[#161A22] border border-[#2B3240] rounded-lg p-3.5 mb-4 space-y-3 font-mono text-[11px]">
            <div>
              <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Topic System Identifier</label>
              <input
                type="text"
                placeholder="e.g. user_actions"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                className="w-full bg-[#0D1015] border border-[#222833] rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-indigo-500"
                maxLength={20}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Partitions</label>
                <select
                  value={partitionsCount}
                  onChange={(e) => setPartitionsCount(Number(e.target.value))}
                  className="w-full bg-[#0D1015] border border-[#222833] rounded px-1.5 py-1 text-gray-200 focus:outline-[#555]"
                >
                  {[1, 2, 3, 4, 6].map((v) => (
                    <option key={v} value={v}>{v} segments</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Replicas</label>
                <select
                  value={repFactor}
                  onChange={(e) => setRepFactor(Number(e.target.value))}
                  className="w-full bg-[#0D1015] border border-[#222833] rounded px-1.5 py-1 text-gray-200 focus:outline-[#555]"
                >
                  {[1, 3].map((v) => (
                    <option key={v} value={v}>factor {v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-2 py-1 text-gray-400 hover:text-gray-200 border border-transparent hover:border-[#222833] rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold"
              >
                Create Topic
              </button>
            </div>
          </form>
        )}

        {/* Existing Topics List */}
        <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
          {topics.map((t) => {
            const isSelected = t.name === selectedTopicName;
            return (
              <div
                key={t.name}
                onClick={() => {
                  onSelectTopic(t.name);
                  setSelectedPartitionId(0);
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer group transition-all ${
                  isSelected
                    ? 'bg-indigo-950/30 border-indigo-500/50 text-indigo-200'
                    : 'bg-[#151821] border-[#222833] text-gray-400 hover:bg-[#1C202B] hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-400 animate-pulse' : 'bg-gray-600'}`} />
                  <span className="font-mono text-xs font-semibold">{t.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-semibold bg-[#0D0F14] text-gray-500 px-1.5 py-0.5 rounded border border-[#222833]">
                    P: {t.partitions.length}
                  </span>
                  {t.isCustom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTopic(t.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-300 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* System Settings metadata block */}
        <div className="mt-4 pt-3.5 border-t border-[#222833]">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase font-mono tracking-wider mb-2">Topic retention policy</h3>
          <div className="bg-[#0D1015] rounded border border-[#222833] p-2.5 font-mono text-[10px] space-y-1.5 text-gray-400">
            <div className="flex justify-between">
              <span>Segment Size:</span>
              <span className="text-gray-200">50.00 MB rolling</span>
            </div>
            <div className="flex justify-between">
              <span>Cleanup Policy:</span>
              <span className="text-indigo-400 font-semibold">{selectedTopicName === 'orders' ? 'Log Compaction' : 'Delete'}</span>
            </div>
            <div className="flex justify-between">
              <span>Index Format:</span>
              <span className="text-gray-200">alignas(8) Offset Index</span>
            </div>
          </div>
        </div>
      </div>

      {/* Topics Partition Map and Segment Logs */}
      <div className="lg:col-span-2 bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#222833] pb-4 mb-4 gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 font-sans flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Partition Topology &amp; Physical Segment Logs
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Topic: {selectedTopicName}</p>
          </div>

          {selectedTopicName === 'orders' && (
            <button
              onClick={() => onTriggerCompaction(selectedTopicName)}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-200 rounded-lg text-[11px] font-mono transition-all active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              Trigger Log Compaction
            </button>
          )}
        </div>

        {/* Partition Topology table */}
        <div className="overflow-x-auto border border-[#222833] rounded-lg mb-4 h-36 bg-[#0D1015]">
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead>
              <tr className="bg-[#151921] border-b border-[#222833] text-gray-400">
                <th className="px-3 py-2 border-r border-[#222833]/30">Partition ID</th>
                <th className="px-3 py-2 border-r border-[#222833]/30">Raft Leader</th>
                <th className="px-3 py-2 border-r border-[#222833]/30">Config Replicas</th>
                <th className="px-3 py-2 border-r border-[#222833]/30 text-emerald-400">ISR Nodes</th>
                <th className="px-3 py-2">Watermark / End Off</th>
              </tr>
            </thead>
            <tbody>
              {currentTopic.partitions.map((part) => {
                const isActive = part.id === selectedPartitionId;
                return (
                  <tr
                    key={part.id}
                    onClick={() => setSelectedPartitionId(part.id)}
                    className={`border-b border-[#222833]/30 cursor-pointer transition-colors ${
                      isActive ? 'bg-indigo-950/20 hover:bg-indigo-950/30' : 'hover:bg-[#161B24]'
                    }`}
                  >
                    <td className="px-3 py-2 border-r border-[#222833]/30 font-bold flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-indigo-400' : 'bg-transparent'}`} />
                      {currentTopic.name}-{part.id}
                    </td>
                    <td className="px-3 py-2 border-r border-[#222833]/30 font-semibold text-gray-300">
                      Broker {part.leaderId}
                    </td>
                    <td className="px-3 py-2 border-r border-[#222833]/30 text-gray-400">
                      [{part.replicas.join(', ')}]
                    </td>
                    <td className="px-3 py-2 border-r border-[#222833]/30 font-bold text-emerald-400">
                      [{part.isr.join(', ')}]
                    </td>
                    <td className="px-3 py-2 text-gray-300 font-semibold">
                      {part.highWatermark} committed &bull; {part.endOffset} limits
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Physical Log Segment representation */}
        <div className="flex-1 bg-[#151922] rounded-lg p-3.5 border border-[#222833] flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#2c3240] mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-indigo-950 font-bold text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/50">
                SEGMENT: segment_00000000000000000000.{viewingIndexMode ? 'index' : 'log'}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {viewingIndexMode ? 'Memory-Mapped Seeking Metadata' : 'Binary Log Records'}
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px]">
              {/* Toggle Log and Index View */}
              <button
                onClick={() => setViewingIndexMode(!viewingIndexMode)}
                className={`px-2 py-0.5 rounded border transition-all ${
                  viewingIndexMode
                    ? 'bg-[#1C202B] border-indigo-600 text-indigo-300 font-bold'
                    : 'bg-[#10141C] border-[#222833] text-gray-500 hover:text-gray-300'
                }`}
              >
                Toggle {viewingIndexMode ? 'Log Records' : 'Offset Indexes'}
              </button>

              <input
                type="text"
                placeholder="Filter by key..."
                value={searchKeyFilter}
                onChange={(e) => setSearchKeyFilter(e.target.value)}
                className="bg-[#0C0F14] border border-[#222833] rounded px-1.5 py-0.5 text-gray-300 focus:outline-none"
              />
            </div>
          </div>

          {/* Scrolling Records Box */}
          <div className="flex-1 overflow-y-auto h-72 pr-1 select-none font-mono text-[11px]">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Info className="w-8 h-8 text-indigo-600/50 mb-2" />
                <p className="text-gray-400">Empty active segment binary space</p>
                <p className="text-[10px] text-gray-500 mt-1">Publish records over the side terminal to populate</p>
              </div>
            ) : viewingIndexMode ? (
              /* Offset Mapped Index Representation */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredLogs.map((log) => {
                  const relativeOffset = log.offset;
                  const physicalOffsetBytes = log.offset * 128 + 64; // mock binary alignment bounds bytes
                  return (
                    <div key={`idx-${log.offset}`} className="bg-[#0B0D11] border border-[#222833] rounded p-2.5 flex items-center justify-between font-mono hover:border-indigo-500/50 transition-colors">
                      <div>
                        <span className="text-gray-500 text-[10px] block font-bold uppercase">Logical Offset Index</span>
                        <span className="text-indigo-400 font-extrabold">{relativeOffset}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-500 text-[10px] block font-bold uppercase">MAPPED FILE POSITION</span>
                        <span className="text-gray-300 font-semibold font-mono">0x{physicalOffsetBytes.toString(16).toUpperCase()} bytes</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Actual Log File Entries */
              <div className="space-y-2">
                {filteredLogs.map((log) => {
                  const isHighWatermark = log.offset <= currentTopic.partitions[selectedPartitionId]?.highWatermark;
                  return (
                    <div
                      key={`log-${log.offset}`}
                      className="bg-[#0B0D11] border border-[#222833] rounded p-3 hover:border-indigo-500/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#222833]/50 pb-1.5 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-[#121620] border border-[#2d3345] text-indigo-200 px-1.5 py-0.5 rounded font-black font-mono">
                            OFFSET: {log.offset}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-900 font-mono">
                            KEY: "{log.key}"
                          </span>
                          {log.compression !== 'none' && (
                            <span className="text-[9px] bg-indigo-950 border border-indigo-900 text-indigo-400 font-mono px-1 py-0.2 rounded font-semibold uppercase">
                              COMPRESSION: {log.compression}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-[10px]">{log.timestamp}</span>
                          {isHighWatermark ? (
                            <span className="flex items-center gap-0.5 px-1 bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 rounded text-[9px] font-black uppercase">
                              <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                              COMMITTED (ISR)
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 px-1 bg-amber-950/40 border border-amber-900/60 text-amber-500 rounded text-[9px] font-black uppercase">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                              UNSYNCHRONIZED
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <span className="text-[9px] block text-gray-500 font-bold uppercase mb-0.5">Payload Data</span>
                          <pre className="bg-[#121620] border border-[#232836] rounded p-2 text-[10px] text-gray-300 overflow-x-auto whitespace-pre font-mono">
                            {log.payload}
                          </pre>
                        </div>
                        <div>
                          <div className="space-y-1.5 bg-[#12151D] border border-[#232836]/30 rounded p-2 text-[10px] h-full flex flex-col justify-center">
                            <div className="flex justify-between items-center text-gray-400">
                              <span>CRC32 Checksum:</span>
                              <span className="text-gray-300 text-[9px] bg-black/40 px-1 py-0.5 rounded font-mono border border-[#222833]">0x{log.checksum}</span>
                            </div>
                            <div className="flex justify-between items-center text-gray-400">
                              <span>Physical Size:</span>
                              <span className="text-gray-300 font-semibold">{log.payloadSize} bytes</span>
                            </div>
                            <div className="flex justify-between items-center text-gray-400">
                              <span>Hashing Integrity:</span>
                              <span className="flex items-center gap-0.5 text-emerald-400 font-extrabold text-[9px] uppercase">
                                <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                                VALIDATED
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Performance warning details footer */}
          <div className="mt-3.5 border-t border-[#2c3240] pt-2.5 flex justify-between items-center font-mono text-[10px] text-gray-500">
            <span>Log Engine status: <span className="text-emerald-400">ACTIVE &bull; STABLE</span></span>
            <span>Compaction reduced size: <span className="text-indigo-400 font-semibold">{isCompactedGlobal ? '32% Compression Efficiency achieved' : '0%'}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
