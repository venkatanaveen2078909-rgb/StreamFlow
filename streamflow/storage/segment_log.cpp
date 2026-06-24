#include "storage/segment_log.hpp"
#include <algorithm>
#include <sstream>
#include <iomanip>

namespace streamflow {

LogSegment::LogSegment(const std::filesystem::path& dir, Offset base_offset, size_t max_bytes)
    : dir_(dir)
    , base_offset_(base_offset)
    , next_offset_(base_offset)
    , max_bytes_(max_bytes)
    , size_bytes_(0) {
    
    std::filesystem::create_directories(dir_);
    
    // Create zero-padded file names for sequential sorting like Kafka
    std::stringstream ss;
    ss << std::setw(20) << std::setfill('0') << base_offset;
    std::string base_name = ss.str();

    log_path_ = dir_ / (base_name + ".log");
    index_path_ = dir_ / (base_name + ".index");

    log_file_.open(log_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);
    index_file_.open(index_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);

    load_segment_meta();
}

LogSegment::~LogSegment() {
    flush();
    if (log_file_.is_open()) log_file_.close();
    if (index_file_.is_open()) index_file_.close();
}

LogSegment::LogSegment(LogSegment&& other) noexcept
    : dir_(std::move(other.dir_))
    , base_offset_(other.base_offset_)
    , next_offset_(other.next_offset_)
    , max_bytes_(other.max_bytes_)
    , size_bytes_(other.size_bytes_)
    , log_path_(std::move(other.log_path_))
    , index_path_(std::move(other.index_path_))
    , log_file_(std::move(other.log_file_))
    , index_file_(std::move(other.index_file_))
    , index_(std::move(other.index_)) {
    other.base_offset_ = 0;
}

LogSegment& LogSegment::operator=(LogSegment&& other) noexcept {
    if (this != &other) {
        flush();
        if (log_file_.is_open()) log_file_.close();
        if (index_file_.is_open()) index_file_.close();

        dir_ = std::move(other.dir_);
        base_offset_ = other.base_offset_;
        next_offset_ = other.next_offset_;
        max_bytes_ = other.max_bytes_;
        size_bytes_ = other.size_bytes_;
        log_path_ = std::move(other.log_path_);
        index_path_ = std::move(other.index_path_);
        log_file_ = std::move(other.log_file_);
        index_file_ = std::move(other.index_file_);
        index_ = std::move(other.index_);

        other.base_offset_ = 0;
    }
    return *this;
}

void LogSegment::load_segment_meta() {
    log_file_.seekg(0, std::ios::end);
    size_bytes_ = log_file_.tellg();

    index_file_.seekg(0, std::ios::end);
    size_t index_size = index_file_.tellg();
    index_file_.seekg(0, std::ios::beg);

    if (index_size > 0 && index_size % sizeof(IndexEntry) == 0) {
        size_t count = index_size / sizeof(IndexEntry);
        index_.resize(count);
        index_file_.read(reinterpret_cast<char*>(index_.data()), index_size);
        next_offset_ = base_offset_ + index_.back().relative_offset + 1;
    }
}

ResponseCode LogSegment::append(Message& msg) {
    if (is_full()) {
        return ResponseCode::MESSAGE_TOO_LARGE; // Trigger rolling
    }

    log_file_.seekp(0, std::ios::end);
    size_t position = log_file_.tellp();

    // Serialize Header: Offset(8), Timestamp(8), KeyLength(4), PayloadLength(4), Checksum(4), Comp(1)
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

    // Save physical index mappings (Memory-mapped style writes)
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
    auto it = std::lower_bound(index_.begin(), index_.end(), rel_offset,
        [](const IndexEntry& entry, uint32_t target) {
            return entry.relative_offset < target;
        });

    if (it == index_.end()) {
        return index_.back().physical_position;
    }
    return it->physical_position;
}

std::vector<Message> LogSegment::read(Offset start_offset, size_t max_bytes) {
    std::vector<Message> messages;
    if (start_offset >= next_offset_ || start_offset < base_offset_) {
        return messages;
    }

    Offset physical_pos = binary_search_index(start_offset);
    if (physical_pos < 0) return messages;

    log_file_.seekg(physical_pos, std::ios::beg);
    size_t bytes_read = 0;

    while (bytes_read < max_bytes && log_file_.good() && log_file_.tellg() < static_cast<std::streamoff>(size_bytes_)) {
        Message msg;
        uint32_t key_len = 0;
        uint32_t pay_len = 0;
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

        if (msg.offset >= start_offset) {
            messages.push_back(std::move(msg));
        }

        bytes_read += (sizeof(Offset) * 2 + sizeof(uint32_t) * 3 + sizeof(uint8_t) + key_len + pay_len);
    }

    return messages;
}

void LogSegment::flush() {
    log_file_.flush();
    index_file_.flush();
}

void LogSegment::compact(const std::map<std::string, Offset>& latest_keys) {
    // Read clean records, then rewrite active non-compacted segments
    std::filesystem::path temp_log_path = log_path_.string() + ".tmp";
    std::filesystem::path temp_index_path = index_path_.string() + ".tmp";

    std::fstream temp_log(temp_log_path, std::ios::out | std::ios::binary);
    std::fstream temp_index(temp_index_path, std::ios::out | std::ios::binary);

    log_file_.seekg(0, std::ios::beg);
    std::vector<IndexEntry> new_index;

    while (log_file_.tellg() < static_cast<std::streamoff>(size_bytes_)) {
        Message msg;
        uint32_t key_len = 0;
        uint32_t pay_len = 0;
        uint8_t comp = 0;
        size_t original_pos = log_file_.tellg();

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

        auto it = latest_keys.find(msg.key);
        if (it != latest_keys.end() && it->second == msg.offset) {
            // Keep keys that match the absolute latest offset (Log Compaction)
            size_t new_pos = temp_log.tellp();
            temp_log.write(reinterpret_cast<const char*>(&msg.offset), sizeof(msg.offset));
            temp_log.write(reinterpret_cast<const char*>(&msg.timestamp), sizeof(msg.timestamp));
            temp_log.write(reinterpret_cast<const char*>(&key_len), sizeof(key_len));
            temp_log.write(reinterpret_cast<const char*>(&pay_len), sizeof(pay_len));
            temp_log.write(reinterpret_cast<const char*>(&msg.checksum), sizeof(msg.checksum));
            temp_log.write(reinterpret_cast<const char*>(&comp), sizeof(comp));
            temp_log.write(msg.key.data(), key_len);
            temp_log.write(reinterpret_cast<const char*>(msg.payload.data()), pay_len);

            IndexEntry entry{static_cast<uint32_t>(msg.offset - base_offset_), static_cast<uint32_t>(new_pos)};
            temp_index.write(reinterpret_cast<const char*>(&entry), sizeof(entry));
            new_index.push_back(entry);
        }
    }

    log_file_.close();
    index_file_.close();
    temp_log.close();
    temp_index.close();

    std::filesystem::rename(temp_log_path, log_path_);
    std::filesystem::rename(temp_index_path, index_path_);

    log_file_.open(log_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);
    index_file_.open(index_path_, std::ios::in | std::ios::out | std::ios::binary | std::ios::app);

    index_ = std::move(new_index);
    log_file_.seekg(0, std::ios::end);
    size_bytes_ = log_file_.tellg();
}


PartitionLogEngine::PartitionLogEngine(PartitionConfig config, std::filesystem::path root_data_dir)
    : config_(config) {
    
    partition_dir_ = root_data_dir / (config.topic + "-" + std::to_string(config.partition_id));
    std::filesystem::create_directories(partition_dir_);
    load_existing_segments();
}

void PartitionLogEngine::load_existing_segments() {
    std::vector<Offset> base_offsets;
    for (const auto& entry : std::filesystem::directory_iterator(partition_dir_)) {
        if (entry.path().extension() == ".log") {
            std::string filename = entry.path().stem().string();
            base_offsets.push_back(std::stoll(filename));
        }
    }

    std::sort(base_offsets.begin(), base_offsets.end());

    for (auto offset : base_offsets) {
        segments_.push_back(std::make_unique<LogSegment>(partition_dir_, offset, config_.max_segment_bytes));
    }

    if (segments_.empty()) {
        roll_segment();
    } else {
        end_offset_ = segments_.back()->next_offset();
    }
}

void PartitionLogEngine::roll_segment() {
    Offset new_base = segments_.empty() ? 0 : segments_.back()->next_offset();
    segments_.push_back(std::make_unique<LogSegment>(partition_dir_, new_base, config_.max_segment_bytes));
}

ResponseCode PartitionLogEngine::append(Message& msg) {
    std::unique_lock<std::shared_mutex> lock(log_mutex_);

    if (segments_.back()->is_full()) {
        roll_segment();
    }

    ResponseCode code = segments_.back()->append(msg);
    if (code == ResponseCode::SUCCESS) {
        end_offset_ = segments_.back()->next_offset();
    }
    return code;
}

std::vector<Message> PartitionLogEngine::read(Offset start_offset, size_t max_bytes) {
    std::shared_lock<std::shared_mutex> lock(log_mutex_);
    
    std::vector<Message> messages;
    if (segments_.empty() || start_offset >= end_offset_) {
        return messages;
    }

    // Find first segment capable of holding physical target offset
    auto it = std::upper_bound(segments_.begin(), segments_.end(), start_offset,
        [](Offset target, const std::unique_ptr<LogSegment>& seg) {
            return target < seg->next_offset();
        });

    if (it != segments_.end()) {
        messages = (*it)->read(start_offset, max_bytes);
    }
    return messages;
}

void PartitionLogEngine::trigger_compaction() {
    std::unique_lock<std::shared_mutex> lock(log_mutex_);
    if (segments_.size() <= 1) return; // Keep active segment clear of live compaction

    std::map<std::string, Offset> latest_offsets;
    // Walk over passive segments to map compaction candidates index
    for (size_t i = 0; i < segments_.size() - 1; ++i) {
        auto msgs = segments_[i]->read(segments_[i]->base_offset(), 1024 * 1024 * 100);
        for (const auto& msg : msgs) {
            latest_offsets[msg.key] = msg.offset;
        }
    }

    for (size_t i = 0; i < segments_.size() - 1; ++i) {
        segments_[i]->compact(latest_offsets);
    }
}

} // namespace streamflow
