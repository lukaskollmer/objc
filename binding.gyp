{
  "targets": [
    {
      "target_name": "objc",
      "sources": [
        "src/binding/objc.cc",
        "src/binding/Proxy.cc",
        "src/binding/Block.cc",
        "src/binding/utils.cc",
        "src/binding/Invocation.cc",
        "src/binding/constants.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "defines": [
        "__OBJC2__=1"
      ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": [
          "-std=c++14",
          "-stdlib=libc++"
        ]
      }
    }
  ]
}