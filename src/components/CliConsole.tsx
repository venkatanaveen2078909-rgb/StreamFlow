import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Shield, ChevronRight } from 'lucide-react';

interface CliConsoleProps {
  onAddTopicFromCli: (name: string) => void;
  onClearStatsFromCli: () => void;
}

interface CommandHistory {
  input: string;
  output: string;
  error?: boolean;
}

export default function CliConsole({ onAddTopicFromCli, onClearStatsFromCli }: CliConsoleProps) {
  const [cliInput, setCliInput] = useState('');
  const [history, setHistory] = useState<CommandHistory[]>([
    {
      input: 'streamflow help',
      output: `StreamFlow Distributed Broker CLI v1.0.0 (Modern C++ && gRPC Pipeline Client)

Standard Commands:
  streamflow topic create <topic>   Provisions a new distributed log topic
  streamflow cluster status          Fetches the live status of the Raft cluster
  streamflow consumer list           Lists consumer groups active on broker regions
  streamflow clear                   Clears terminal memory outputs
  help                               Prints this instruction deck`,
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCmd = cliInput.trim().toLowerCase();
    if (!cleanCmd) return;

    let output = '';
    let isError = false;

    if (cleanCmd === 'help') {
      output = `StreamFlow CLI Help Utility:
  streamflow topic create <name>   Provision a topic partition on disks
  streamflow cluster status        Display active leader & term terms
  streamflow consumer list         Fetch active listener metrics
  streamflow clear                 Purge CLI entries`;
    } else if (cleanCmd === 'clear' || cleanCmd === 'streamflow clear') {
      setHistory([]);
      setCliInput('');
      return;
    } else if (cleanCmd === 'streamflow cluster status') {
      output = `FETCHING CLUSTER MEMBERSHIP DISCOVERY STATUS GREGARIOUS...
STATUS: ONLINE (3 nodes discovered, consensus reached)

  Node-1: ONLINE  [Role: Leader]    Term: 2  Votes: 2/3 [ISR Active]
  Node-2: ONLINE  [Role: Follower]  Term: 2  Votes: 0/3 [ISR Active]
  Node-3: ONLINE  [Role: Follower]  Term: 2  Votes: 0/3 [ISR Active]

High Watermark Offset Consistency: SYNCED`;
    } else if (cleanCmd === 'streamflow consumer list') {
      output = `ACTIVE CONSUMER GROUPS TELEMETRY:
  Group: analytics_data_processors
    Topic Subscribed: orders
    Active Consumers: 2 nodes
    Rebalance Strategy: RangeAssignor
    Accumulated Group Lag: 3 records`;
    } else if (cleanCmd.startsWith('streamflow topic create ')) {
      const parts = cliInput.split(' ');
      const topicName = parts[3]?.trim().toLowerCase();

      if (topicName && topicName.length > 2) {
        onAddTopicFromCli(topicName);
        output = `SUCCESS: Topic "${topicName}" provisioned.
  - Partitions: 3
  - Replication Factor: 3
  - Segment Roller Limit: 50.00 MB
Status: BROADCASTED TO LEADER COORDINATOR SUCCESS.`;
      } else {
        output = `ERROR: Invalid topic identifier name. Must exceed 2 characters.`;
        isError = true;
      }
    } else {
      output = `Command error: "${cliInput}" not identified in local client binaries.
Type "help" to list allowed instructions.`;
      isError = true;
    }

    setHistory((prev) => [...prev, { input: cliInput, output, error: isError }]);
    setCliInput('');
  };

  return (
    <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-[500px]" id="cli-shell-composite">
      <div className="border-b border-[#222833] pb-4 mb-4">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
          <Terminal className="w-4 h-4 text-indigo-400" /> Interactive C++ Admin CLI
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Simulating remote command line administration over SSH tunnels. Try typing <span className="text-indigo-400 font-mono">streamflow cluster status</span> below!
        </p>
      </div>

      {/* Terminal History Container */}
      <div className="flex-1 bg-[#090C11] rounded-lg p-3 border border-[#222833] mb-3 overflow-y-auto font-mono text-[11px] leading-relaxed select-text">
        <div className="text-[#4f5666] mb-3 select-none">
          Type "help" or "streamflow help" to list binary operations.
        </div>

        <div className="space-y-4">
          {history.map((item, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-1 text-indigo-400">
                <ChevronRight className="w-3.5 h-3.5 font-bold" />
                <span className="font-semibold">{item.input}</span>
              </div>
              <pre className={`whitespace-pre-wrap pl-4 font-mono ${item.error ? 'text-red-400' : 'text-gray-300'}`}>
                {item.output}
              </pre>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Inputs Form */}
      <form onSubmit={handleCommandSubmit} className="flex gap-2">
        <div className="flex-1 bg-[#090C11] border border-[#222833] rounded-lg flex items-center px-2.5 py-1.5 focus-within:border-indigo-500/50 transition-colors">
          <ChevronRight className="w-4 h-4 text-indigo-400 font-bold mr-1 shrink-0" />
          <input
            type="text"
            value={cliInput}
            onChange={(e) => setCliInput(e.target.value)}
            placeholder="e.g. streamflow cluster status"
            className="w-full bg-transparent border-none text-gray-200 font-mono text-[11px] focus:outline-none"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg text-xs font-mono font-bold transition-all active:scale-95 shrink-0"
        >
          Run Cmd
        </button>
      </form>
    </div>
  );
}
