{
  "targets": [
    {
      "target_name": "objc",
      "sources": [
        "src/binding/objc.cc",
        "src/binding/Proxy.cc",
        "src/binding/utils.cc",
        "src/binding/objc_call.cpp",
        "src/binding/Invocation.cc"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
      ],
      "libraries": [
	  ]
    }
  ]
}