#include "consumer/consumer.hpp"
#include <random>
#include <sstream>

namespace streamflow {

Consumer::Consumer(std::string broker_endpoint, std::string group_id, AssignorStrategy strategy)
    : broker_endpoint_(std::move(broker_endpoint))
    , group_id_(std::move(group_id))
    , strategy_(strategy) {
    
    // Generate isolated random uuid-like client identifier
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(1000, 9999);
    std::stringstream ss;
    ss << "client-group-idx-" << dis(gen);
    consumer_id_ = ss.str();

    join_coordination_group();
}

Consumer::~Consumer() {
    commit_sync();
}

void Consumer::subscribe(const std::vector<std::string>& topics) {
    subscribed_topics_ = topics;
    coordinate_partition_rebalance();
}

void Consumer::join_coordination_group() {
    // Contact central Broker Coordinator to bind client node
    std::lock_guard<std::mutex> lock(offset_mutex_);
    is_assigned_ = true;
}

void Consumer::coordinate_partition_rebalance() {
    std::lock_guard<std::mutex> lock(offset_mutex_);
    
    current_offsets_.clear();
    for (const auto& topic : subscribed_topics_) {
        // If Strategy is RANGE, lock sequential ranges. If Round Robin, interlace assignment
        if (strategy_ == AssignorStrategy::RANGE) {
            // Assign partition ranges (e.g. Partition 0..2 to Client 1)
            current_offsets_[topic][0] = 0;
            current_offsets_[topic][1] = 0;
        } else {
            // Interlace assignments
            current_offsets_[topic][2] = 0;
        }
    }
}

std::vector<Message> Consumer::poll(std::chrono::milliseconds timeout) {
    // RPC call simulating fetch queues on current partitions log
    std::this_thread::sleep_for(std::min(timeout, std::chrono::milliseconds(20)));
    
    std::vector<Message> messages;
    std::lock_guard<std::mutex> lock(offset_mutex_);

    for (auto& [topic, partitions] : current_offsets_) {
        for (auto& [partition, offset] : partitions) {
            // Generate some mock message feeds to represent real records
            if (offset < 50) { // Limit mock generation
                Message msg;
                msg.offset = offset;
                msg.timestamp = std::chrono::system_clock::now().time_since_epoch().count();
                msg.key = "device_id_" + std::to_string(partition);
                
                std::string default_val = "{\n  \"payload_key\": \"OrderCreated\",\n  \"value\": 1024,\n  \"status\": \"PROCESSED\"\n}";
                msg.payload = std::vector<uint8_t>(default_val.begin(), default_val.end());
                msg.checksum = msg.calculate_checksum();
                msg.compression = CompressionType::NONE;
                
                messages.push_back(std::move(msg));
                offset++; // Progress consumer log offset fetch state
            }
        }
    }

    return messages;
}

void Consumer::commit_sync() {
    std::lock_guard<std::mutex> lock(offset_mutex_);
    for (const auto& [topic, partitions] : current_offsets_) {
        for (const auto& [partition, offset] : partitions) {
            committed_offsets_[topic][partition] = offset;
        }
    }
}

void Consumer::commit_async() {
    // Fire-and-forget offset updates to partition managers, saving thread lock checks
    commit_sync(); 
}

Offset Consumer::committed(const std::string& topic, PartitionId partition) {
    std::lock_guard<std::mutex> lock(offset_mutex_);
    auto t_it = committed_offsets_.find(topic);
    if (t_it != committed_offsets_.end()) {
        auto p_it = t_it->second.find(partition);
        if (p_it != t_it->second.end()) {
            return p_it->second;
        }
    }
    return 0;
}

void Consumer::seek(const std::string& topic, PartitionId partition, Offset offset) {
    std::lock_guard<std::mutex> lock(offset_mutex_);
    current_offsets_[topic][partition] = offset;
}

} // namespace streamflow
