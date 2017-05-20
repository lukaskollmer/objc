# Loading ObjC constants

You can load `NSString *` constants exported by Objective-C frameworks either via the `objc.constant(name, [bundleId])` function, or simply by accessing the constant directly via its name (the same way you'd load a class).

### objc.CONSTANT_NAME
Load a constant. This will return a `String` object.

### objc.constant(name, [bundleId]) -> string
`name`: Name of the constant you want to load  
`bundleId` (optional): Name of the bundle (framework) you want to load the constant from. You need to import the bundle first (via `objc.import(bundleId)`)  

**Note:** This is the recommended way to load a constant. By specifying a bundle, we can increase performance by up to 400x

## Example
```js
objc.NSFontAttributeName; // -> 'NSFont'                         (~20ms)
objc.constant('NSFontAttributeName', 'AppKit'); // -> 'NSFont'   (~0.05ms)
```
