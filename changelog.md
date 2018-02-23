### v0.12.0 (2018-02-23)
- Added support for loading `NSString*` constants
- Cache imported frameworks to avoid loading the same framework multiple times

### v0.11.0 (2018-02-20)
- Better handling of null return values
- Iterate over `NSSet` instances

### v0.10.0 (2018-01-30)
- Rewrote everything in JavaScript (no more c++ bindings)
- This removes support for accessing objc constants (will be re-implemented in the future)

### v0.6.0 (2017-06-25)
- Added Block support

### v0.5.0 (2017-06-19)
- Exception handling
- Allow omitting the last underscore in method calls

### v0.4.0 (2017-05-20)
**New**
- JavaScript Arrays passed to ObjC methods will now automatically be converted to `NSArray *` instances
- Added `objc.ns` and `objc.js` functions to convert compatible objects (`String` <-> `NSString`, `Date` <-> `SDate`, etc.)
- Added support for iterating over enumerable Objective-C objects (using `objectEnumerator`)
- Implemented Selector resolving, meaning that you now can call objc methods that contain an underscore
- Added a bunch of documentation
- Added a bunch of tests

**Changed**
- Explicitly require C++14
- Removed NodeJS v6.x support (incompatible w/ C++14)

**Fixed**
- Fixed the random "misaligned pointer" bug
- Logging an ObjCProxy holding a `nil` object no longer crashes the node process

### v0.3.0 (2017-05-10)
- Added basic support for inout parameters (like `NSError **`)

### v0.2.0 (2017-04-22)
- Added the `constant(name, [bundle])` function to load an ObjC string constant
- Constants can also be accessed directly from the module, the same way as classes are loaded

### v0.1.0 (2017-04-19)
- Initial release
