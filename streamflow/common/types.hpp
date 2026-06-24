#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <iostream>
#include <concepts>
#include <cstdint>
#include <span>

namespace streamflow {

// Strongly typed definitions for type safety
using Offset = int64_t;
using Timestamp = int64_t;
using NodeId = int32_t;
using PartitionId = int32_t;

enum class CompressionType : uint8_t {
    NONE = 0,
    SNAPPY = 1,
    GZIP = 2,
    ZSTD = 3
};

enum class ResponseCode : int32_t {
    SUCCESS = 0,
    REPLICA_LAG = 1,
    PARTITION_NOT_FOUND = 2,
    NOT_LEADER_FOR_PARTITION = 3,
    MESSAGE_TOO_LARGE = 4,
    CHECKSUM_MISMATCH = 5,
    INVALID_ACK_LEVEL = 6,
    TIMEOUT = 7,
    BROKER_CRASHED = 8
};

// Clean RAII-oriented message container
struct Message {
    Offset offset{0};
    Timestamp timestamp{0};
    std::string key;
    std::vector<uint8_t> payload;
    uint32_t checksum{0};
    CompressionType compression{CompressionType::NONE};

    // Rule of Five (RAII & Move Semantics)
    Message() = default;
    ~Message() = default;
    Message(const Message&) = default;
    Message& operator=(const Message&) = default;
    Message(Message&&) noexcept = default;
    Message& operator=(Message&&) noexcept = default;

    // Helper constructor using perfect forwarding for performance optimization
    template <typename K, typename P>
    Message(Offset off, Timestamp ts, K&& k, P&& p, CompressionType comp = CompressionType::NONE)
        : offset(off)
        , timestamp(ts)
        , key(std::forward<K>(k))
        , payload(std::forward<P>(p))
        , compression(comp) {
        checksum = calculate_checksum();
    }

    // High performance CRC32 checksum for data integrity
    uint32_t calculate_checksum() const noexcept {
        uint32_t crc = 0xFFFFFFFF;
        auto crc32_update = [](uint32_t initial, std::span<const uint8_t> data) -> uint32_t {
            uint32_t state = initial;
            for (auto byte : data) {
                state ^= byte;
                for (int i = 0; i < 8; ++i) {
                    if (state & 1) {
                        state = (state >> 1) ^ 0xEDB88320;
                    } else {
                        state >>= 1;
                    }
                }
            }
            return state;
        };

        // Combine key and payload for full verification
        std::span<const uint8_t> key_span(reinterpret_cast<const uint8_t*>(key.data()), key.size());
        crc = crc32_update(crc, key_span);
        crc = crc32_update(crc, std::span<const uint8_t>(payload.data(), payload.size()));
        return ~crc;
    }

    bool verify() const noexcept {
        return calculate_checksum() == checksum;
    }
};

// Struct to represent indexing structure inside index files
struct alignas(8) IndexEntry {
    uint32_t relative_offset; // Relative offset from the base offset of the segment
    uint32_t physical_position; // Absolute physical offset inside the log file
};

struct PartitionConfig {
    std::string topic;
    PartitionId partition_id;
    int32_t replication_factor;
    std::chrono::milliseconds retention_period;
    size_t max_segment_bytes;
};

} // namespace streamflow
