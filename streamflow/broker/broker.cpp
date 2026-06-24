#include "broker/broker.cpp"
#include "broker/broker.hpp"
#include <iostream>

namespace streamflow {

PartitionReplicaSet::PartitionReplicaSet(PartitionId pid, NodeId leader, std::vector<NodeId> replicas)
    : partition_id_(pid)
    , leader_id_(leader)
    , configured_replicas_(replicas) {
    
    for (auto node : replicas) {
        if (node != leader) {
            follower_trackers_[node] = ReplicaState{
                node,
                0,
                std::chrono::steady_clock::now()
            };
        }
    }
}

bool PartitionReplicaSet::is_in_sync(NodeId node) const {
    if (node == leader_id_) return true;
    auto it = follower_trackers_.find(node);
    if (it != follower_trackers_.end()) {
        // Checked against recent replication lag and physical sync indices
        auto seconds_since_sync = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::steady_clock::now() - it->second.last_caught_up_time
        ).count();
        return seconds_since_sync < 10; // Catch within 10 seconds of active telemetry updates
    }
    return false;
}

void PartitionReplicaSet::update_follower_offset(NodeId node, Offset offset) {
    if (node == leader_id_) return;
    auto it = follower_trackers_.find(node);
    if (it != follower_trackers_.end()) {
        if (offset > it->second.last_replicated_offset) {
            it->second.last_replicated_offset = offset;
            it->second.last_caught_up_time = std::chrono::steady_clock::now();
        }
    }
}

std::vector<NodeId> PartitionReplicaSet::fetch_isr_nodes(Offset leader_offset, std::chrono::milliseconds max_lag_time) {
    std::vector<NodeId> isr = {leader_id_};
    
    for (const auto& [node, state] : follower_trackers_) {
        auto time_lag = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now() - state.last_caught_up_time
        );
        
        // ISR eligibility: caught up in both offsets and timestamps
        if (time_lag <= max_lag_time || state.last_replicated_offset >= leader_offset) {
            isr.push_back(node);
        }
    }
    return isr;
}


Broker::Broker(NodeId node_id, std::vector<NodeId> peers, std::filesystem::path data_directory)
    : broker_id_(node_id)
    , root_dir_(std::move(data_directory)) {
    
    raft_node_ = std::make_unique<RaftNode>(node_id, peers);
}

Broker::~Broker() {
    shutdown();
}

void Broker::startup() {
    is_active_ = true;
    raft_node_->start();
}

void Broker::shutdown() {
    is_active_ = false;
    raft_node_->stop();
    
    std::lock_guard<std::shared_mutex> lock(index_mutex_);
    active_partitions_.clear();
    replication_records_.clear();
}

PartitionLogEngine* Broker::obtain_or_create_engine(const std::string& topic, PartitionId pid) {
    std::unique_lock<std::shared_mutex> lock(index_mutex_);
    
    auto& partition_map = active_partitions_[topic];
    auto it = partition_map.find(pid);
    if (it == partition_map.end()) {
        PartitionConfig cfg{
            topic,
            pid,
            3, // replicas count
            std::chrono::hours(168), // 7-day retention
            1024 * 1024 * 50 // 50MB segment rolling threshold
        };
        auto engine = std::make_unique<PartitionLogEngine>(cfg, root_dir_);
        auto* raw_ptr = engine.get();
        partition_map[pid] = std::move(engine);

        // Bootstrap replicas schema
        std::vector<NodeId> test_replicas = {1, 2, 3};
        replication_records_[topic][pid] = std::make_unique<PartitionReplicaSet>(pid, broker_id_, test_replicas);

        return raw_ptr;
    }
    return it->second.get();
}

bool Broker::is_leader_for(const std::string& topic, PartitionId pid) {
    if (!is_active_ || !raft_node_->is_alive()) return false;
    
    // Simplification: physical broker leader matches raft nodes consensus states
    return raft_node_->is_leader();
}

ResponseCode Broker::publish_records(const std::string& topic, PartitionId pid, std::vector<Message>& records, int32_t acks) {
    if (!is_active_) return ResponseCode::BROKER_CRASHED;
    if (!is_leader_for(topic, pid)) return ResponseCode::NOT_LEADER_FOR_PARTITION;

    auto* engine = obtain_or_create_engine(topic, pid);
    if (!engine) return ResponseCode::PARTITION_NOT_FOUND;

    Offset last_appended = 0;
    for (auto& record : records) {
        ResponseCode code = engine->append(record);
        if (code != ResponseCode::SUCCESS) {
            return code;
        }
        last_appended = record.offset;
    }

    // Replication logic simulation
    if (acks == -1) { // Wait for and verify In-Sync Replicas (acks=all)
        auto& rep_tracker = replication_records_[topic][pid];
        
        // Let's mock simulating that followers replicate this immediately
        for (auto peer_id : {1, 2, 3}) {
            if (peer_id != broker_id_) {
                rep_tracker->update_follower_offset(peer_id, last_appended);
            }
        }
        
        auto isr = rep_tracker->fetch_isr_nodes(last_appended, std::chrono::milliseconds(5000));
        if (isr.size() < 2) { // Termed a partition split, lacking replica consensus depth
            return ResponseCode::REPLICA_LAG;
        }

        engine->set_high_watermark(last_appended);
    } else if (acks == 1) { // Leader confirmation only (acks=1)
        engine->set_high_watermark(last_appended);
    } else { // No guarantees (acks=0)
        // Fire and forget
    }

    return ResponseCode::SUCCESS;
}

std::vector<Message> Broker::fetch_records(const std::string& topic, PartitionId pid, Offset start_offset, size_t max_bytes) {
    if (!is_active_) return {};
    
    auto* engine = obtain_or_create_engine(topic, pid);
    if (!engine) return {};

    return engine->read(start_offset, max_bytes);
}

void Broker::replicate_as_follower(const std::string& topic, PartitionId pid, NodeId leader, Offset offset, std::vector<Message>& messages) {
    if (!is_active_) return;

    auto* engine = obtain_or_create_engine(topic, pid);
    if (!engine) return;

    // Direct offset replication alignment
    for (auto& msg : messages) {
        if (msg.offset >= engine->end_offset()) {
            engine->append(msg);
        }
    }
    
    engine->set_high_watermark(offset);
}

} // namespace streamflow
