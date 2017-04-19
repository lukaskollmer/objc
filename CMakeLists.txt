cmake_minimum_required(VERSION 3.7)
project(objc)

set(CMAKE_CXX_STANDARD 11)

set(SOURCE_FILES
    src/binding/objc.cc
    src/binding/utils.cc
    src/binding/utils.h
    src/binding/objc_call.cpp
    src/binding/objc_call.h
    src/binding/Proxy.cc
    src/binding/Proxy.h
    src/binding/Invocation.cc
    src/binding/Invocation.h)

include_directories(
        /usr/local/include/node/
        node_modules/nan/
)

add_executable(objc ${SOURCE_FILES})