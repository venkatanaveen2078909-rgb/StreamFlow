#pragma once

#include "common/types.hpp"
#include "storage/segment_log.hpp"
#include "consensus/raft_node.hpp"
#include <unordered_map>
#include <shared_mutex>
#include <memory>

namespace streamflow {

struct ReplicaState {
    NodeId node_id;
    Offset last_replicated_offset;
    std::chrono::steady_clock::time_point last_caught_up_time;
};

class PartitionReplicaSet {
public:
    PartitionReplicaSet(PartitionId pid, NodeId leader, std::vector<NodeId> replicas);
    ~PartitionReplicaSet() = default;

    NodeId leader_id() const { return leader_id_; }
    void set_leader_id(NodeId lid) { leader_id_ = lid; }

    bool is_in_sync(NodeId node) const;
    void update_follower_offset(NodeId node, Offset offset);
    std::vector<NodeId> fetch_isr_nodes(Offset leader_offset, std::chrono::milliseconds max_lag_time);

private:
    PartitionId partition_id_;
    NodeId leader_id_;
    std::vector<NodeId> configured_replicas_;
    std::unordered_map<NodeId, ReplicaState> follower_trackers_;
};

class Broker {
public:
    Broker(NodeId node_id, std::vector<NodeId> peers, std::filesystem::path data_directory);
    ~Broker();

    void startup();
    void shutdown();

    // Front Facing gRPC API proxies
    ResponseCode publish_records(const std::string& topic, PartitionId pid, std::vector<Message>& records, int32_t acks);
    std::vector<Message> fetch_records(const std::string& topic, PartitionId pid, Offset start_offset, size_t max_bytes);

    // Replication pipeline trigger
    void replicate_as_follower(const std::string& topic, PartitionId pid, NodeId leader, Offset offset, std::vector<Message>& messages);

    // Consensus states
    bool is_leader_for(const std::string& topic, PartitionId pid);
    NodeId broker_id() const { return broker_id_; }
    bool is_active() const { return is_active_; }
    RaftNode* raft_consensus() { return raft_node_.get(); }

private:
    NodeId broker_id_;
    std::filesystem::path root_dir_;
    bool is_active_{false};

    std::unique_ptr<RaftNode> raft_node_;
    
    // Multi Partition Logs index
    mutable std::shared_mutex index_mutex_;
    // topic -> partition_id -> Unique Engine instance (thread-safe storage engines)
    std::unordered_map<std::string, std::unordered_map<PartitionId, std::unique_ptr<PartitionLogEngine>>> active_partitions_;
    std::unordered_map<std::string, std::unordered_map<PartitionId, std::unique_ptr<PartitionReplicaSet>>> replication_records_;

    PartitionLogEngine* obtain_or_create_engine(const std::string& topic, PartitionId pid);
};

} // namespace streamflow
