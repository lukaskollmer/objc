# Pass by reference

It's [common practice](https://developer.apple.com/library/content/documentation/Cocoa/Conceptual/ProgrammingWithObjectiveC/ErrorHandling/ErrorHandling.html) for Objective-C methods to pass back errors by reference.

In the `objc` node module, this is implemented via two helper methods: `objc.ref` and `objc.deref`:

### `objc.ref(value)`
Wraps `value` in a wrapper object that can be passed to Objective-C methods.

### `objc.deref(object)`
Returns the object wrapped by `objc.ref`

## Example:

```js
const {NSFileManager} = objc;

const filepath = '/path/that/doesnt.exist';

let error = objc.ref(null);
let success = NSFileManager.defaultManager().removeItemAtPath_error_(filepath, error);

console.log(success, objc.deref(error));
// => false, [objc.InstanceProxy Error Domain=NSCocoaErrorDomain Code=4 "“doesnt.exist” couldn’t be removed." UserInfo={NSFilePath=/path/that/doesnt.exist, NSUserStringVariant=(Remove), NSUnderlyingError=0x104005130 {Error Domain=NSPOSIXErrorDomain Code=2 "No such file or directory"}}]

```

## Implementation details

When a JavaScript function makes changes to a passed object, these changes only persist within the function's scope. However, changes made to properties of a passed object do also persist outside the function's scope. This is called [call-by-sharing](https://en.wikipedia.org/wiki/Evaluation_strategy#Call_by_sharing).

`objc.ref` simply wraps the passed value in a JavaScript object (`{ref: passedValue}`), so that the `objc` module's native binding can set the `ref` property to the object passed back by an Objective-C method.

`objc.deref` just returns the value wrapped in that object.
