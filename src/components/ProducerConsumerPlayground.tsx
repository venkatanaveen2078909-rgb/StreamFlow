import React, { useState, useEffect } from 'react';
import { TopicSim, CompressionType, AckLevel, MessageSim } from '../types';
import { Play, Clipboard, Check, Terminal, Share2, Plus, LogOut, Cpu, AlertCircle, RefreshCw } from 'lucide-react';

interface PlaygroundProps {
  topics: TopicSim[];
  selectedTopicName: string;
  onPublishToBroker: (
    topicName: string,
    key: string,
    payload: string,
    acks: AckLevel,
    compression: CompressionType
  ) => void;
  consumerLogs: string[];
  isSubscribedPoll: boolean;
  onTogglePolling: () => void;
  onAddConsumer: () => void;
  onRemoveConsumer: () => void;
  consumerCount: number;
  assignorStrategy: 'Range' | 'Round Robin';
  onToggleAssignor: () => void;
  totalMessagesInTopic: number;
  totalMessagesConsumed: number;
}

export default function ProducerConsumerPlayground({
  topics,
  selectedTopicName,
  onPublishToBroker,
  consumerLogs,
  isSubscribedPoll,
  onTogglePolling,
  onAddConsumer,
  onRemoveConsumer,
  consumerCount,
  assignorStrategy,
  onToggleAssignor,
  totalMessagesInTopic,
  totalMessagesConsumed,
}: PlaygroundProps) {
  // Producer Inputs
  const [keyInput, setKeyInput] = useState('user_id_4821');
  const [payloadInput, setPayloadInput] = useState('{\n  "event": "OrderCreated",\n  "purchase_value": 149.50,\n  "currency": "USD",\n  "payment_vendor": "Stripe"\n}');
  const [compressionSelection, setCompressionSelection] = useState<CompressionType>('none');
  const [ackSelection, setAckSelection] = useState<AckLevel>('1');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessToken, setSendSuccessToken] = useState(false);

  // Template loaders
  const loadBoilerplate = (type: string) => {
    if (type === 'order') {
      setPayloadInput('{\n  "event": "OrderCreated",\n  "purchase_value": 149.50,\n  "currency": "USD",\n  "payment_vendor": "Stripe"\n}');
      setKeyInput('user_id_4821');
    } else if (type === 'auth') {
      setPayloadInput('{\n  "event": "UserAuthentication",\n  "status": "GRANTED",\n  "ip_address": "104.28.1.18",\n  "device": "MacBookPro_M2"\n}');
      setKeyInput('auth_req_ff9');
    } else if (type === 'telemetry') {
      setPayloadInput('{\n  "device_id": "iot_sensor_62",\n  "temperature": 23.4,\n  "humidity": 58.2,\n  "integrity_check": "PASS"\n}');
      setKeyInput('device_id_iot62');
    }
  };

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setSendSuccessToken(false);

    // Simulate real-world network packet execution latency depends on ACK rules
    const latencyMs = ackSelection === '0' ? 100 : ackSelection === '1' ? 400 : 900;

    setTimeout(() => {
      onPublishToBroker(selectedTopicName, keyInput, payloadInput, ackSelection, compressionSelection);
      setIsSending(false);
      setSendSuccessToken(true);
      setTimeout(() => setSendSuccessToken(false), 2000);
    }, latencyMs);
  };

  // Compute live lag
  const overallLag = Math.max(0, totalMessagesInTopic - totalMessagesConsumed);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" id="playground-terminal-workspace">
      {/* MONOSPACE PRODUCER TERMINAL */}
      <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="flex items-center justify-between border-b border-[#222833] pb-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
              <Terminal className="w-4 h-4 text-indigo-400" /> Producer Terminal Console
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Topic Target: {selectedTopicName}</p>
          </div>

          {/* Quick payloads loader */}
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="text-gray-500 mr-1 uppercase">Load Boilerplate:</span>
            <button
              onClick={() => loadBoilerplate('order')}
              className="px-2 py-0.5 bg-[#171B26] border border-[#222833] hover:border-indigo-500/50 hover:bg-[#202636] text-gray-300 rounded transition-colors"
            >
              Order JSON
            </button>
            <button
              onClick={() => loadBoilerplate('auth')}
              className="px-2 py-0.5 bg-[#171B26] border border-[#222833] hover:border-indigo-500/50 hover:bg-[#202636] text-gray-300 rounded transition-colors"
            >
              Auth Log
            </button>
            <button
              onClick={() => loadBoilerplate('telemetry')}
              className="px-2 py-0.5 bg-[#171B26] border border-[#222833] hover:border-indigo-500/50 hover:bg-[#202636] text-gray-300 rounded transition-colors"
            >
              IoT Data
            </button>
          </div>
        </div>

        <form onSubmit={handleSendSubmit} className="space-y-4 font-mono text-[11px] flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Partition key</label>
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full bg-[#0D1015] border border-[#222833] focus:border-indigo-500/80 rounded px-2.5 py-1.5 text-gray-300 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Compression Level</label>
                <select
                  value={compressionSelection}
                  onChange={(e) => setCompressionSelection(e.target.value as CompressionType)}
                  className="w-full bg-[#0D1015] border border-[#222833] rounded px-2 py-1.5 text-gray-300 focus:outline-[#888]"
                >
                  <option value="none">none (RAW Bytes)</option>
                  <option value="snappy">snappy (High Throughput)</option>
                  <option value="gzip">gzip (High Comp ratio)</option>
                  <option value="zstd">zstd (Enterprise standard)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-12 flex justify-between text-[10px] uppercase font-bold">
                <span>Durability ACK Level Verification</span>
                <span className="text-gray-500 select-none normal-case font-medium">Controls replication safety constraints before returning results.</span>
              </label>

              <div className="grid grid-cols-3 gap-2 -mt-10 mb-2">
                <div
                  onClick={() => setAckSelection('0')}
                  className={`border rounded p-2 text-center cursor-pointer transition-all ${
                    ackSelection === '0'
                      ? 'bg-amber-950/20 border-amber-600/60 text-amber-300 font-bold shadow-md shadow-amber-950/20'
                      : 'bg-[#151821] border-[#222833] hover:bg-[#1A1F2C] text-gray-500'
                  }`}
                >
                  <span className="block text-xs">acks = 0</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5">Fire &amp; forget (No verify)</span>
                </div>
                <div
                  onClick={() => setAckSelection('1')}
                  className={`border rounded p-2 text-center cursor-pointer transition-all ${
                    ackSelection === '1'
                      ? 'bg-indigo-950/30 border-indigo-500/60 text-indigo-300 font-bold shadow-md shadow-indigo-950/20'
                      : 'bg-[#151821] border-[#222833] hover:bg-[#1A1F2C] text-gray-500'
                  }`}
                >
                  <span className="block text-xs">acks = 1</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5">Local Leader verification</span>
                </div>
                <div
                  onClick={() => setAckSelection('all')}
                  className={`border rounded p-2 text-center cursor-pointer transition-all ${
                    ackSelection === 'all'
                      ? 'bg-emerald-950/20 border-emerald-500/60 text-emerald-400 font-bold shadow-md shadow-emerald-950/20'
                      : 'bg-[#151821] border-[#222833] hover:bg-[#1A1F2C] text-gray-500'
                  }`}
                >
                  <span className="block text-xs">acks = all</span>
                  <span className="text-[9px] text-gray-400 block mt-0.5">Full ISR Quorum Quorum</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 mb-1 text-[10px] uppercase font-bold">Message JSON Payload</label>
              <textarea
                rows={5}
                value={payloadInput}
                onChange={(e) => setPayloadInput(e.target.value)}
                className="w-full bg-[#0C0F14] border border-[#222833] focus:border-indigo-500/80 rounded p-2.5 text-gray-200 focus:outline-none whitespace-pre overflow-y-auto leading-relaxed h-32"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#222833] pt-4 mt-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span>C++20 Producer API connected</span>
            </div>

            <button
              type="submit"
              disabled={isSending}
              className={`flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold rounded-lg border shadow-lg transition-all active:scale-95 ${
                sendSuccessToken
                  ? 'bg-emerald-900 border-emerald-500 text-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white disabled:opacity-60'
              }`}
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Sending ({ackSelection === 'all' ? 'Replicating ISR...' : 'Awaiting Ack...'})
                </>
              ) : sendSuccessToken ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-200" />
                  Offset Published!
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-indigo-100" />
                  Execute producer_send()
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* MONOSPACE CONSUMER GROUP COCKPIT */}
      <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#222833] pb-4 mb-4 gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
              <Terminal className="w-4 h-4 text-emerald-400" /> Consumer Group Controller
            </h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Group ID: analytics_data_processors</p>
          </div>

          {/* Active Poll Status Indicators */}
          <button
            onClick={onTogglePolling}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold border rounded-lg transition-all active:scale-95 ${
              isSubscribedPoll
                ? 'bg-emerald-950 border-emerald-500/50 text-emerald-300'
                : 'bg-red-950/20 border-red-900/30 text-red-400 hover:bg-red-900/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isSubscribedPoll ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
            {isSubscribedPoll ? 'Active Consumer Polling' : 'Suspended Consumers'}
          </button>
        </div>

        {/* Consumer group rebalance controls */}
        <div className="bg-[#161B24] border border-[#222833] rounded-lg p-3.5 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-[11px] text-gray-400">
          <div className="space-y-1.5">
            <h3 className="text-gray-300 font-semibold font-sans mb-1 uppercase text-[9px] tracking-wider text-indigo-400">Scaling Clusters</h3>
            <div className="flex items-center gap-2">
              <span>Active Group Members:</span>
              <strong className="text-gray-100">{consumerCount} instances</strong>
            </div>
            <div className="flex gap-2 text-[10px] pt-1">
              <button
                onClick={onAddConsumer}
                className="flex items-center gap-1 px-2 py-0.5 bg-indigo-950 border border-indigo-800 text-indigo-200 rounded hover:bg-indigo-900 transition-colors"
                title="Add consumer node to trigger automatic rebalance"
              >
                <Plus className="w-3 h-3" /> Add Consumer
              </button>
              <button
                onClick={onRemoveConsumer}
                className="flex items-center gap-1 px-2 py-0.5 bg-red-950/30 border border-red-900/30 hover:bg-red-900/20 text-red-300 rounded transition-colors"
                disabled={consumerCount <= 1}
              >
                <LogOut className="w-3 h-3 text-red-400" /> Scale Down
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-gray-300 font-semibold font-sans mb-1 uppercase text-[9px] tracking-wider text-indigo-400">Rebalance Strategy Assignor</h3>
            <div className="flex justify-between items-center bg-[#0D1015] border border-[#222833]/50 p-2 rounded">
              <div>
                <span className="text-[10px] text-gray-500 block uppercase font-bold">Assignor Mode:</span>
                <span className="text-gray-100 font-bold">{assignorStrategy} Assignor</span>
              </div>
              <button
                onClick={onToggleAssignor}
                className="flex items-center gap-1.5 px-2 py-1 bg-[#1A1F26] hover:bg-[#232933] border border-[#2b3340] rounded text-[10px] text-indigo-300 font-semibold uppercase"
              >
                Switch Assignor
              </button>
            </div>
          </div>
        </div>

        {/* Console Text display */}
        <div className="flex-1 bg-[#090C11] rounded-lg p-3 border border-[#222833] flex flex-col font-mono text-xs select-none">
          <div className="flex justify-between items-center bg-[#10141C] border-b border-[#222833] pb-1.5 mb-2 px-1 text-[10px] text-gray-500 uppercase font-black tracking-wider">
            <span>CONSUMED MESSAGE RECORDS STREAM</span>
            <span className="text-indigo-400">Lag: {overallLag} records</span>
          </div>

          <div className="flex-1 overflow-y-auto h-48 space-y-1.5 pr-1 text-[11px] leading-relaxed select-text">
            {consumerLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center select-none">
                <AlertCircle className="w-7 h-7 text-indigo-800/40 mb-1" />
                <p className="text-gray-500">Awaiting consumer pull feeds</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Toggle "Active Consumer Polling" above to begin consumption</p>
              </div>
            ) : (
              consumerLogs.map((log, index) => {
                let colorClass = 'text-gray-400';
                if (log.includes('[REBALANCE]')) colorClass = 'text-amber-400 font-bold bg-amber-950/20 border-y border-amber-950/30 py-0.5';
                else if (log.includes('[PULL_RECORD]')) colorClass = 'text-emerald-400';
                else if (log.includes('[METRIC]')) colorClass = 'text-indigo-400';
                return (
                  <div key={index} className={`font-mono text-[10px] sm:text-[11px] border-b border-gray-900/45 pb-0.5 ${colorClass}`}>
                    {log}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] text-center">
          <div className="bg-[#12151D] border border-[#222833]/30 rounded p-1.5 text-gray-400">
            <span className="text-gray-500 uppercase block text-[8px]">Ingest Topic Offset</span>
            <span className="font-extrabold text-gray-300">{totalMessagesInTopic}</span>
          </div>
          <div className="bg-[#12151D] border border-[#222833]/30 rounded p-1.5 text-gray-400">
            <span className="text-gray-500 uppercase block text-[8px]">Consumed Offset</span>
            <span className="font-extrabold text-[#74c0fc]">{totalMessagesConsumed}</span>
          </div>
          <div className="bg-[#12151D] border border-[#222833]/30 rounded p-1.5 text-gray-400">
            <span className="text-gray-500 uppercase block text-[8px]">Consumer Lag</span>
            <span className={`font-extrabold ${overallLag > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {overallLag}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
