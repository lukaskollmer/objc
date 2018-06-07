# objc [![Build Status](https://img.shields.io/travis/lukaskollmer/objc.svg?style=flat-square)](https://travis-ci.org/lukaskollmer/objc) [![Coverage Status](https://img.shields.io/coveralls/lukaskollmer/objc.svg?style=flat-square)](https://coveralls.io/github/lukaskollmer/objc?branch=master) [![npm](https://img.shields.io/npm/v/objc.svg?style=flat-square)](https://www.npmjs.com/package/objc) [![node](https://img.shields.io/node/v/objc.svg?style=flat-square)](https://www.npmjs.com/package/objc)

> NodeJS ⇆ Objective-C bridge _(experimental)_


## Install

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


### API

#### objc.import(bundleName)
Load a framework

#### objc.ns(object, [hint = '@'])
Convert a JavaScript object to its objc equivalent. Returns `null` if the object doesn't have an ObjC counterpart  
Takes an optional second parameter to specify whether strings should be converted to `NSString` objects (default), `SEL` or `Class`

#### objc.js(object, [returnInputIfUnableToConvert = false])
Convert an objc object to its JavaScript equivalent
Takes an optional second parameter indicating whether it should return `null` or the input if the object doesn't have a JS counterpart

**Type Conversion**

| JavaScript | Objective-C  |
| :--------- | :----------- |
| String     | NSString     |
| Date       | NSDate       |
| Number     | NSNumber     |
| Array      | NSArray      |
| Object     | NSDictionary |


### Calling methods

When calling Objective-C methods, all you need to do is replace the colons in the selector with underscores.

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

let pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

pasteboard.setString_forType_("44 > 45", NSPasteboardTypeString);
```


### Exception handling

The `objc` module automatically catches all exceptions thrown by Objective-C methods and rethrows them as JavaScript errors.

Example:
```js
const {NSMutableArray} = objc;
const array = NSMutableArray.array();

array.addObject_(null);
// -> throws 'NSInvalidArgumentException *** -[__NSArrayM insertObject:atIndex:]: object cannot be nil'
```


### Blocks

You can create a block with the `objc.Block` helper class:
```js
const block = new objc.Block(() => {
  console.log('In the block!');
}, 'v', []);
```

When creating a block, you need to explicitly declare the type encoding of the block's return value and all its parameters.

**Note**  
When a block takes an Objective-C object as its parameter, you'll need to manually wrap that object in an `objc.Proxy` (via the `objc.wrap` helper function).

<br>

**Example:** Sort an array by word length, longest to shortest
```js
const {NSArray, Block, wrap} = objc;
const array = NSArray.arrayWithArray_(['I', 'Am', 'The', 'Doctor']);

const block = new Block((obj1, obj2) => {
  obj1 = wrap(obj1);
  obj2 = wrap(obj2);
  return obj1.length() > obj2.length() ? -1 : 1;
}, 'q', ['@', '@']);  // NSComparator returns a NSInteger and takes two ids

const sorted = array.sortedArrayUsingComparator_(block);
// => ['Doctor', 'The', 'Am', 'I']
```

### Constants
You can load `NSString*` constants just like you'd access a class:

```js
const {NSFontAttributeName} = objc;
console.log(NSFontAttributeName);   // => 'NSFont'
```

`NSString*` constants are returned as native JavaScript `String` objects.


### Method swizzling
Method swizzling allows you to replace a method's implementation:
```js
const {NSProcessInfo} = objc;
objc.swizzle(NSProcessInfo, 'processorCount', (self, _cmd) => {
  return 12;
});

NSProcessInfo.processInfo().processorCount(); // => 12
```

The method's original implementation is still available, with the `xxx__` prefix:

```js
const {NSDate, wrap} = objc;
objc.swizzle(NSDate, 'dateByAddingTimeInterval:', (self, _cmd, timeInterval) => {
  self = wrap(self);
  return self.xxx__dateByAddingTimeInterval_(timeInterval * 2);
});

const now = NSDate.date();
const a = now.dateByAddingTimeInterval_(2);
const b = now.xxx__dateByAddingTimeInterval_(4);

a.isEqualToDate_(b); // => true
```
**Note**
- Just like with blocks, you have to `wrap` all non-primitive parameters
- If you want to swizzle a class method, pass `'class'` as the `swizzle` function's last parameter
- `objc.swizzle` returns a function that - if called - restores the original implementation of the swizzled method

### Inout parameters
If a method expects an inout parameter (like `NSError**`), you can use the `objc.allocRef` function to get a pointer to a `nil` objc object that can be passed to a method expecting an `id*`:
```js
const {NSAppleScript} = objc;

const script = NSAppleScript.alloc().initWithSource_('foobar');

const error = objc.allocRef();
script.executeAndReturnError_(error); // `executeAndReturnError:` takes a `NSDictionary**`

console.log(error); // `error` is now a `NSDictionary*`
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
If you need more advanced inout functionality (using primitive types, etc), simply use the [`ref`](https://github.com/TooTallNate/ref) module.

### Custom Classes
Use the `objc.createClass` function to register custom classes with the Objective-C runtime:
```js
const objc = require('objc');

const LKGreeter = objc.createClass('LKGreeter', 'NSObject', {
  'greet:': (self, cmd, name) => {
    name = objc.wrap(name);
    return objc.ns(`Hello, ${name}!`);
  },

  _encodings: {
    'greet:': ['@', ['@', ':', '@']]
  }
});

LKGreeter.new().greet('Lukas'); // => 'Hello, Lukas!'
```
**Note**: You might have to specify individual offsets in the type encoding, see [this example](/examples/delegate.js).

## Roadmap
In the future, I'd like to add support for:
- runtime introspection (accessing an object's properties, ivars, methods, etc)


## License

MIT © [Lukas Kollmer](https://lukaskollmer.me)
