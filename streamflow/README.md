# StreamFlow Architecture & Implementation Guidelines

Welcome to the **StreamFlow** distributed event streaming platform, engineered in high-performance **Modern C++20**. This document details the architectural specifications, sequence flows, design patterns, and hardware-efficiency considerations underlying the platform.

---

## 🚀 Architectural Overview

StreamFlow organizes high-throughput, low-latency queues into segment-backed append-only logs replicated across dynamically coordinated nodes under a Raft consensus protocol.

```
                  +---------------------------+
                  |  Producers (acks=0,1,all)  |
                  +-------------+-------------+
                                |
                                | (Publish RPC)
                                v
               +---------------------------------+
               |         Broker Cluster          |
               |                                 |
               |  +-------+  +-------+  +-------+  |
               |  |Node-1 |  |Node-2 |  |Node-3 |  |
               |  |Leader |  |Follow |  |Follow |  |
               |  +---+---+  +---+---+  +---+---+  |
               +------|----------|----------|----+
                      |          |          |
         +------------v----------v----------v------------+
         | Partition-0 (Topic: Orders - RepFactor 3)     |
         |                                               |
         | +------------------+   +--------------------+ |
         | | segment_000.log  |   | segment_000.index  | |
         | | Binary Records   |   | Memory-Mapped Seek | |
         | +------------------+   +--------------------+ |
         +-----------------------------------------------+
                                |
                                | (Commit Polls)
                                v
                +-------------------------------+
                |     Consumer Groups (ISR)     |
                +-------------------------------+
```

---

## 🛠️ Folder Structure

```text
streamflow/
├── CMakeLists.txt              # Standard system compiler targets linking Boost, gRPC, spdlog, gtest
├── proto/
│   └── streamflow.proto        # Protocol Buffers RPC services schemas
├── common/
│   └── types.hpp               # Custom CRC32 engines, alignment bounds, RAII wrappers, compression types
├── storage/
│   ├── segment_log.hpp         # Binary segmented storage header
│   └── segment_log.cpp         # Log rolls, compression compactions, bin search offsets index seeks
├── consensus/
│   ├── raft_node.hpp           # Term trackers, election candidates state machines
│   └── raft_node.cpp           # Heartbeat threads, split-brain randomized timer loops
├── broker/
│   ├── broker.hpp              # Multi-partition coordinator cluster interface
│   └── broker.cpp              # In-Sync Replica (ISR) managers, follower synchronization routines
├── producer/
│   ├── producer.hpp            # Batch background workers API
│   └── producer.cpp            # Backoffs and retry pipeline executors
├── consumer/
│   ├── consumer.hpp            # Multi-consumer group registration managers
│   └── consumer.cpp            # Offset seek trackers, Range / Round Rabin assignment strategies
├── Dockerfile                  # Containerized image compiling targets in multi-stage builds
└── docker-compose.yml          # Dynamic 3-broker development network composition
```

---

## 📊 Core Architectural Flows

### 1. Unified Message Lifecycle (Producer Sync to Log Segment)

The sequence diagram below displays the lifecycle of a message from creation, checksum validation, gRPC publish, leadership validation, segment rollover checks, backplane replication, and client verification.

```
[Producer Client]       [Broker (Leader)]      [Partition Engine]      [Follower Node]
       |                        |                       |                     |
       |--- send_sync() ------->|                       |                     |
       |    (CRC Checksum)      |                       |                     |
       |                        |--- append() --------->|                     |
       |                        |    (Write Header)     |                     |
       |                        |    (Update Index)     |                     |
       |                        |<-- SUCCESS -----------|                     |
       |                        |                                             |
       |                        |--- Replicate gRPC ------------------------->|
       |                        |                                             | (Append local)
       |                        |<-- ACK (Offset synchronized) ---------------|
       |                        |
       |    (High Watermark Up) |
       |<-- Publish Result -----|
```

---

## 📈 Quality of Service (QoS) & Durability

### 1. Acknowledgment Levels
* **`acks=0`**: Producer fires and forgets without waiting for verification. Achieve near network line speed throughput but risk message drops if buffers flood.
* **`acks=1`**: Producer blocks until leader broker commits records to active local segments. Solves basic networking drops of broker packets.
* **`acks=all`** (`-1`): Producer blocks until leader writes records and receives successful replication confirmations matching the **In-Sync Replicas (ISR)** threshold. Prevents loss even under single broker node failure.

---

## 🧩 Required Design Patterns Documented

* **Factory Pattern**: Utilized to instantiate Partition Log Engines depending on topic specifications and configurations, mapping logical layouts to physical segment paths.
* **Strategy Pattern**: Promoted through the Consumer group rebalancing engine. Extends `range` or `round_robin` assignors uniformly depending on scaling densities.
* **Observer Pattern**: Incorporated through heartbeats and replication loops where active log changes notify corresponding replication managers.
* **Command Pattern**: Implemented in the Producer's thread pool, queuing asynchronous packet payloads as tasks dispatched sequentially.
* **Singleton Pattern**: Realized inside central broker discoverers in lightweight coordinators to ensure consistent nodes listing.

---

## ⚡ Modern C++ Principles Applied

```cpp
// 1. RAII Design Patterns
class LogSegment {
public:
    LogSegment(const std::filesystem::path& dir, Offset base_offset, size_t max_bytes);
    ~LogSegment() {
        flush(); // Auto-flush buffers on object destruction preventing data decay
    }
};

// 2. Move Semantics for High-Volume Pipelines
LogSegment::LogSegment(LogSegment&& other) noexcept
    : log_file_(std::move(other.log_file_))
    , index_(std::move(other.index_)) {
    // Avoid heap copying of active IO handle arrays
}

// 3. Perfect Forwarding & Templates Optimization
template <typename K, typename P>
Message(Offset off, Timestamp ts, K&& k, P&& p)
    : key(std::forward<K>(k))
    , payload(std::forward<P>(p)) {
    // Forward arguments directly to strings to eliminate copies
}
```
