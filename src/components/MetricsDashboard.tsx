import React, { useMemo } from 'react';
import { MetricsSnapshot } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Activity, Gauge, Cpu, HardDrive, HelpCircle } from 'lucide-react';

interface MetricsDashboardProps {
  metrics: MetricsSnapshot;
  history: Array<{ time: string; inRate: number; outRate: number; latency: number }>;
}

export default function MetricsDashboard({ metrics, history }: MetricsDashboardProps) {
  // Mocking standard Prometheus Text format metrics
  const prometheusTextOutput = useMemo(() => {
    return `# HELP streamflow_broker_bytes_in_total Total bytes ingested by the StreamFlow broker logs
# TYPE streamflow_broker_bytes_in_total counter
streamflow_broker_bytes_in_total{node="1"} ${(metrics.throughputIn * 1024 * 1024 * 14).toFixed(0)}
streamflow_broker_bytes_in_total{node="2"} ${(metrics.throughputIn * 1024 * 1024 * 6).toFixed(0)}
streamflow_broker_bytes_in_total{node="3"} ${(metrics.throughputIn * 1024 * 1024 * 4).toFixed(0)}

# HELP streamflow_broker_request_latency_ms Total P99 request latencies
# TYPE streamflow_broker_request_latency_ms gauge
streamflow_broker_request_latency_ms{percentile="p50"} ${metrics.p50LatencyMs.toFixed(2)}
streamflow_broker_request_latency_ms{percentile="p95"} ${metrics.p95LatencyMs.toFixed(2)}
streamflow_broker_request_latency_ms{percentile="p99"} ${metrics.p99LatencyMs.toFixed(2)}

# HELP streamflow_consumer_group_lag Total uncommitted offset lags in group
# TYPE streamflow_consumer_group_lag gauge
streamflow_consumer_group_lag{group="analytics_data_processors",topic="orders",partition="0"} 3
streamflow_consumer_group_lag{group="analytics_data_processors",topic="orders",partition="1"} 1
streamflow_consumer_group_lag{group="analytics_data_processors",topic="orders",partition="2"} 0`;
  }, [metrics]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="metrics-dashboard- composite">
      {/* Metrics Graphs Panel */}
      <div className="lg:col-span-2 bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="border-b border-[#222833] pb-4 mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
              <Activity className="w-4 h-4 text-indigo-400" /> Live Metrics Cockpit
            </h2>
            <p className="text-xs text-gray-400 mt-1">Real-time IO throughput, request-response P50/P99 latency, and cluster queues</p>
          </div>
          <div className="bg-[#191D27] text-indigo-300 font-mono text-[10px] px-2 py-0.5 rounded border border-[#222833]">
            Telemetry: 1s Interval
          </div>
        </div>

        {/* Dynamic Recharts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {/* Chart 1: Ingest/Egress Rates */}
          <div className="bg-[#151922] border border-[#222833] rounded-lg p-3.5 flex flex-col h-60">
            <h3 className="text-xs font-semibold text-gray-300 mb-3 font-sans">Network Throughput (MB/s)</h3>
            <div className="flex-1 w-full min-h-0 text-[10px] font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1F2531" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="#4f5666" />
                  <YAxis stroke="#4f5666" />
                  <Tooltip contentStyle={{ backgroundColor: '#11141a', borderColor: '#222833', color: '#c3c8d4' }} />
                  <Area type="monotone" dataKey="inRate" stroke="#6366f1" strokeWidth={1.5} fillOpacity={1} fill="url(#colorIn)" name="Ingest (Bytes In)" />
                  <Area type="monotone" dataKey="outRate" stroke="#34d399" strokeWidth={1.5} fillOpacity={1} fill="url(#colorOut)" name="Egress (Bytes Out)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: P95 latencies */}
          <div className="bg-[#151922] border border-[#222833] rounded-lg p-3.5 flex flex-col h-60">
            <h3 className="text-xs font-semibold text-gray-300 mb-3 font-sans">Ingestion Request Latency (ms)</h3>
            <div className="flex-1 w-full min-h-0 text-[10px] font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke="#1F2531" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="#4f5666" />
                  <YAxis stroke="#4f5666" />
                  <Tooltip contentStyle={{ backgroundColor: '#11141a', borderColor: '#222833', color: '#c3c8d4' }} />
                  <Line type="monotone" dataKey="latency" stroke="#fbbf24" strokeWidth={1.5} dot={false} name="P99 publish latency" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Metrics Overview footer numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#151922] rounded-lg border border-[#222833] p-3 mt-4">
          <div className="text-center font-mono">
            <span className="text-gray-500 text-[8px] uppercase font-bold block mb-0.5">Cluster QPS</span>
            <span className="text-lg font-extrabold text-gray-200">{metrics.qps}</span>
          </div>
          <div className="text-center font-mono">
            <span className="text-gray-500 text-[8px] uppercase font-bold block mb-0.5">p50 Latency</span>
            <span className="text-lg font-extrabold text-emerald-400">{metrics.p50LatencyMs.toFixed(1)} ms</span>
          </div>
          <div className="text-center font-mono">
            <span className="text-gray-500 text-[8px] uppercase font-bold block mb-0.5">p99 Latency</span>
            <span className="text-lg font-extrabold text-amber-500">{metrics.p99LatencyMs.toFixed(1)} ms</span>
          </div>
          <div className="text-center font-mono">
            <span className="text-gray-500 text-[8px] uppercase font-bold block mb-0.5">TCP Sessions</span>
            <span className="text-lg font-extrabold text-indigo-400">{metrics.activeConnections} active</span>
          </div>
        </div>
      </div>

      {/* Prom metrics raw output sidepane */}
      <div className="bg-[#11141A] rounded-xl p-5 border border-[#222833] flex flex-col h-full min-h-[500px]">
        <div className="border-b border-[#222833] pb-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-1.5 font-sans">
            <Gauge className="w-4 h-4 text-amber-400" /> Prometheus Scraper
          </h2>
          <p className="text-xs text-gray-400 mt-1">Exposing metrics in open-telemetry standard formats for Grafana syncs.</p>
        </div>

        <div className="flex-1 bg-[#090C11] rounded-lg p-3 border border-[#222833] font-mono text-[10px] leading-relaxed text-[#c3c8d4] overflow-auto h-72">
          <pre>{prometheusTextOutput}</pre>
        </div>

        <div className="mt-4 p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg flex items-start gap-2 text-[10px] text-indigo-300 font-mono leading-relaxed">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            StreamFlow brokers host an embedded HTTP server querying local `std::atomic` values to serve the standard `/metrics` endpoint.
          </span>
        </div>
      </div>
    </div>
  );
}
