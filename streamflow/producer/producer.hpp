#pragma once

#include "common/types.hpp"
#include <string>
#include <vector>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <atomic>
#include <future>

namespace streamflow {

struct PublishResult {
    ResponseCode status;
    Offset offset;
    Timestamp timestamp;
};

class Producer {
public:
    Producer(std::string broker_endpoint, int32_t acks = 1, CompressionType compression = CompressionType::NONE);
    ~Producer();

    // Prevent copies, support move
    Producer(const Producer&) = delete;
    Producer& operator=(const Producer&) = delete;

    // Asynchronous send that returns a future
    std::future<PublishResult> send(const std::string& topic, std::string key, std::vector<uint8_t> payload);

    // Synchronous send
    PublishResult send_sync(const std::string& topic, const std::string& key, const std::vector<uint8_t>& payload);

    void flush();
    void close();

private:
    std::string broker_endpoint_;
    int32_t acks_;
    CompressionType compression_;
    
    std::atomic<bool> is_running_{true};
    std::jthread batch_thread_;
    std::mutex queue_mutex_;
    std::condition_variable cv_;

    struct ProduceTask {
        std::string topic;
        std::string key;
        std::vector<uint8_t> payload;
        std::promise<PublishResult> promise;
    };

    std::queue<std::shared_ptr<ProduceTask>> task_queue_;

    void run_batch_pipeline();
    PublishResult send_rpc_batch(const std::string& topic, std::vector<std::shared_ptr<ProduceTask>>& tasks);
};

} // namespace streamflow
