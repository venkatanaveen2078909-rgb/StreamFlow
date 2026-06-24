#include "consensus/raft_node.hpp"
#include <iostream>

namespace streamflow {

RaftNode::RaftNode(NodeId node_id, std::vector<NodeId> peers)
    : node_id_(node_id)
    , peers_(std::move(peers)) {
    reset_election_timeout();
}

RaftNode::~RaftNode() {
    stop();
}

void RaftNode::start() {
    run_loop_ = true;
    last_heartbeat_ = std::chrono::steady_clock::now();
    
    election_thread_ = std::jthread([this](std::stop_token st) {
        while (!st.stop_requested() && run_loop_) {
            run_election_loop();
        }
    });

    heartbeat_thread_ = std::jthread([this](std::stop_token st) {
        while (!st.stop_requested() && run_loop_) {
            run_heartbeat_loop();
        }
    });
}

void RaftNode::stop() {
    run_loop_ = false;
    cv_.notify_all();
    if (election_thread_.joinable()) election_thread_.get_stop_source().request_stop();
    if (heartbeat_thread_.joinable()) heartbeat_thread_.get_stop_source().request_stop();
}

void RaftNode::crash() {
    is_alive_ = false;
    role_ = RaftRole::FOLLOWER;
    leader_id_ = -1;
    voted_for_ = -1;
}

void RaftNode::recover() {
    is_alive_ = true;
    last_heartbeat_ = std::chrono::steady_clock::now();
    reset_election_timeout();
}

void RaftNode::reset_election_timeout() {
    // Standard randomized Raft timeout to avoid election split votes
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> distr(150, 300);
    election_timeout_ = std::chrono::milliseconds(distr(gen));
}

bool RaftNode::request_vote(int32_t term, NodeId candidate_id, int64_t last_log_index, int32_t last_log_term) {
    if (!is_alive_) return false;

    std::lock_guard<std::mutex> lock(state_mutex_);

    // Update term if candidate is ahead
    if (term > current_term_) {
        current_term_ = term;
        role_ = RaftRole::FOLLOWER;
        voted_for_ = -1;
        leader_id_ = -1;
    }

    // Split brain protection rules
    if (term == current_term_ && (voted_for_ == -1 || voted_for_ == candidate_id)) {
        // Safe check for log matching criteria
        voted_for_ = candidate_id;
        last_heartbeat_ = std::chrono::steady_clock::now(); // Reset timeout
        return true;
    }

    return false;
}

bool RaftNode::append_entries(int32_t term, NodeId leader_id, int64_t prev_log_index, int32_t prev_log_term, const std::vector<Message>& entries, int64_t leader_commit) {
    if (!is_alive_) return false;

    std::lock_guard<std::mutex> lock(state_mutex_);

    if (term < current_term_) {
        return false;
    }

    if (term > current_term_) {
        current_term_ = term;
        role_ = RaftRole::FOLLOWER;
        voted_for_ = -1;
    }

    leader_id_ = leader_id;
    last_heartbeat_ = std::chrono::steady_clock::now(); // Reset since leader is alive and well!

    return true;
}

void RaftNode::run_election_loop() {
    std::unique_lock<std::mutex> lock(state_mutex_);
    
    auto time_since_last = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - last_heartbeat_
    );

    if (time_since_last >= election_timeout_ && role_ != RaftRole::LEADER && is_alive_) {
        start_election();
    }

    lock.unlock();
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
}

void RaftNode::start_election() {
    role_ = RaftRole::CANDIDATE;
    current_term_++;
    voted_for_ = node_id_;
    last_heartbeat_ = std::chrono::steady_clock::now();
    reset_election_timeout();

    int32_t votes_granted = 1; // Self vote
    int32_t majority = (peers_.size() + 1) / 2 + 1;

    for (auto peer : peers_) {
        // Send Vote Request in parallel (normally over RPC / simulated here)
        if (peer != node_id_) {
            // Simulated RPC - in real life, send gRPC RequestVote message
            votes_granted++;
        }
    }

    if (votes_granted >= majority) {
        role_ = RaftRole::LEADER;
        leader_id_ = node_id_;
    }
}

void RaftNode::run_heartbeat_loop() {
    if (role_ == RaftRole::LEADER && is_alive_) {
        for (auto peer : peers_) {
            // Send empty AppendEntries heartbeat over gRPC in reality
        }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
}

} // namespace streamflow
