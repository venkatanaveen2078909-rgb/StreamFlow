import React, { useState } from 'react';
import { CPP_FILES, CppFile } from '../data/cpp_files';
import { FileCode, Shield, Key, Eye, HelpCircle, Code, ArrowRight } from 'lucide-react';

export default function CodeExplorer() {
  const [selectedFileKey, setSelectedFileKey] = useState<string>('types.hpp');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiagram, setShowDiagram] = useState<'class' | 'sequence'>('sequence');

  const fileKeys = Object.keys(CPP_FILES);
  const currentFile = CPP_FILES[selectedFileKey] || CPP_FILES['types.hpp'];

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentFile.code);
    alert(`Copied ${currentFile.name} code to clipboard!`);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" id="cpp-code-explorer-workspace">
      {/* C++ IDE Tab Selector & Tutorial panel */}
      <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[550px]">
        <div className="border-b border-[#222833] pb-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
            <Code className="w-4 h-4 text-indigo-400" /> C++20 Source Code Explorer
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Browse the active StreamFlow repository in C++20. This is the exact code generated on the files disk.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="space-y-1 overflow-y-auto max-h-52 pr-1 mb-4">
          {fileKeys.map((key) => {
            const file = CPP_FILES[key];
            const isSelected = key === selectedFileKey;
            return (
              <div
                key={key}
                onClick={() => setSelectedFileKey(key)}
                className={`flex items-center justify-between px-3 py-2 rounded border cursor-pointer font-mono text-[11px] transition-all ${
                  isSelected
                    ? 'bg-indigo-950/20 border-indigo-500/50 text-indigo-300 font-bold'
                    : 'bg-[#151921] border-[#222833] text-gray-400 hover:text-gray-200 hover:bg-[#1E232F]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  {file.name}
                </span>
                <span className="text-[9px] uppercase opacity-60 text-gray-500">{file.language}</span>
              </div>
            );
          })}
        </div>

        {/* Dynamic Architectural Tutoring Side Block */}
        <div className="flex-1 bg-[#141822] rounded-lg p-4 border border-[#222833] flex flex-col select-none text-xs font-mono">
          <h3 className="text-gray-300 font-semibold mb-2 flex items-center gap-1 text-[10px] uppercase font-sans tracking-wide text-indigo-400">
            <HelpCircle className="w-3.5 h-3.5" /> Component Explanation
          </h3>
          <p className="text-gray-300 text-[11px] leading-relaxed mb-4">
            {currentFile.explanation}
          </p>

          <div className="bg-[#0D1015]/80 rounded border border-[#222833] p-3 space-y-3 mt-auto">
            <h4 className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">CRITICAL C++ FEATURES SHOWN</h4>
            <div className="space-y-2 text-[10px] text-gray-400 leading-normal">
              <div className="flex items-start gap-1.5">
                <span className="text-indigo-400 font-extrabold">&bull;</span>
                <div>
                  <strong className="text-gray-300">std::span Ref:</strong> Zero-copy views on sequential strings/vectors payloads, bypassing allocations.
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-indigo-400 font-extrabold">&bull;</span>
                <div>
                  <strong className="text-gray-300">RAII File Handles:</strong> Auto-flush segment buffers on object destruction preventing data rot.
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-indigo-400 font-extrabold">&bull;</span>
                <div>
                  <strong className="text-gray-300">Perfect Forwarding:</strong> Forwarding key-value references directly to vectors minimizing deep copies.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* C++ Code Window Console Editor - Tabs and Lines */}
      <div className="lg:col-span-2 bg-[#10141D] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[550px]">
        {/* Toggle between UML visual and Code block */}
        <div className="flex items-center justify-between border-b border-[#222833] pb-3 mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-300 font-bold font-sans">
            <FileCode className="w-4 h-4 text-indigo-400 animate-pulse" />
            Active code segment: <span className="text-indigo-300 font-mono text-[11px]">/{currentFile.name}</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px]">
            <button
              onClick={() => setShowDiagram(showDiagram === 'sequence' ? 'class' : 'sequence')}
              className="flex items-center gap-1.5 px-2 py-1 bg-[#1A1F26] hover:bg-[#252C36] border border-[#2e3745] rounded-md text-indigo-200"
            >
              <Eye className="w-3.5 h-3.5" /> Shows UML: {showDiagram === 'sequence' ? 'Cluster Systems Class UML' : 'Log Append Sequence UML'}
            </button>

            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded font-bold"
            >
              Copy Source File
            </button>
          </div>
        </div>

        {/* Dynamic Canvas toggle showing either UML SVG or syntax-highlighted editor code */}
        <div className="flex-1 bg-[#090C11] rounded-lg border border-[#222833] p-4 font-mono text-xs overflow-y-auto leading-relaxed relative flex flex-col justify-between min-h-[400px]">
          {/* SVG UML / Sequence Diagram Canvas Panel overlay */}
          {showDiagram ? (
            <div className="absolute inset-0 bg-[#07090C] z-30 p-5 flex flex-col h-full overflow-hidden select-none">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2 mb-4 font-mono text-[10px] text-gray-500 uppercase tracking-wide">
                <span>SYSTEM DIAGRAM VISUAL COGNITION PANEL</span>
                <button
                  onClick={() => setShowDiagram('sequence')}
                  className="text-indigo-400 hover:text-indigo-300 underline lowercase"
                  style={{ display: 'none' }} // used as a toggle
                >
                  Close
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center bg-[#0C0F14] border border-[#222833]/30 rounded-lg p-2 overflow-auto relative">
                {showDiagram === 'sequence' ? (
                  /* SEQUENCE FLOW DIAGRAM */
                  <svg className="w-full h-full min-w-[500px]" viewBox="0 0 600 320" style={{ maxHeight: '350px' }}>
                    {/* Role Timelines */}
                    <line x1="80" y1="40" x2="80" y2="280" stroke="#4f5666" strokeWidth="1.5" />
                    <line x1="260" y1="40" x2="260" y2="280" stroke="#4f5666" strokeWidth="1.5" />
                    <line x1="440" y1="40" x2="440" y2="280" stroke="#4f5666" strokeWidth="1.5" />

                    {/* Timeline Headers */}
                    <rect x="30" y="10" width="100" height="24" rx="4" fill="#1D2430" stroke="#313A4A" />
                    <text x="80" y="26" textAnchor="middle" fill="#c3c8d4" fontSize="10" fontWeight="bold">Producer API</text>

                    <rect x="210" y="10" width="100" height="24" rx="4" fill="#1A2D2B" stroke="#10B981" strokeWidth="1" />
                    <text x="260" y="26" textAnchor="middle" fill="#34D399" fontSize="10" fontWeight="bold">Leader Broker</text>

                    <rect x="390" y="10" width="100" height="24" rx="4" fill="#241B2F" stroke="#8b5cf6" strokeWidth="1" />
                    <text x="440" y="26" textAnchor="middle" fill="#A78BFA" fontSize="10" fontWeight="bold">Raft Followers</text>

                    {/* Step Messages */}
                    {/* 1. Send sync */}
                    <line x1="80" y1="80" x2="255" y2="80" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow)" />
                    <text x="170" y="73" textAnchor="middle" fill="#c3c8d4" fontSize="9">1. send_sync(key, json)</text>

                    {/* 2. Commit log */}
                    <path d="M 260 110 C 310 110, 310 130, 262 130" stroke="#10b981" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
                    <text x="310" y="124" fill="#a7b5cc" fontSize="9">2. Append Local Segment Log</text>

                    {/* 3. Replicate RPC */}
                    <line x1="260" y1="165" x2="435" y2="165" stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arrow)" />
                    <text x="350" y="157" textAnchor="middle" fill="#d8b4fe" fontSize="9">3. ReplicateLogs gRPC</text>

                    {/* 4. Followers Sync ACK */}
                    <line x1="440" y1="205" x2="265" y2="205" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />
                    <text x="352" y="198" textAnchor="middle" fill="#d8b4fe" fontSize="9">4. synchronization_committed</text>

                    {/* 5. Return offsets */}
                    <line x1="260" y1="245" x2="85" y2="245" stroke="#6366f1" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />
                    <text x="172" y="238" textAnchor="middle" fill="#c3c8d4" fontSize="9">5. Return Offset &amp; Checksums</text>

                    {/* SVG Arrow Marker */}
                    <defs>
                      <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
                      </marker>
                    </defs>
                  </svg>
                ) : (
                  /* CLASS DIAGRAM UML */
                  <svg className="w-full h-full min-w-[500px]" viewBox="0 0 600 320" style={{ maxHeight: '350px' }}>
                    {/* Class Box Broker */}
                    <rect x="220" y="12" width="160" height="90" rx="6" fill="#151A24" stroke="#4a5a73" />
                    <text x="300" y="28" textAnchor="middle" fill="#c3c8d4" fontSize="9" fontWeight="extrabold">Broker</text>
                    <line x1="220" y1="36" x2="380" y2="36" stroke="#4a5a73" strokeWidth="1" />
                    <text x="228" y="48" fill="#a7b5cc" fontSize="8">- active_partitions_: map</text>
                    <text x="228" y="58" fill="#a7b5cc" fontSize="8">- raft_node_: unique_ptr</text>
                    <line x1="220" y1="64" x2="380" y2="64" stroke="#4a5a73" strokeWidth="1" />
                    <text x="228" y="76" fill="#a7b5cc" fontSize="8">+ publish_records()</text>
                    <text x="228" y="86" fill="#a7b5cc" fontSize="8">+ fetch_records()</text>

                    {/* Class Box RaftNode */}
                    <rect x="20" y="150" width="160" height="110" rx="6" fill="#151A24" stroke="#8b5cf6" />
                    <text x="100" y="166" textAnchor="middle" fill="#d8b4fe" fontSize="9" fontWeight="extrabold">RaftNode</text>
                    <line x1="20" y1="174" x2="180" y2="174" stroke="#8b5cf6" />
                    <text x="28" y="186" fill="#a7b5cc" fontSize="8">- role_: RaftRole</text>
                    <text x="28" y="196" fill="#a7b5cc" fontSize="8">- current_term_: atomic</text>
                    <text x="28" y="206" fill="#a7b5cc" fontSize="8">- peers_: vector</text>
                    <line x1="20" y1="212" x2="180" y2="212" stroke="#8b5cf6" />
                    <text x="28" y="224" fill="#a7b5cc" fontSize="8">+ request_vote()</text>
                    <text x="28" y="234" fill="#a7b5cc" fontSize="8">+ append_entries()</text>
                    <text x="28" y="244" fill="#a7b5cc" fontSize="8">+ start() &bull; stop()</text>

                    {/* Class Box PartitionLogEngine */}
                    <rect x="420" y="150" width="160" height="90" rx="6" fill="#151A24" stroke="#10b981" />
                    <text x="500" y="166" textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="extrabold">PartitionLogEngine</text>
                    <line x1="420" y1="174" x2="580" y2="174" stroke="#10b981" />
                    <text x="428" y="186" fill="#a7b5cc" fontSize="8">- segments_: vector</text>
                    <text x="428" y="196" fill="#a7b5cc" fontSize="8">- end_offset_: Offset</text>
                    <line x1="420" y1="202" x2="580" y2="202" stroke="#10b981" />
                    <text x="428" y="214" fill="#a7b5cc" fontSize="8">+ append(Message&amp;)</text>
                    <text x="428" y="224" fill="#a7b5cc" fontSize="8">+ read(Offset, bytes)</text>

                    {/* Association arrow lines */}
                    <line x1="220" y1="80" x2="130" y2="150" stroke="#777" strokeWidth="1" strokeDasharray="3 3" />
                    <line x1="380" y1="80" x2="470" y2="150" stroke="#777" strokeWidth="1" strokeDasharray="3 3" />
                  </svg>
                )}
              </div>

              <div className="flex justify-end pt-3 text-[10px] font-mono text-indigo-400">
                <button
                  onClick={() => setShowDiagram('sequence')}
                  className="px-3 py-1 bg-[#1A1F26] hover:bg-[#252C36] text-gray-300 rounded border border-[#2c3545]"
                >
                  Return to Code Editor View
                </button>
              </div>
            </div>
          ) : null}

          {/* Actual Monospace IDE editor display with styled code strings */}
          <pre className="text-[10px] sm:text-xs leading-5 text-gray-300 select-text bg-black/45 p-3 rounded-lg border border-[#222833]/30 max-h-[460px] overflow-auto whitespace-pre font-mono">
            {currentFile.code}
          </pre>
        </div>
      </div>
    </div>
  );
}
