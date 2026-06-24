cmake_minimum_required(VERSION 3.20)
project(StreamFlow VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Add compiler-specific optimization flags
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -O3 -march=native -pthread)
endif()

# Find Boost (Asio)
find_package(Boost REQUIRED COMPONENTS system thread)

# Find gRPC & Protobuf
find_package(gRPC REQUIRED)
find_package(Protobuf REQUIRED)

# Find spdlog (High performance logging)
find_package(spdlog REQUIRED)

# Find GoogleTest for Unit Testing
enable_testing()
find_package(GTest)

# Define Include Directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${Boost_INCLUDE_DIRS}
    ${spdlog_INCLUDE_DIRS}
)

# Protobuf Protoc compilation helper
set(PROTO_FILE proto/streamflow.proto)
protobuf_generate_cpp(PROTO_SRCS PROTO_HDRS ${PROTO_FILE})

# Compile library containing core StreamFlow engine
add_library(streamflow_core STATIC
    ${PROTO_SRCS}
    ${PROTO_HDRS}
    storage/segment_log.cpp
    consensus/raft_node.cpp
    broker/broker.cpp
    replication/engine.cpp
    networking/asio_server.cpp
    producer/producer.cpp
    consumer/consumer.cpp
    coordinator/coordination_service.cpp
)

target_link_libraries(streamflow_core
    PRIVATE
        Boost::system
        Boost::thread
        gRPC::grpc++
        protobuf::libprotobuf
        spdlog::spdlog
)

# Compile Broker Daemon
add_executable(streamflow_broker broker/main.cpp)
target_link_libraries(streamflow_broker PRIVATE streamflow_core)

# Compile Client CLI tool
add_executable(streamflow cli/main.cpp)
target_link_libraries(streamflow PRIVATE streamflow_core)

# Compile Unit Tests
if(GTest_FOUND)
    add_executable(streamflow_tests tests/storage_test.cpp tests/consensus_test.cpp)
    target_link_libraries(streamflow_tests PRIVATE streamflow_core GTest::gtest_main)
    add_test(NAME CoreTests COMMAND streamflow_tests)
endif()
