# Exception handling

The `objc` module automatically catches all exceptions thrown by Objective-C methods and rethrows them as JavaScript errors.

Example:
```js
const {NSMutableArray} = require('objc');

const array = NSMutableArray.array();

array.addObject_('Hello');
array.addObject_('World');

array.addObject_(null);
// -> throws 'NSInvalidArgumentException *** -[__NSArrayM insertObject:atIndex:]: object cannot be nil'
```
