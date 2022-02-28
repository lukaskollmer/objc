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

console.log(localizedDate); // -> "19. Apr 2017, 22:41:13"

```

### Topics
- [API](#api)
- [Calling Methods](#calling-methods)
- [Blocks](#blocks)
- [Constants](#constants)
- [Structs](#structs)
- [Inout Parameters](#inout-parameters)
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

### Calling methods

_TO DO: struct, array, union, bitwise types_

When calling Objective-C methods:

- replace any underscores in the selector with double underscores, e.g. `"foo_barBaz"` becomes `"foo__barBaz"`
- replace the colons in the selector with underscores, e.g. `"bar:fubZim:"` becomes `"bar_fubZim_"`

For example, this Objective-C code:

```objc
#import <AppKit/AppKit.h>

NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
[pasteboard declareTypes:@[NSPasteboardTypeString] owner:nil];

[pasteboard setString:@"44 > 45" forType:NSPasteboardTypeString];
```

is equivalent to the following JavaScript code:

```js
const objc = require('objc');
objc.import('AppKit');

const {NSPasteboard, NSPasteboardTypeString} = objc;

const pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

pasteboard.setString_forType_("44 > 45", NSPasteboardTypeString);
```

### Inout arguments

If a method expects an `inout` or `out` argument (e.g. `NSError**`), use an `objc.Ref` instance:

```js
const {NSAppleScript, Ref} = objc;

const script = NSAppleScript.alloc().initWithSource_('foobar');

const error = new Ref();
script.executeAndReturnError_(error); // `executeAndReturnError:` takes a `NSDictionary**`

console.log(error.deref()); // `error` is now a `NSDictionary*`
```

Output:

```
[objc.InstanceProxy {
    NSAppleScriptErrorBriefMessage = "The variable foobar is not defined.";
    NSAppleScriptErrorMessage = "The variable foobar is not defined.";
    NSAppleScriptErrorNumber = "-2753";
    NSAppleScriptErrorRange = "NSRange: {0, 6}";
}]
```

The `Ref` constructor optionally takes an "in" value as argument. This can be an objc object, JS value, or null (the default). On return, call its `deref` method to obtain the out value.


### Blocks

_TO DO: finalize and test_

You can create a block with the `objc.Block` helper class:

```js
const block = new objc.Block(() => {
  console.log('In the block!');
}, 'v');
```

When creating a block, you need to explicitly declare the type encoding of the block's return value and all its parameters. (For now, use ref-napi types.)

**Note:** If a block takes an Objective-C object (pointer) as its parameter, you currently need to manually wrap that pointer as an objc object using the `objc.__internal__.wrap(ptr)` helper function.

**Example:** Sort an array by word length, longest to shortest

```js
const objc = require('objc');
const internal = objc.__internal__;
const types = internal.types;

const array = NSArray.arrayWithArray_(['I', 'Am', 'The', 'Doctor']);

const longestToShortest = new Block((arg1, arg2) => {
  arg1 = internal.wrap(arg1);
  arg2 = internal.wrap(arg2);
  return arg1.length() > arg2.length() ? -1 : 1;
}, types.NSInteger, [types.id, types.id]);  // Match the NSComparator signature

const sorted = array.sortedArrayUsingComparator_(longestToShortest);
// => ['Doctor', 'The', 'Am', 'I']
```


### Constants

You can load ObjC constants (typically `NSString*`) just like you'd access a class:

```js
const {NSFontAttributeName} = objc;
console.log(NSFontAttributeName);   // => 'NSFont'
```

ObjC constants are returned as objc objects.


### Structs

Use `objc.structs.define(encoding)` function to define a struct by its name and layout. The resulting `StructType` is available as `objc.structs.NAME`. It is also compatible with the `ffi-napi`, `ref-napi`, `ref-struct-di` modules.

The `objc` module already provides definitions for the following:

* `NSPoint`
* `NSSize`
* `NSRect`
* `NSRange`

Use `new StructType(OBJECT)` to create an instance of the struct, passing an object to populate the struct. (Note: missing fields are set to `0`/`null`.)

**Example:** Using structs with objc methods

```js
const objc = require('objc');

const string = objc.ns('Hello World');
const substring = string.substringWithRange_(new objc.structs.NSRange({location: 0, length: 5}));
// -> 'Hello'
```


### Custom Classes

_TO DO: API is not finalized_

Use the `objc.createClass` function to register custom classes with the Objective-C runtime:

```js
const objc = require('objc');
const internal = objc.__internal__;

const LKGreeter = objc.createClass('LKGreeter', 'NSObject', {
  'greet:': (self, cmd, name) => {
    name = internal.wrap(name);
    return objc.ns(`Hello, ${name}!`);
  },

  _encodings: {
    'greet:': ['@', ['@', ':', '@']]
  }
});

LKGreeter.new().greet('Lukas'); // => 'Hello, Lukas!'
```

**Note:** You might have to specify individual offsets in the type encoding, see [this example](/examples/delegate.js).

## Roadmap
In the future, I'd like to add support for:
- c-style arrays, unions as method parameter/return type
- runtime introspection (accessing an object's properties, ivars, methods, etc)
- improved class creation api

## License
MIT © [Lukas Kollmer](https://lukaskollmer.me)
