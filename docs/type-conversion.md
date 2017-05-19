# Type conversion

## Automatic type conversion

When you pass JavaScript objects (like strings, numbers, dates, etc) to an Objective-C method, the `objc` node module will attempt to convert these parameters to the expected Objective-C type.

Let's say you have the following method signature:

```objc
- (int)numberOfOccurrences:(NSString *);
```

You can just pass a JavaScript String and it will automatically be converted to an `NSString *` object:
```js
let count = anObject.numberOfOccurrences_("hello world");
```

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

**Note:**

When an Objective-C method expects a `Class` parameter, you can also pass a `String` and the `objc` node module will automatically pass the corresponding `Class` object.


<br>
<br>

## Type conversion API

The `objc` module also provides functions to convert JavaScript objects to their Objective-C counterpart and vice-versa.

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

let objcArray = objc.ns(array);     // => NSArray of NSStrings
let jsArray   = objs.js(objcArray); // => JS Array of NSStrings
```

Line 3 bahaves as expected (`objc.ns(array)` returns a `NSArray*` containing `NSString*` objects).
Line 4 however does not return a JavaScript `Array` containing JavaScript `String` objects, as one might expect, but a JavaScript `Array` containing `NSString*` objects.

