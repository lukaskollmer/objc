# objc [![Build Status](https://travis-ci.org/lukaskollmer/objc.svg?branch=master)](https://travis-ci.org/lukaskollmer/objc)

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
let localizedDate = String(NSDateFormatter.localizedStringFromDate_dateStyle_timeStyle_(now, 2, 2));

console.log(localizedDate); // -> "19. Apr 2017, 22:41:13"

```

## How does this work?
The `objc` NodeJS module is accessing the [Objective-C runtime](https://developer.apple.com/reference/objectivec/objective_c_runtime) via a C++ Addon.

## API

#### `objc.import(name)`
Import a framework by it's name. `Foundation` is automatically imported when the `objc` module is loaded


#### `objc.NAME`
Load an Objective-C class simply by accessing it as a property of `objc`. This works really well for destructuring, allowing you to import all classes you want to use at once. (See the [example](#usage) above)


#### `objc.classExists(name)`
Check if a class named `name` is registered with the Objective-C runtime;


### Calling methods

**Method calling convention:**
To call an Objective-C method, just call that method on the proxy object. You need to replace all colons (`:`) in the method name with underscores (`_`);
```js
let NSString = objc.NSString;

let hello = NSString.stringWithString_("Hello, World!");
```


## Automatic type conversion
When calling Objective-C methods, argument and return types will automatically be converted from native JavaScript types to the expected Objective-C type (and vice versa):

| Objective-C type  | JavaScript type     |
| ----------------- | ------------------- |
| `id`              | `objc.Proxy` object |
| `NSString`        | `String` object     |
| `NSNumber`        | `Number` object     |
| `NSDate`          | `Date` object       |
| `int`             | `Number` object     |
| `BOOL`            | `Boolean` object    |
| `SEL`             | `String` object     |
| `Class`           | `objc.Proxy` object |

There are some limitations to this: All non-primitive return values are returned wrapped in an `objc.Proxy` instance. If you want to convert an `NSString` proxy to a native JavaScript `String` instance, just pass it to JavaScript's `String` function:
```js
let greeting = NSString.stringWithString_("Hello, World!");
let string = String(greeting); // This is now a native JavaScript string
```

Same applies to `NSNumber` instances:
```js
let age = NSNumber.numberWithInt_(18);
let number = Number(age); // This is now a native JavaScript number
```

## TODO
This isvery much still work in progress and there's a bunch of stuff that either doesn't work or still needs to be implemented:
- [ ] `Date` ⇆ `NSDate` conversion
- [ ] `NSArray` enumeration
- [ ] `NSDictionary` ⇆ `Object` conversion
- [ ] Blocks
- [ ] Fix seemingly random "misaligned pointer" crashes
- [ ] Support selectors that contain underscores
- [ ] Implement class creation
- [ ] Implement Method swizzling on existing Objective-C classes


## License

MIT © [Lukas Kollmer](https://lukas.vip)
