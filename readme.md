# objc [![Build Status](https://img.shields.io/travis/lukaskollmer/objc.svg?style=flat-square)](https://travis-ci.org/lukaskollmer/objc) [![npm](https://img.shields.io/npm/v/objc.svg?style=flat-square)](https://www.npmjs.com/package/objc) [![node](https://img.shields.io/node/v/objc.svg?style=flat-square)](https://www.npmjs.com/package/objc)

> NodeJS ↔ Objective-C bridge _(experimental)_


## Install

For now, install from: https://github.com/hhas/objc

```
$ npm install --save objc
```


## Usage

```js
const objc = require('objc');

const {
  NSDate,
  NSDateFormatter
} = objc;


let now = NSDate.date()
let localizedDate = NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2);

console.log(localizedDate); // -> "19. Apr 2022, 22:41:13"

```

### Topics
- [API](#api)
- [Calling Methods](#calling-methods)
- [Inout Parameters](#inout-parameters)
- [Constants](#constants)
- [Blocks](#blocks)
- [Functions](#functions)
- [Structs](#structs)
- [Custom Classes](#custom-classes)

### API

##### `objc.import(bundleName)`

Import an Objective-C framework. For example:

```js
const objc = require('objc');
objc.import('AppKit');
```

Foundation is always imported by default.

##### `objc.ns(object, [resultIfUnconverted])`

Convert a JavaScript object to its objc equivalent.
Takes an optional second parameter that determines the result if object is not converted. This may be a function that takes the object as its argument and returns its objc equivalent, an objc value, or `null`. If omitted, throws `TypeError`.

##### `objc.js(object, [resultIfUnconverted])`

Convert an objc object to its JavaScript equivalent.
Takes an optional second parameter that determines the result if object is not converted. This may be a function that takes the object as its argument and returns its JS equivalent, a JS value, or `null`. If omitted, returns the object as-is.

##### `objc.NAME`

Get an ObjC class. For example:

```js
objc.NSString
objc.NSMutableArray
```

The framework for that class must be imported first or an `Error` will be thrown.

#### `objc.auto(fn, ...args)`

Create an autorelease pool before calling a function, `fn`, automatically draining the pool after the function returns or errors. Any additional arguments are passed to the function.

### Calling methods

_TO DO: array, union, bitwise types_

When calling Objective-C methods:

- replace any underscores in the selector with double underscores, e.g. `"foo_barBaz"` becomes `"foo__barBaz"`
- replace the colons in the selector with underscores, e.g. `"bar:fubZim:"` becomes `"bar_fubZim_"`

For example, this JavaScript code:

```js
const objc = require('objc');
objc.import('AppKit');

const {NSPasteboard, NSPasteboardTypeString} = objc;

const pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

pasteboard.setString_forType_("44 > 45", NSPasteboardTypeString);
```

is equivalent to the following Objective-C code:

```objc
#import <AppKit/AppKit.h>

NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
[pasteboard declareTypes:@[NSPasteboardTypeString] owner:nil];

[pasteboard setString:@"44 > 45" forType:NSPasteboardTypeString];
```

### Inout arguments

If a method expects an `inout`/`out` argument (e.g. `NSError**`), use an `objc.Ref` instance:

```js
const {NSAppleScript, Ref} = objc;

const script = NSAppleScript.alloc().initWithSource_('get foobar');

const error = new Ref();
script.executeAndReturnError_(error); // `executeAndReturnError:` takes a `NSDictionary**`

console.log(error.deref()); // `error` is now a `NSDictionary*`
```

Output:

```
[objc {
  NSAppleScriptErrorBriefMessage = "The variable foobar is not defined.";
  NSAppleScriptErrorMessage = "The variable foobar is not defined.";
  NSAppleScriptErrorNumber = "-2753";
  NSAppleScriptErrorRange = "NSRange: {0, 6}";
}]
```

The `Ref` constructor optionally takes an "in" value as argument. This can be an objc object, JS value, or null (the default). On return, call its `deref` method to obtain the out value.


### Constants

You can load ObjC constants (typically `NSString*`) just like you'd access a class:

```js
const objc = require('objc');

console.log(objc.NSFontAttributeName);   // => 'NSFont'
```

ObjC constants are returned as objc objects.


### Blocks

_TO DO: finalize API_

Use `objc.defineBlock(encoding[,...names])` to define a block's  [type encoding](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/Articles/ocrtTypeEncodings.html), optionally followed by any human-readable names for that type:

```js
objc.defineBlock('q@@@', 'NSComparator');
```

When creating a block, you need to explicitly declare the type encoding of the block's return value and all its parameters.

**Example:** Sort an array by word length, longest to shortest

```js
const objc = require('objc');

objc.defineBlock('q@@@', 'NSComparator');


const array = NSArray.arrayWithArray_(['I', 'Am', 'The', 'Doctor']);

const longestToShortest = new objc.NSComparator(
                  (thing1, thing2) => {
                    return thing1.length() < thing2.length() ? -1 : +1;
                  });

const sorted = array.sortedArrayUsingComparator_(longestToShortest);
// => ['Doctor', 'The', 'Am', 'I']
```


### Functions

_TO DO: implement `wrapFunction(name,encoding)`_

e.g. `NSStringFromRect`

### Structs

_TO DO: finalize StructType implementation_

Use `obj.defineStruct(encoding[,...names])` function to define a struct by its name and layout. The resulting `StructType` is available as `objc.NAME`. It is also compatible with the `ffi-napi`, `ref-napi`, `ref-struct-di` modules.

The `objc` module already provides definitions for the following:

* `NSPoint`
* `NSSize`
* `NSRect`
* `NSRange`

Use `new StructType(object)` to create an instance of the struct, passing an object to populate the struct. (Note: missing fields are set to `0`/`null`.)

**Example:** Using structs with objc methods

```js
const objc = require('objc');

const string = objc.ns('Hello World');
const substring = string.substringWithRange_(new objc.NSRange({location: 0, length: 5}));
// => 'Hello'
```


### Custom Classes

_TO DO: API is not finalized_

Use the `objc.defineClass` function to register a custom class with the Objective-C runtime:

```js
const objc = require('objc');

const LKGreeter = objc.defineClass('LKGreeter', 'NSObject', {
  // define the ObjC type encodings
  
  greet_: '@@:@', // -(id)greet:(id)
}, {
  // define the method implementations
  
  greet_: (self, name) => {
    return `Hello, ${name}!`;
  },
});

LKGreeter.new().greet_('Lukas'); // => 'Hello, Lukas!'
```

The method's type encoding consists of the return type (in this example, `@`), followed by the target (always `@`) and selector (always `:`) arguments, followed by any additional arguments (in this example, `@`) to be passed to the method.

The method function should take the target object (`self`) as its first argument, followed by any additional arguments. The selector argument is omitted.

To define class methods, prefix the method name with `$`, e.g.:

* `$foo_bar_` => class method `foo:bar:`

* `foo_bar_` => instance method `foo:bar:`

**Note:** You might have to specify individual offsets in the type encoding, see [this example](/examples/delegate.js).

## Roadmap
In the future, I'd like to add support for:
- varargs
- c-style arrays, unions as method parameter/return type
- runtime introspection (accessing an object's properties, ivars, methods, etc)
- improved class creation api
- thread-safe

## License
MIT © [Lukas Kollmer](https://lukaskollmer.me)
