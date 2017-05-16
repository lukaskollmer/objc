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
      ]
    }
  ]
}