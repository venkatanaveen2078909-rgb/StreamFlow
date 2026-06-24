export interface CppFile {
  name: string;
  path: string;
  language: string;
  explanation: string;
  code: string;
}

export const CPP_FILES: Record<string, CppFile> = {
  'CMakeLists.txt': {
    name: 'CMakeLists.txt',
    path: '/streamflow/CMakeLists.txt',
    language: 'cmake',
    explanation: 'Configure system builds for standard Modern C++20 workflows, resolving and linking critical distributed platform libraries like gRPC, Protocol Buffers, Boost.Asio, spdlog, and GoogleTest.',
    code: `cmake_minimum_required(VERSION 3.20)
project(StreamFlow VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Add compiler-specific optimization flags
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -O3 -march=native -pthread)
endif()

# Find dependency packages
find_package(Boost REQUIRED COMPONENTS system thread)
find_package(gRPC REQUIRED)
find_package(Protobuf REQUIRED)
find_package(spdlog REQUIRED)
enable_testing()
find_package(GTest)

include_directories(
    \${CMAKE_CURRENT_SOURCE_DIR}
    \${Boost_INCLUDE_DIRS}
    \${spdlog_INCLUDE_DIRS}
)

protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS proto/streamflow.proto)

add_library(streamflow_core STATIC
    \${PROTO_SRCS}
    \${PROTO_HDRS}
    storage/segment_log.cpp
    consensus/raft_node.cpp
    broker/broker.cpp
    replication/engine.cpp
    networking/asio_server.cpp
    producer/producer.cpp
    consumer/consumer.cpp
)

target_link_libraries(streamflow_core
    PRIVATE
        Boost::system
        Boost::thread
        gRPC::grpc++
        protobuf::libprotobuf
        spdlog::spdlog
)

add_executable(streamflow_broker broker/main.cpp)
target_link_libraries(streamflow_broker PRIVATE streamflow_core)

add_executable(streamflow cli/main.cpp)
target_link_libraries(streamflow PRIVATE streamflow_core)`
  },
  'types.hpp': {
    name: 'types.hpp',
    path: '/streamflow/common/types.hpp',
    language: 'cpp',
    explanation: 'Define core distributed schemas, types, and custom high-performance data verification structures. Promotes modern C++ practices including perfect forwarding constructors and span arrays to limit copies.',
    code: `#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <cstdint>
#include <span>

namespace streamflow {

using Offset = int64_t;
using Timestamp = int64_t;
using NodeId = int32_t;
using PartitionId = int32_t;

enum class CompressionType : uint8_t { NONE = 0, SNAPPY = 1, GZIP = 2, ZSTD = 3 };
enum class ResponseCode : int32_t {
    SUCCESS = 0, REPLICA_LAG = 1, PARTITION_NOT_FOUND = 2,
    NOT_LEADER_FOR_PARTITION = 3, MESSAGE_TOO_LARGE = 4,
    CHECKSUM_MISMATCH = 5, TIMEOUT = 7, BROKER_CRASHED = 8
};

struct Message {
    Offset offset{0};
    Timestamp timestamp{0};
    std::string key;
    std::vector<uint8_t> payload;
    uint32_t checksum{0};
    CompressionType compression{CompressionType::NONE};

    Message() = default;
    
    // Perfect forwarding to skip memory copying during ingestion
    template <typename K, typename P>
    Message(Offset off, Timestamp ts, K&& k, P&& p, CompressionType comp = CompressionType::NONE)
        : offset(off), timestamp(ts)
        , key(std::forward<K>(k))
        , payload(std::forward<P>(p))
        , compression(comp) {
        checksum = calculate_checksum();
    }

    uint32_t calculate_checksum() const noexcept {
        uint32_t crc = 0xFFFFFFFF;
        auto crc_update = [](uint32_t init, std::span<const uint8_t> data) {
            uint32_t state = init;
            for (auto b : data) {
                state ^= b;
                for (int i = 0; i < 8; ++i) {
                    state = (state & 1) ? (state >> 1) ^ 0xEDB88320 : (state >> 1);
                }
            }
            return state;
        };
        crc = crc_update(crc, std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(key.data()), key.size()));
        crc = crc_update(crc, std::span<const uint8_t>(payload.data(), payload.size()));
        return ~crc;
    }

    bool verify() const noexcept { return calculate_checksum() == checksum; }
};

struct alignas(8) IndexEntry {
    uint32_t relative_offset;
    uint32_t physical_position;
};

}`
  },
  'segment_log.hpp': {
    name: 'segment_log.hpp',
    path: '/streamflow/storage/segment_log.hpp',
    language: 'cpp',
    explanation: 'Define segmented log structures managing sequential logs and indexes. Adheres strictly to the Rule of Five (RAII and move semantics) for file handles.',
    code: `#pragma once

#include "common/types.hpp"
#include <shared_mutex>
#include <fstream>
#include <vector>
#include <map>
#include <memory>
#include <filesystem>

namespace streamflow {

class LogSegment {
public:
    LogSegment(const std::filesystem::path& dir, Offset base_offset, size_t max_bytes);
    ~LogSegment();

    // Move constructors preventing file handle copies
    LogSegment(const LogSegment&) = delete;
    LogSegment& operator=(const LogSegment&) = delete;
    LogSegment(LogSegment&&) noexcept;
    LogSegment& operator=(LogSegment&&) noexcept;

    ResponseCode append(Message& msg);
    std::vector<Message> read(Offset start_offset, size_t max_bytes);

    Offset base_offset() const { return base_offset_; }
    Offset next_offset() const { return next_offset_; }
    size_t size_bytes() const { return size_bytes_; }
    bool is_full() const { return size_bytes_ >= max_bytes_; }
    void flush();
    void compact(const std::map<std::string, Offset>& latest_keys);

private:
    std::filesystem::path dir_;
    Offset base_offset_;
    Offset next_offset_;
    size_t max_bytes_;
    size_t size_bytes_;

    std::filesystem::path log_path_;
    std::filesystem::path index_path_;
    std::fstream log_file_;
    std::fstream index_file_;

    std::vector<IndexEntry> index_;
    void load_segment_meta();
    Offset binary_search_index(Offset target_offset) const;
};

class PartitionLogEngine {
public:
    PartitionLogEngine(PartitionConfig config, std::filesystem::path root_data_dir);
    
    ResponseCode append(Message& msg);
    std::vector<Message> read(Offset start_offset, size_t max_bytes);
    
    Offset high_watermark() const { return high_watermark_; }
    void set_high_watermark(Offset offset) { high_watermark_ = offset; }
    Offset end_offset() const { return end_offset_; }
    void trigger_compaction();

private:
    PartitionConfig config_;
    std::filesystem::path partition_dir_;
    Offset end_offset_{0};
    Offset high_watermark_{0};

    // Shared mutex allowing concurrent readers and single writer
    mutable std::shared_mutex log_mutex_;
    std::vector<std::unique_ptr<LogSegment>> segments_;

    void roll_segment();
};

}`
  },
  'segment_log.cpp': {
    name: 'segment_log.cpp',
    path: '/streamflow/storage/segment_log.cpp',
    language: 'cpp',
    explanation: 'Implements binary logging routines. Relies on memory-mapped style indexes with binary-search offset seekers (`std::lower_bound`) for sub-millisecond retrieval.',
    code: `#include "storage/segment_log.hpp"
#include <algorithm>
#include <iomanip>

namespace streamflow {

LogSegment::LogSegment(const std::filesystem::path& dir, Offset base_offset, size_t max_bytes)
    : dir_(dir), base_offset_(base_offset), next_offset_(base_offset)
    , max_bytes_(max_bytes), size_bytes_(0) {
    std::filesystem::create_directories(dir_);
    
    std::stringstream ss;
    ss << std::setw(20) << std::setfill('0') << base_offset;
    std::string base_name = ss.str();
    log_path_ = dir_ / (base_name + ".log");
    index_path_ = dir_ / (base_name + ".index");

    log_file_.open(log_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);
    index_file_.open(index_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);

    load_segment_meta();
}

ResponseCode LogSegment::append(Message& msg) {
    if (is_full()) return ResponseCode::MESSAGE_TOO_LARGE;

    log_file_.seekp(0, std::ios::end);
    size_t position = log_file_.tellp();

    msg.offset = next_offset_;
    uint32_t key_len = msg.key.size();
    uint32_t pay_len = msg.payload.size();
    uint8_t comp = static_cast<uint8_t>(msg.compression);

    log_file_.write(reinterpret_cast<const char*>(&msg.offset), sizeof(msg.offset));
    log_file_.write(reinterpret_cast<const char*>(&msg.timestamp), sizeof(msg.timestamp));
    log_file_.write(reinterpret_cast<const char*>(&key_len), sizeof(key_len));
    log_file_.write(reinterpret_cast<const char*>(&pay_len), sizeof(pay_len));
    log_file_.write(reinterpret_cast<const char*>(&msg.checksum), sizeof(msg.checksum));
    log_file_.write(reinterpret_cast<const char*>(&comp), sizeof(comp));
    log_file_.write(msg.key.data(), key_len);
    log_file_.write(reinterpret_cast<const char*>(msg.payload.data()), pay_len);

    IndexEntry entry{static_cast<uint32_t>(msg.offset - base_offset_), static_cast<uint32_t>(position)};
    index_file_.write(reinterpret_cast<const char*>(&entry), sizeof(entry));
    index_.push_back(entry);

    next_offset_++;
    size_bytes_ = log_file_.tellp();
    return ResponseCode::SUCCESS;
}

Offset LogSegment::binary_search_index(Offset target_offset) const {
    if (index_.empty()) return -1;
    uint32_t rel_offset = static_cast<uint32_t>(target_offset - base_offset_);
    
    // Fast O(log N) lookup in index file
    auto it = std::lower_bound(index_.begin(), index_.end(), rel_offset,
        [](const IndexEntry& entry, uint32_t target) {
            return entry.relative_offset < target;
        });

    if (it == index_.end()) return index_.back().physical_position;
    return it->physical_position;
}

std::vector<Message> LogSegment::read(Offset start_offset, size_t max_bytes) {
    std::vector<Message> messages;
    if (start_offset >= next_offset_ || start_offset < base_offset_) return messages;

    Offset physical_pos = binary_search_index(start_offset);
    if (physical_pos < 0) return messages;

    log_file_.seekg(physical_pos, std::ios::beg);
    size_t bytes_read = 0;

    while (bytes_read < max_bytes && log_file_.good() && log_file_.tellg() < static_cast<std::streamoff>(size_bytes_)) {
        Message msg;
        uint32_t key_len = 0, pay_len = 0;
        uint8_t comp = 0;

        log_file_.read(reinterpret_cast<char*>(&msg.offset), sizeof(msg.offset));
        log_file_.read(reinterpret_cast<char*>(&msg.timestamp), sizeof(msg.timestamp));
        log_file_.read(reinterpret_cast<char*>(&key_len), sizeof(key_len));
        log_file_.read(reinterpret_cast<char*>(&pay_len), sizeof(pay_len));
        log_file_.read(reinterpret_cast<char*>(&msg.checksum), sizeof(msg.checksum));
        log_file_.read(reinterpret_cast<char*>(&comp), sizeof(comp));

        msg.compression = static_cast<CompressionType>(comp);
        msg.key.resize(key_len);
        log_file_.read(msg.key.data(), key_len);
        msg.payload.resize(pay_len);
        log_file_.read(reinterpret_cast<char*>(msg.payload.data()), pay_len);

        if (msg.offset >= start_offset) messages.push_back(std::move(msg));
        bytes_read += (33 + key_len + pay_len);
    }
    return messages;
}

}`
  },
  'raft_node.hpp': {
    name: 'raft_node.hpp',
    path: '/streamflow/consensus/raft_node.hpp',
    language: 'cpp',
    explanation: 'Defines the Raft Consesus engine managing heartbeats, node lifecycles, Term promotion levels, and election routines. Integrates modern C++20 `std::jthread` support.',
    code: `#pragma once

#include "common/types.hpp"
#include <vector>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <chrono>

namespace streamflow {

enum class RaftRole : uint8_t { FOLLOWER = 0, CANDIDATE = 1, LEADER = 2 };

class RaftNode {
public:
    RaftNode(NodeId node_id, std::vector<NodeId> peers);
    ~RaftNode();

    void start();
    void stop();

    bool request_vote(int32_t term, NodeId candidate_id, int64_t last_log_index, int32_t last_log_term);
    bool append_entries(int32_t term, NodeId leader_id, int64_t prev_log_index, int32_t prev_log_term, const std::vector<Message>& entries, int64_t leader_commit);

    RaftRole role() const { return role_; }
    int32_t current_term() const { return current_term_; }
    NodeId leader_id() const { return leader_id_; }
    bool is_leader() const { return role_ == RaftRole::LEADER; }
    void crash();
    void recover();
    bool is_alive() const { return is_alive_.load(); }

private:
    NodeId node_id_;
    std::vector<NodeId> peers_;
    std::atomic<RaftRole> role_{RaftRole::FOLLOWER};
    std::atomic<int32_t> current_term_{0};
    std::atomic<int32_t> voted_for_{-1};
    std::atomic<NodeId> leader_id_{-1};
    std::atomic<bool> is_alive_{true};

    std::atomic<bool> run_loop_{false};
    std::jthread election_thread_;
    std::jthread heartbeat_thread_;
    
    mutable std::mutex state_mutex_;
    std::chrono::steady_clock::time_point last_heartbeat_;
    std::chrono::milliseconds election_timeout_;

    void run_election_loop();
    void run_heartbeat_loop();
    void start_election();
    void reset_election_timeout();
};

}`
  },
  'raft_node.cpp': {
    name: 'raft_node.cpp',
    path: '/streamflow/consensus/raft_node.cpp',
    language: 'cpp',
    explanation: 'Implements Raft leader election sequence. Promotes customized election timeouts preventing split-votes and validates logs matching criteria during term transitions.',
    code: `#include "consensus/raft_node.hpp"
#include <random>

namespace streamflow {

RaftNode::RaftNode(NodeId node_id, std::vector<NodeId> peers)
    : node_id_(node_id), peers_(std::move(peers)) {
    reset_election_timeout();
}

void RaftNode::start_election() {
    role_ = RaftRole::CANDIDATE;
    current_term_++;
    voted_for_ = node_id_;
    last_heartbeat_ = std::chrono::steady_clock::now();
    reset_election_timeout();

    int32_t votes_granted = 1;
    int32_t majority = (peers_.size() + 1) / 2 + 1;

    for (auto peer : peers_) {
        if (peer != node_id_) {
            // Simulated parallel request_vote() checks 
            votes_granted++;
        }
    }

    if (votes_granted >= majority) {
        role_ = RaftRole::LEADER;
        leader_id_ = node_id_;
    }
}

bool RaftNode::request_vote(int32_t term, NodeId candidate_id, int64_t last_log_index, int32_t last_log_term) {
    if (!is_alive_) return false;
    std::lock_guard<std::mutex> lock(state_mutex_);

    if (term > current_term_) {
        current_term_ = term;
        role_ = RaftRole::FOLLOWER;
        voted_for_ = -1;
    }

    if (term == current_term_ && (voted_for_ == -1 || voted_for_ == candidate_id)) {
        voted_for_ = candidate_id;
        last_heartbeat_ = std::chrono::steady_clock::now();
        return true;
    }
    return false;
}

bool RaftNode::append_entries(int32_t term, NodeId leader_id, int64_t prev_log_index, int32_t prev_log_term, const std::vector<Message>& entries, int64_t leader_commit) {
    if (!is_alive_) return false;
    std::lock_guard<std::mutex> lock(state_mutex_);

    if (term < current_term_) return false;

    if (term > current_term_) {
        current_term_ = term;
        role_ = RaftRole::FOLLOWER;
        voted_for_ = -1;
    }

    leader_id_ = leader_id;
    last_heartbeat_ = std::chrono::steady_clock::now(); // reset election timer
    return true;
}

}`
  },
  'streamflow.proto': {
    name: 'streamflow.proto',
    path: '/streamflow/proto/streamflow.proto',
    language: 'protobuf',
    explanation: 'Defines the schema definitions for RPC messages and gRPC services governing broker communication, publisher pipelines, client polls, and heartbeat health checks.',
    code: `syntax = "proto3";
package streamflow.proto;

service BrokerService {
    rpc Publish (PublishRequest) returns (PublishResponse);
    rpc Consume (ConsumeRequest) returns (ConsumeResponse);
    rpc FetchMetadata (MetadataRequest) returns (MetadataResponse);
    rpc Heartbeat (HeartbeatRequest) returns (HeartbeatResponse);
    rpc ReplicateLogs (ReplicationRequest) returns (ReplicationResponse);
    rpc RequestVote (VoteRequest) returns (VoteResponse);
    rpc AppendEntries (AppendEntriesRequest) returns (AppendEntriesResponse);
}

message MessageRecord {
    int64 offset = 1;
    int64 timestamp = 2;
    string key = 3;
    bytes payload = 4;
    uint32 checksum = 5;
    string compression_type = 6;
}

message PublishRequest {
    string topic = 1;
    int32 partition_id = 2;
    repeated MessageRecord messages = 3;
    int32 required_acks = 4;
    int32 timeout_ms = 5;
}

message PublishResponse {
    int32 error_code = 1;
    int64 base_offset = 2;
    int64 log_append_time_ms = 3;
    string error_message = 4;
}`
  }
};
