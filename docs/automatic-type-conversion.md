# Automatic type conversion

When you pass objects to an Objective-C method, the `objc` module will automatically try to convert them to the expected type.

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