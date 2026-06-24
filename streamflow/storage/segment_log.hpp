#pragma once

#include "common/types.hpp"
#include <mutex>
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

    // Prevent copies, allow move semantics for file handles (RAII design)
    LogSegment(const LogSegment&) = delete;
    LogSegment& operator=(const LogSegment&) = delete;
    LogSegment(LogSegment&&) noexcept;
    LogSegment& operator=(LogSegment&&) noexcept;

    // Core read-write operations
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

    // Simulating memory-mapped I/O structure or high perf binary descriptor
    std::filesystem::path log_path_;
    std::filesystem::path index_path_;
    std::fstream log_file_;
    std::fstream index_file_;

    std::vector<IndexEntry> index_; // Physical cash for the index file on disk

    void load_segment_meta();
    Offset binary_search_index(Offset target_offset) const;
};

// Thread-safe partitioned Active Segment Storage Coordinator
class PartitionLogEngine {
public:
    PartitionLogEngine(PartitionConfig config, std::filesystem::path root_data_dir);
    ~PartitionLogEngine() = default;

    // Thread Safety
    PartitionLogEngine(const PartitionLogEngine&) = delete;
    PartitionLogEngine& operator=(const PartitionLogEngine&) = delete;

    ResponseCode append(Message& msg);
    std::vector<Message> read(Offset start_offset, size_t max_bytes);
    
    Offset high_watermark() const { return high_watermark_; }
    void set_high_watermark(Offset offset) { high_watermark_ = offset; }
    Offset end_offset() const { return end_offset_; }

    void trigger_compaction();
    void load_existing_segments();

private:
    PartitionConfig config_;
    std::filesystem::path partition_dir_;
    Offset end_offset_{0};
    Offset high_watermark_{0};

    // Shared Mutex to allow Concurrent Readers and Sequential Active Writer
    mutable std::shared_mutex log_mutex_;
    std::vector<std::unique_ptr<LogSegment>> segments_;

    void roll_segment();
};

} // namespace streamflow
