{
  "targets": [
    {
      "target_name": "objc",
      "sources": [
        "src/binding/objc.cc",
        "src/binding/Proxy.cc",
        "src/binding/utils.cc",
        "src/binding/Invocation.cc",
        "src/binding/constants.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "cflags": [
        "-std=c++14",
        "-stdlib=libc++"
      ],
      "xcode_settings": {
        "OTHER_CFLAGS": [
          "-std=c++14",
          "-stdlib=libc++"
        ]
      }
    }
  ]
}