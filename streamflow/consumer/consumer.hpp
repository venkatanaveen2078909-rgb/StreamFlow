#pragma once

#include "common/types.hpp"
#include <string>
#include <vector>
#include <unordered_map>
#include <mutex>
#include <atomic>

namespace streamflow {

enum class AssignorStrategy : uint8_t {
    ROUND_ROBIN = 0,
    RANGE = 1
};

class Consumer {
public:
    Consumer(std::string broker_endpoint, std::string group_id, AssignorStrategy strategy = AssignorStrategy::ROUND_ROBIN);
    ~Consumer();

    // Block copy actions, allow standard moves
    Consumer(const Consumer&) = delete;
    Consumer& operator=(const Consumer&) = delete;

    void subscribe(const std::vector<std::string>& topics);
    std::vector<Message> poll(std::chrono::milliseconds timeout);

    void commit_sync();
    void commit_async();

    // Group offset management
    Offset committed(const std::string& topic, PartitionId partition);
    void seek(const std::string& topic, PartitionId partition, Offset offset);

    std::string group_id() const { return group_id_; }
    std::string consumer_id() const { return consumer_id_; }

private:
    std::string broker_endpoint_;
    std::string group_id_;
    std::string consumer_id_;
    AssignorStrategy strategy_;

    std::vector<std::string> subscribed_topics_;
    std::unordered_map<std::string, std::unordered_map<PartitionId, Offset>> current_offsets_;
    std::unordered_map<std::string, std::unordered_map<PartitionId, Offset>> committed_offsets_;

    std::mutex offset_mutex_;
    std::atomic<bool> is_assigned_{false};

    void join_coordination_group();
    void coordinate_partition_rebalance();
};

} // namespace streamflow
