### v0.4.0 (2017-05-20)
- [New] JavaScript Arrays passed to ObjC methods will now automatically be converted to `NSArray *` instances
- [New] Added `objc.ns` and `objc.js` functions to convert compatible objects (`String` <-> `NSString`, `Date` <-> N`SDate`, etc.)
- [New] Added support for iterating over enumerable Objective-C objects (using `objectEnumerator`)
- [New] Implemented Selector resolving, meaning that you now can call objc methods that contain an underscore
- [New] Added a bunch of documentation
- [New] Added a bunch of tests

- [Change] Explicitly require C++14
- [Change] Removed NodeJS v6.x support (incompatible w/ C++14)

- [Fixed] Fixed the random "misaligned pointer" bug
- [Fixed] logging an ObjCProxy holding a `nil` object no longer crashes the node process

### v0.3.0 (2017-05-10)
- Added basic support for inout parameters (like `NSError **`)

### v0.2.0 (2017-04-22)
- Added the `constant(name, [bundle])` function to load an ObjC string constant
- Constants can also be accessed directly from the module, the same way as classes are loaded

### v0.1.0 (2017-04-19)
- Initial release
