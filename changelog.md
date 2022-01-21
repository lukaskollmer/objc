### v0.23.0 (2022-01-21)
- Added a cache for parsed type encodings, which should result in somewhat better performance
- `objc.import` now checks whether a bundle actually exists, and throws an error if it doesn't
- `objc.import` now returns whether the bundle import was successful or not
- Changed how `BOOL` and `char` return values are handled. On x86, `BOOL`s are now always returned as numbers (simple `if` checks should be unaffected by this), and on ARM they are returned as JS `Boolean`s


### v0.22.0 (2021-11-17)
- Improve support for struct parameters in blocks
- Improve support for inout (e.g. `BOOL*`) parameters in blocks
- Fix a crash when printing a (proxied) instance of a class implementing neither `-description` nor `-debugDescription`

### v0.21.0 (2021-08-27)
- Switch to node-ffi-napi, ref-napi, and ref-struct-di
- Remove exception support
- Update node version requirements

### v0.20.0 (2019-07-16)
- Added a struct compound initializer (see block.js for a usage example)
- Updated a bunch of outdated dependencies, removed some dependencies

### v0.19.0 (2019-01-01)
- Updated the ffi module
- Updated supported node versions to >=8
- Updated the framework loading code to use `NSBundle` instead of `dlopen`

### v0.18.0 (2018-10-15)
- Added struct support
- Improved type encoding handling

### v0.17.0 (2018-07-03)
- Added `Instance.isNull` (also exposed as `objc.isNull`) to check whether a `Instance` is holding a null pointer
- Renamed `ptr` to `__ptr` to indicate that it's an internal field

### v0.16.0 (2018-06-28)
- fixed a bug where passing a `objc.InstanceProxy` to `objc.ns` would return an empty JS object

### v0.15.0 (2018-06-07)
- Added `objc.createClass`
- The `objc.Selector` constructor can now also be called w/ a `SEL` pointer

### v0.14.0 (2018-04-15)
- Implemented inout parameters
- Dropped support for node 7.x

### v0.13.0 (2018-04-06)
- Added a `objc.swizzle` function

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
