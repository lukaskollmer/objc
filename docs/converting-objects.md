# Converting objects

The `objc` module provides functions to convert JavaScript objects to their Objective-C counterpart and vice-versa.

### `objc.ns(input)`
Convert a JavaScript object to its corresponding Objective-C type.
This will return `input` if there is no suitable Objective-C type.

### `objc.js(input)`
Convert an Objective-C object to its corresponding JavaScript type.
This will return `input` if there is no suitable JavaScript type.

## Types

| JavaScript type       | Objective-C type |
| --------------------- | ---------------- |
| `String`              | `NSString`       |
| `Number`<br>`Boolean` | `NSNumber`       |
| `Array`               | `NSArray`        |
| `Date`                | `NSDate`         |


**Note:**
1) Consider the following example:
```js
let array = ['hey', 'missy', 'you', 'so', 'fine'];

let objcArray = objc.ns(array);
let jsArray   = objs.js(objcArray);
```

Line 3 bahaves as expected (`objc.ns(array)` returns a `NSArray*` containing `NSString*` objects).
Line 4 however does not return a JavaScript `Array` containing JavaScript `String` objects, as one might expect, but a JavaScript `Array` containing `NSString*` objects.

