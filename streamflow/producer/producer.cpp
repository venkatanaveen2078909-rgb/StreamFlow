#include "producer/producer.hpp"
#include <chrono>
#include <cmath>
#include <iostream>

namespace streamflow {

Producer::Producer(std::string broker_endpoint, int32_t acks, CompressionType compression)
    : broker_endpoint_(std::move(broker_endpoint))
    , acks_(acks)
    , compression_(compression) {
    
    batch_thread_ = std::jthread([this](std::stop_token st) {
        while (!st.stop_requested() && is_running_) {
            run_batch_pipeline();
        }
    });
}

Producer::~Producer() {
    close();
}

std::future<PublishResult> Producer::send(const std::string& topic, std::string key, std::vector<uint8_t> payload) {
    auto task = std::make_shared<ProduceTask>({
        topic,
        std::move(key),
        std::move(payload),
        std::promise<PublishResult>()
    });

    auto fut = task->promise.get_future();

    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        task_queue_.push(task);
    }
    cv_.notify_one();

    return fut;
}

PublishResult Producer::send_sync(const std::string& topic, const std::string& key, const std::vector<uint8_t>& payload) {
    auto fut = send(topic, key, payload);
    return fut.get();
}

void Producer::flush() {
    std::promise<void> p;
    auto f = p.get_future();

    // Insert dummy flushing token
    auto task = std::make_shared<ProduceTask>({
        "", "", {}, std::promise<PublishResult>()
    });

    {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        task_queue_.push(task);
    }
    cv_.notify_one();

    // Spin or block until the queue is drained
    while (true) {
        std::lock_guard<std::mutex> lock(queue_mutex_);
        if (task_queue_.empty()) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
}

void Producer::close() {
    is_running_ = false;
    cv_.notify_all();
    if (batch_thread_.joinable()) {
        batch_thread_.get_stop_source().request_stop();
    }
}

void Producer::run_batch_pipeline() {
    std::unique_lock<std::mutex> lock(queue_mutex_);
    cv_.wait_for(lock, std::chrono::milliseconds(10), [this]() {
        return !task_queue_.empty() || !is_running_;
    });

    if (task_queue_.empty() || !is_running_) {
        return;
    }

    // Pull batch from thread-safe lock-free queue simulation
    std::vector<std::shared_ptr<ProduceTask>> batch;
    size_t batch_size = 0;
    const size_t max_batch_size = 100; // Max batch batch count

    while (!task_queue_.empty() && batch_size < max_batch_size) {
        auto task = task_queue_.front();
        task_queue_.pop();
        if (task->topic.empty()) {
            // Flush token
            continue;
        }
        batch.push_back(task);
        batch_size++;
    }

    lock.unlock();

    if (batch.empty()) return;

    // Group items by topic and upload batch over RPC
    std::string current_topic = batch.front()->topic;
    auto result = send_rpc_batch(current_topic, batch);

    for (auto& task : batch) {
        task->promise.set_value(result);
    }
}

PublishResult Producer::send_rpc_batch(const std::string& topic, std::vector<std::shared_ptr<ProduceTask>>& tasks) {
    // Implement exponential backoff for retries
    int attempt = 0;
    const int max_retries = 3;
    ResponseCode last_status = ResponseCode::SUCCESS;
    Offset last_assigned_offset = 100;

    while (attempt < max_retries) {
        try {
            // Simulated network RPC latency
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            
            // acks=all, acks=1 check simulation
            if (acks_ == -1 && attempt == 0) {
                // Simulate split-second lag for follower confirmation
                std::this_thread::sleep_for(std::chrono::milliseconds(5));
            }

            return PublishResult{ResponseCode::SUCCESS, last_assigned_offset + (Offset)tasks.size(), (Timestamp)std::chrono::system_clock::now().time_since_epoch().count()};
        } catch (...) {
            last_status = ResponseCode::TIMEOUT;
            attempt++;
            // Exponential backoff
            double wait_time = std::pow(2.0, attempt) * 10.0;
            std::this_thread::sleep_for(std::chrono::milliseconds(static_cast<int>(wait_time)));
        }
    }

    return PublishResult{last_status, -1, 0};
}

} // namespace streamflow
