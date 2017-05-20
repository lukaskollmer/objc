# API

### objc.import(bundleId)
Load a framework into the node process.

```js
objc.NSPasteboard; // => undefined

objc.import('AppKit');

objc.NSPasteboard; // => [objc.ClassProxy NSPasteboard]
```

### objc.classExists(name)
Check if a class with the name `name` is registered with the Objective-C runtime

### objc.constant(name, bundle)
Load an Objective-C constant
```js
objc.constant('NSFontAttributeName', 'AppKit');
// -> 'NSFont'
```

**Note:** You can find more information on the [Loading Objective-C constants](https://lukaskollmer.github.io/objc/loading-objc-constants.html) page.


### objc.ref(object)
Wrap an object so that it can be passed by reference

### objc.deref(object)
Unwrap an object wrapped via `objc.ref`

### objc.ns(object)
Convert a JavaScript object to it's corresponding Objective-C type
```js
let str1 = String('hello world');

let str2 = objc.ns(str1);
// => [objc.InstanceProxy hello world]
```

### objc.js(object)
Convert an Objective-C object to it's JavaScript counterpart
```js
let now1 = NSDate.date();

let now2 = objc.js(now1);
// => '2017-05-20T05:33:06.083Z'
```

**Note:** You can find more information about `objc.ns` and `objc.js` on the [Type conversion](https://lukaskollmer.github.io/objc/type-conversion.html) page.
