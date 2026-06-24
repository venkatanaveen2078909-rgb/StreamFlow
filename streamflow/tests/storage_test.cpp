#include <gtest/gtest.h>
#include "storage/segment_log.hpp"
#include <filesystem>

namespace streamflow {
namespace testing {

class StorageTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Safe sandbox-friendly temporary directory
        test_dir_ = std::filesystem::temp_directory_path() / "streamflow_test_logs";
        std::filesystem::remove_all(test_dir_);
    }

    void TearDown() override {
        std::filesystem::remove_all(test_dir_);
    }

    std::filesystem::path test_dir_;
};

// Test CRC32 Checksum verification on records
TEST_F(StorageTest, MessageChecksumIntegrity) {
    Message msg(0, 1000, "sensor_key_0", std::vector<uint8_t>{0x1, 0x2, 0x3, 0x4});
    EXPECT_TRUE(msg.verify());

    // Corrupt physical payload byte, violating CRC assertions
    msg.payload[0] = 0xFF;
    EXPECT_FALSE(msg.verify());
}

// Test Segment Append and Read Sequence
TEST_F(StorageTest, SegmentReadWriteLifecycle) {
    LogSegment seg(test_dir_, 10, 1024); // base offset 10, limit 1KB

    Message msg(0, 1000, "user_signed_up", std::vector<uint8_t>{0x5, 0x6, 0x7});
    ResponseCode code = seg.append(msg);
    
    EXPECT_EQ(code, ResponseCode::SUCCESS);
    EXPECT_EQ(seg.next_offset(), 11);
    EXPECT_EQ(seg.base_offset(), 10);

    // Read message back using binary search index mapping
    auto read_records = seg.read(10, 500);
    ASSERT_EQ(read_records.size(), 1);
    EXPECT_EQ(read_records[0].key, "user_signed_up");
    EXPECT_EQ(read_records[0].offset, 10);
    EXPECT_TRUE(read_records[0].verify());
}

// Test Partition Log Segment Rolling Boundaries
TEST_F(StorageTest, PartitionLogRollingEngine) {
    PartitionConfig cfg{
        "actions",
        1,
        1,
        std::chrono::hours(1),
        120 // very small size to force active segment rolling
    };

    PartitionLogEngine engine(cfg, test_dir_);

    // Push multiple messages that accumulate size beyond segment boundaries
    for (int i = 0; i < 5; ++i) {
        Message msg(0, 1000, "key_" + std::to_string(i), std::vector<uint8_t>(20, 0xAA));
        ResponseCode code = engine.append(msg);
        EXPECT_EQ(code, ResponseCode::SUCCESS);
    }

    EXPECT_EQ(engine.end_offset(), 5);

    // Read full sequence across segment rolling thresholds
    auto logs = engine.read(0, 10000);
    EXPECT_EQ(logs.size(), 5);
    EXPECT_EQ(logs[0].key, "key_0");
    EXPECT_EQ(logs[4].key, "key_4");
}

} // namespace testing
} // namespace streamflow
