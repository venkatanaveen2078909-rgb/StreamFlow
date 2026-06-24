#pragma once

#include "common/types.hpp"
#include <vector>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <random>
#include <chrono>

namespace streamflow {

enum class RaftRole : uint8_t {
    FOLLOWER = 0,
    CANDIDATE = 1,
    LEADER = 2
};

struct RaftState {
    int32_t current_term{0};
    int32_t voted_for{-1};
    int64_t commit_index{0};
    int64_t last_applied{0};
};

class RaftNode {
public:
    RaftNode(NodeId node_id, std::vector<NodeId> peers);
    ~RaftNode();

    // Prevent copy
    RaftNode(const RaftNode&) = delete;
    RaftNode& operator=(const RaftNode&) = delete;

    void start();
    void stop();

    // Consensus API
    bool request_vote(int32_t term, NodeId candidate_id, int64_t last_log_index, int32_t last_log_term);
    bool append_entries(int32_t term, NodeId leader_id, int64_t prev_log_index, int32_t prev_log_term, const std::vector<Message>& entries, int64_t leader_commit);

    // Get current state
    RaftRole role() const { return role_; }
    int32_t current_term() const { return current_term_; }
    NodeId leader_id() const { return leader_id_; }
    bool is_leader() const { return role_ == RaftRole::LEADER; }
    NodeId node_id() const { return node_id_; }

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

    // Timing and threads
    std::atomic<bool> run_loop_{false};
    std::jthread election_thread_;
    std::jthread heartbeat_thread_;
    
    mutable std::mutex state_mutex_;
    std::condition_variable cv_;
    std::chrono::steady_clock::time_point last_heartbeat_;
    std::chrono::milliseconds election_timeout_;

    void run_election_loop();
    void run_heartbeat_loop();
    void start_election();
    void reset_election_timeout();
};

} // namespace streamflow
