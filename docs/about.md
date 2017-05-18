# About

> NodeJS ⇆ Objective-C bridge _(experimental)_

## Example:

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

## Documentation
- [Automatic type conversion](/objc/automatic-type-conversion.html)
- [Constants](/objc/constants.html)
- [Converting objects](/objc/converting-objects.html)
- [Pass by reference](/objc/pass-by-reference.html)
